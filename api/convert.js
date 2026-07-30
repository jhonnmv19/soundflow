import ytdl from '@distube/ytdl-core';

export const config = {
  api: {
    responseLimit: false,
  },
};

// Cargar cookies de YouTube si existen en Vercel Env Vars
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
  // Cabeceras CORS
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

  const { url, quality = '192' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Proporciona una URL válida.' });
  }

  // --- INTENTO 1: YTDL-CORE ---
  if (ytdl.validateURL(url)) {
    try {
      const info = await ytdl.getInfo(url, agent ? { agent } : {});
      const rawTitle = info.videoDetails.title || 'SoundFlow Track';
      const rawArtist = info.videoDetails.author?.name || 'YouTube';

      const title = encodeURIComponent(rawTitle.replace(/[^\w\s-]/gi, ''));
      const artist = encodeURIComponent(rawArtist.replace(/[^\w\s-]/gi, ''));
      const duration = info.videoDetails.lengthSeconds || '0';
      const thumbnail = encodeURIComponent(info.videoDetails.thumbnails?.[0]?.url || '');

      const format = ytdl.chooseFormat(info.formats, {
        quality: 'highestaudio',
        filter: 'audioonly',
      });

      if (format && format.url) {
        // Redireccionar o streamear el audio de YouTube
        const audioFetch = await fetch(format.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
          }
        });

        if (audioFetch.ok) {
          const arrayBuffer = await audioFetch.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
          res.setHeader('X-Audio-Title', title);
          res.setHeader('X-Audio-Artist', artist);
          res.setHeader('X-Audio-Duration', duration);
          res.setHeader('X-Audio-Thumbnail', thumbnail);
          res.setHeader('Content-Length', buffer.length);

          return res.status(200).send(buffer);
        }
      }
    } catch (ytdlError) {
      console.warn('[YTDL Direct Falló - Probando API alternativa]:', ytdlError.message);
    }
  }

  // --- INTENTO 2: SERVICIO DE EXTRACCIÓN (INSTANCIAS COBALT / FALLBACK) ---
  const cobaltInstances = [
    'https://cobalt-api.kwiatek.xyz',
    'https://api.cobalt.tools',
    'https://cobalt-backend.jviguy.dev'
  ];

  for (const instance of cobaltInstances) {
    try {
      const response = await fetch(`${instance}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: quality || '192'
        })
      });

      // Si Cloudflare nos da 403, probamos la siguiente instancia
      if (response.status === 403 || !response.ok) {
        continue;
      }

      const data = await response.json();

      if (data.status === 'error' || (!data.url && !data.picker)) {
        continue;
      }

      const mediaUrl = data.url || (data.picker && data.picker[0]?.url);
      if (!mediaUrl) continue;

      // Descargamos el binario final
      const audioRes = await fetch(mediaUrl);
      if (!audioRes.ok) continue;

      const arrayBuffer = await audioRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const rawFilename = data.filename || 'SoundFlow_Audio';
      const cleanTitle = rawFilename.replace(/\.mp3$/i, '');
      const safeTitle = encodeURIComponent(cleanTitle);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
      res.setHeader('X-Audio-Title', safeTitle);
      res.setHeader('X-Audio-Artist', encodeURIComponent('Audio Track'));
      res.setHeader('X-Audio-Duration', '0');
      res.setHeader('X-Audio-Thumbnail', '');
      res.setHeader('Content-Length', buffer.length);

      return res.status(200).send(buffer);

    } catch (err) {
      console.warn(`[Error intentando instancia ${instance}]:`, err.message);
    }
  }

  // Si todas las opciones fallan
  return res.status(500).json({
    error: 'No se pudo procesar el enlace. YouTube / TikTok bloquearon la petición temporalmente.'
  });
}