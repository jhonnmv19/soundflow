export const config = {
  api: {
    responseLimit: false,
  },
};

/**
 * Limpia y normaliza enlaces de YouTube (remueve ?si=..., &feature=..., etc.)
 */
function cleanYouTubeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').split('?')[0];
      return `https://www.youtube.com/watch?v=${id}`;
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

/**
 * Extrae el Video ID de una URL de YouTube
 */
function getYouTubeId(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').split('?')[0];
    }
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
  } catch (e) {
    return null;
  }
  return null;
}

export default async function handler(req, res) {
  // Configuración de cabeceras CORS
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
  const videoId = getYouTubeId(sanitizedUrl);

  // --- ESTRATEGIA 1: INVIDIOUS INSTANCES (Extracción directa de streams m4a/webm) ---
  if (videoId) {
    const invidiousInstances = [
      'https://inv.riverside.rocks',
      'https://invidious.nerdvpn.de',
      'https://invidious.flokinet.to',
      'https://invidious.drgns.space',
      'https://vid.puffyan.us'
    ];

    for (const instance of invidiousInstances) {
      try {
        const invRes = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!invRes.ok) continue;

        const invData = await invRes.json();
        const adaptiveFormats = invData.adaptiveFormats || [];

        // Filtrar formatos exclusivamente de audio
        const audioFormats = adaptiveFormats.filter(f => f.type && f.type.includes('audio'));

        if (audioFormats.length > 0) {
          // Ordenar por mejor bitrate/calidad
          audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
          const selectedAudio = audioFormats[0];

          return res.status(200).json({
            downloadUrl: selectedAudio.url,
            title: invData.title || 'SoundFlow Track',
            artist: invData.author || 'YouTube',
            duration: invData.lengthSeconds || 0,
            thumbnail: invData.videoThumbnails?.[0]?.url || ''
          });
        }
      } catch (err) {
        console.warn(`[Invidious ${instance} falló]:`, err.message);
      }
    }
  }

  // --- ESTRATEGIA 2: COBALT INSTANCES API V7 ---
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
      console.warn(`[Cobalt ${endpoint} falló]:`, err.message);
    }
  }

  // --- ESTRATEGIA 3: PIPED API FALLBACK ---
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

        if (audioStreams.length > 0) {
          const bestAudio = audioStreams[0];

          return res.status(200).json({
            downloadUrl: bestAudio.url,
            title: pipedData.title || 'SoundFlow Track',
            artist: pipedData.uploader || 'YouTube',
            duration: pipedData.duration || 0,
            thumbnail: pipedData.thumbnailUrl || ''
          });
        }
      } catch (e) {
        console.warn(`[Piped ${piped} falló]:`, e.message);
      }
    }
  }

  // Si todas las instancias fallan
  return res.status(500).json({
    error: 'No se pudo procesar la descarga de este video. Los servidores de YouTube bloquearon la consulta. Intenta con otro video o enlace más tarde.'
  });
}