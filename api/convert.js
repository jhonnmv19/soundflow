export const config = {
  api: {
    responseLimit: false,
  },
};

/**
 * Limpia la URL de YouTube quitando parámetros de rastreo
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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, quality = '192' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Proporciona una URL válida.' });
  }

  const sanitizedUrl = cleanYouTubeUrl(url);

  // 1. Probar con instancias públicas de Cobalt API (Modo Redirect/Stream Link)
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatek.xyz',
    'https://co.wuk.sh'
  ];

  for (const endpoint of cobaltInstances) {
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

      const streamUrl = data.url || (data.picker && data.picker[0]?.url);
      if (!streamUrl) continue;

      const title = data.filename ? data.filename.replace(/\.mp3$/i, '') : 'SoundFlow Audio';

      return res.status(200).json({
        downloadUrl: streamUrl,
        title: title,
        artist: 'YouTube Track',
        duration: 0,
        thumbnail: ''
      });
    } catch (err) {
      console.warn(`[Cobalt ${endpoint} error]:`, err.message);
    }
  }

  // 2. Fallback con API Piped para enlaces de YouTube
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

          const bestAudio = audioStreams[0];

          return res.status(200).json({
            downloadUrl: bestAudio.url,
            title: pipedData.title || 'SoundFlow Track',
            artist: pipedData.uploader || 'YouTube',
            duration: pipedData.duration || 0,
            thumbnail: pipedData.thumbnailUrl || ''
          });
        } catch (e) {
          console.warn(`[Piped ${piped} error]:`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[Piped Error]:', err.message);
  }

  return res.status(500).json({
    error: 'No se pudo obtener el enlace de descarga. Intenta con otro video o verifica la URL.'
  });
}