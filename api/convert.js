export const config = {
  api: {
    responseLimit: false,
  },
};

/**
 * Limpia la URL de YouTube quitando parámetros de rastreo (?si=..., &feature=..., etc.)
 */
function cleanYouTubeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/watch?v=${parsed.pathname.replace('/', '')}`;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
    return urlStr;
  } catch (e) {
    return urlStr;
  }
}

export default async function handler(req, res) {
  // Configuración de cabeceras CORS
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

  const sanitizedUrl = cleanYouTubeUrl(url);

  // --- ESTRATEGIA 1: COBALT API V7 ---
  const cobaltEndpoints = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatek.xyz',
    'https://co.wuk.sh'
  ];

  for (const endpoint of cobaltEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          url: sanitizedUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: quality || '192'
        })
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (data.status === 'error' || (!data.url && !data.picker)) continue;

      const mediaUrl = data.url || (data.picker && data.picker[0]?.url);
      if (!mediaUrl) continue;

      const audioFetch = await fetch(mediaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        }
      });

      if (!audioFetch.ok) continue;

      const arrayBuffer = await audioFetch.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const rawFilename = data.filename || 'SoundFlow_Track';
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
      console.warn(`[Cobalt ${endpoint} falló]:`, err.message);
    }
  }

  // --- ESTRATEGIA 2: PIPED / INVIDIOUS API FALLBACK (Para enlaces de YouTube) ---
  try {
    const parsedUrl = new URL(sanitizedUrl);
    const videoId = parsedUrl.searchParams.get('v');

    if (videoId) {
      const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.private.coffee',
        'https://pipedapi.mha.fi'
      ];

      for (const piped of pipedInstances) {
        try {
          const pipedRes = await fetch(`${piped}/streams/${videoId}`);
          if (!pipedRes.ok) continue;

          const pipedData = await pipedRes.json();
          const audioStreams = pipedData.audioStreams || [];

          if (audioStreams.length === 0) continue;

          // Seleccionar el stream de mejor calidad
          const bestAudio = audioStreams[0];
          const audioStreamRes = await fetch(bestAudio.url);

          if (!audioStreamRes.ok) continue;

          const arrayBuffer = await audioStreamRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const safeTitle = encodeURIComponent(pipedData.title || 'SoundFlow Track');
          const safeArtist = encodeURIComponent(pipedData.uploader || 'YouTube');

          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
          res.setHeader('X-Audio-Title', safeTitle);
          res.setHeader('X-Audio-Artist', safeArtist);
          res.setHeader('X-Audio-Duration', pipedData.duration || '0');
          res.setHeader('X-Audio-Thumbnail', encodeURIComponent(pipedData.thumbnailUrl || ''));
          res.setHeader('Content-Length', buffer.length);

          return res.status(200).send(buffer);
        } catch (e) {
          console.warn(`[Piped ${piped} falló]:`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[Piped Fallback Error]:', err.message);
  }

  // Si todas las instancias fallan
  return res.status(500).json({
    error: 'No se pudo obtener el audio. Intenta con otro enlace o más tarde.'
  });
}