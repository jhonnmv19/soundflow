import ytdl from '@distube/ytdl-core';

export const config = {
  api: {
    responseLimit: false, // Permite streams/buffers sin límite de peso
  },
};

// 1. Cargar cookies de YouTube si están definidas
let agent;
if (process.env.YOUTUBE_COOKIES) {
  try {
    const cookies = JSON.parse(process.env.YOUTUBE_COOKIES);
    agent = ytdl.createAgent(cookies, { piping: true });
  } catch (e) {
    console.warn('[YTDL] Error al parsear YOUTUBE_COOKIES:', e.message);
  }
}

export default async function handler(req, res) {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-Audio-Title, X-Audio-Artist, X-Audio-Duration, X-Audio-Thumbnail, Content-Length, Content-Disposition'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Proporciona una URL válida de YouTube.' });
  }

  // --- INTENTO 1: YTDL-CORE CON COOKIES ---
  if (ytdl.validateURL(url)) {
    try {
      const info = await ytdl.getInfo(url, agent ? { agent } : {});

      const rawTitle = info.videoDetails.title || 'Audio SoundFlow';
      const rawArtist = info.videoDetails.author?.name || 'YouTube';

      const title = encodeURIComponent(rawTitle.replace(/[^\w\s-]/gi, ''));
      const artist = encodeURIComponent(rawArtist.replace(/[^\w\s-]/gi, ''));
      const duration = info.videoDetails.lengthSeconds || '0';
      const thumbnail = encodeURIComponent(info.videoDetails.thumbnails?.[0]?.url || '');

      const format = ytdl.chooseFormat(info.formats, {
        quality: 'highestaudio',
        filter: 'audioonly',
      });

      if (format) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
        res.setHeader('X-Audio-Title', title);
        res.setHeader('X-Audio-Artist', artist);
        res.setHeader('X-Audio-Duration', duration);
        res.setHeader('X-Audio-Thumbnail', thumbnail);

        if (format.contentLength) {
          res.setHeader('Content-Length', format.contentLength);
        }

        const audioStream = ytdl.downloadFromInfo(info, {
          format: format,
          agent: agent,
        });

        audioStream.pipe(res);

        audioStream.on('error', (err) => {
          console.error('[YTDL Stream Error]:', err);
        });

        return; // Finaliza si YTDL funcionó correctamente
      }
    } catch (ytdlError) {
      console.warn('[YTDL Falló - Usando Cobalt API optimizado]:', ytdlError.message);
    }
  }

  // --- INTENTO 2: COBALT API CON HEADERS DE NAVEGADOR Y RECUPERACIÓN DE FILENAME ---
  try {
    const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://cobalt.tools',
        'Referer': 'https://cobalt.tools/',
      },
      body: JSON.stringify({
        url: url,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        audioBitrate: '128',
      }),
    });

    if (!cobaltResponse.ok) {
      const errText = await cobaltResponse.text();
      throw new Error(`Error HTTP ${cobaltResponse.status}: ${errText}`);
    }

    const cobaltData = await cobaltResponse.json();

    if (cobaltData.status === 'error') {
      throw new Error(cobaltData.text || 'Error en Cobalt API');
    }

    const mediaUrl = cobaltData.url || (cobaltData.picker && cobaltData.picker[0]?.url);

    if (!mediaUrl) {
      throw new Error('No se obtuvo un enlace de audio válido.');
    }

    // Descarga del binario emulando navegador
    const audioFetch = await fetch(mediaUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    if (!audioFetch.ok) {
      throw new Error('No se pudo descargar el binario de audio desde la CDN.');
    }

    const arrayBuffer = await audioFetch.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Obtención del título real desde el nombre devuelto por Cobalt
    const rawFilename = cobaltData.filename || 'SoundFlow_Track';
    const cleanTitle = rawFilename.replace(/\.mp3$/i, '');
    const safeTitle = encodeURIComponent(cleanTitle);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
    res.setHeader('X-Audio-Title', safeTitle);
    res.setHeader('X-Audio-Artist', encodeURIComponent('YouTube Track'));
    res.setHeader('X-Audio-Duration', '0');
    res.setHeader('X-Audio-Thumbnail', '');
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[Convert API Error]:', error.message);
    return res.status(500).json({
      error: error.message || 'Error interno al procesar el audio.',
    });
  }
}