import ytdl from '@distube/ytdl-core';

export const config = {
  api: {
    responseLimit: false, // Desactiva el límite de payload en respuestas Vercel
  },
};

// 1. Cargar las cookies desde las variables de entorno de Vercel
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

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'Proporciona una URL válida de YouTube.' });
  }

  // --- INTENTO 1: YTDL-CORE CON AGENTE DE COOKIES ---
  try {
    const info = await ytdl.getInfo(url, agent ? { agent } : {});

    // Sanitizar títulos y metadatos para evitar caracteres no válidos en cabeceras HTTP
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

    if (!format) {
      throw new Error('No se encontró formato de audio válido en ytdl-core.');
    }

    // Cabeceras HTTP para el cliente
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
    res.setHeader('X-Audio-Title', title);
    res.setHeader('X-Audio-Artist', artist);
    res.setHeader('X-Audio-Duration', duration);
    res.setHeader('X-Audio-Thumbnail', thumbnail);

    if (format.contentLength) {
      res.setHeader('Content-Length', format.contentLength);
    }

    // Streaming de audio directo
    const audioStream = ytdl.downloadFromInfo(info, {
      format: format,
      agent: agent,
    });

    audioStream.pipe(res);

    audioStream.on('error', (err) => {
      console.error('[YTDL Stream Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error durante la transmisión del audio.' });
      }
    });

    return; // Finaliza si YTDL tuvo éxito

  } catch (ytdlError) {
    console.warn('[YTDL Fallo - Intentando con Cobalt API]:', ytdlError.message);
  }

  // --- INTENTO 2: FALLBACK AUTOMÁTICO A COBALT API ---
  try {
    const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        audioBitrate: '128',
      }),
    });

    const cobaltData = await cobaltResponse.json();

    if (cobaltData.status === 'error') {
      throw new Error(cobaltData.text || 'Error devuelto por Cobalt API.');
    }

    if (cobaltData.status === 'redirect' || cobaltData.status === 'stream') {
      const audioBuffer = await fetch(cobaltData.url);
      const arrayBuffer = await audioBuffer.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const title = encodeURIComponent('Audio SoundFlow');
      
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
      res.setHeader('X-Audio-Title', title);
      res.setHeader('X-Audio-Artist', encodeURIComponent('YouTube Track'));
      res.setHeader('X-Audio-Duration', '180');
      res.setHeader('X-Audio-Thumbnail', '');
      res.setHeader('Content-Length', buffer.length);

      return res.status(200).send(buffer);
    }

    throw new Error('Respuesta no válida del servidor de Cobalt.');

  } catch (cobaltError) {
    console.error('[Cobalt API Error]:', cobaltError.message);
    return res.status(500).json({
      error: 'No se pudo procesar el video con ninguna de las opciones disponibles.',
    });
  }
}