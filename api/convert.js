import ytdl from '@distube/ytdl-core';

export const config = {
  api: {
    responseLimit: false, // Desactiva el límite de payload en respuestas Vercel
  },
};

// 1. Cargar las cookies desde la variable de entorno de Vercel
let cookies = [];
try {
  cookies = JSON.parse(process.env.YOUTUBE_COOKIES || '[]');
} catch (e) {
  console.warn('[YTDL] No se pudieron parsear las cookies de YOUTUBE_COOKIES.');
}

// 2. Crear el agente de cookies con @distube/ytdl-core
const agent = cookies.length > 0 ? ytdl.createAgent(cookies) : undefined;

export default async function handler(req, res) {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'Proporciona una URL válida de YouTube.' });
  }

  try {
    // 3. Obtener metadatos pasando el agente estructurado
    const info = await ytdl.getInfo(url, { agent });

    const title = info.videoDetails.title || 'Canción Desconocida';
    const artist = info.videoDetails.author?.name || 'Artista Desconocido';
    const duration = parseInt(info.videoDetails.lengthSeconds || '0', 10);
    const thumbnail = info.videoDetails.thumbnails?.[0]?.url || '';

    // Seleccionar formato de audio
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    if (!format) {
      return res.status(500).json({ error: 'No se encontró formato de audio para este video.' });
    }

    // Configurar cabeceras de respuesta HTTP
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.mp3"`);
    res.setHeader('X-Audio-Title', encodeURIComponent(title));
    res.setHeader('X-Audio-Artist', encodeURIComponent(artist));
    res.setHeader('X-Audio-Duration', duration.toString());
    res.setHeader('X-Audio-Thumbnail', encodeURIComponent(thumbnail));

    if (format.contentLength) {
      res.setHeader('Content-Length', format.contentLength);
    }

    // 4. Crear el stream usando downloadFromInfo para reutilizar los metadatos y el agente
    const audioStream = ytdl.downloadFromInfo(info, {
      format: format,
      agent: agent,
    });

    audioStream.pipe(res);

    audioStream.on('error', (err) => {
      console.error('[YTDL Stream Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error durante la transmisión del archivo.' });
      }
    });

  } catch (error) {
    console.error('[API Convert Error]:', error);
    return res.status(500).json({ error: `Error al procesar el video: ${error.message}` });
  }
}