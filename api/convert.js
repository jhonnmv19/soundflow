// api/convert.js
import ytdl from '@distube/ytdl-core';

export const config = {
    api: {
        responseLimit: false, // Desactiva el límite de payload en respuestas Vercel
    },
};

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
        // Obtener metadatos de la canción
        const info = await ytdl.getInfo(url, {
            requestOptions: {
                headers: {
                    // Simular navegador para evitar bloqueos por bots en Vercel
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                }
            }
        });

        const title = info.videoDetails.title || 'Canción Desconocida';
        const artist = info.videoDetails.author?.name || 'Artista Desconocido';
        const duration = parseInt(info.videoDetails.lengthSeconds || '0', 10);
        const thumbnail = info.videoDetails.thumbnails?.[0]?.url || '';

        // Seleccionar formato de solo audio (audioonly)
        const format = ytdl.chooseFormat(info.formats, {
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        if (!format) {
            return res.status(500).json({ error: 'No se encontró formato de audio para este video.' });
        }

        // Configurar cabeceras HTTP de respuesta
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.mp3"`);
        res.setHeader('X-Audio-Title', encodeURIComponent(title));
        res.setHeader('X-Audio-Artist', encodeURIComponent(artist));
        res.setHeader('X-Audio-Duration', duration.toString());
        res.setHeader('X-Audio-Thumbnail', encodeURIComponent(thumbnail));

        if (format.contentLength) {
            res.setHeader('Content-Length', format.contentLength);
        }

        // Transmitir el stream directamente al cliente
        const audioStream = ytdl(url, {
            format: format,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                }
            }
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