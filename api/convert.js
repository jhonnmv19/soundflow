// api/convert.js
// Vercel Serverless Function (Node.js)

import ytdl from 'ytdl-core';

export default async function handler(req, res) {
    // Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url, quality = '192' } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'La URL es requerida.' });
    }

    try {
        // Validar URL de YouTube
        const isValid = ytdl.validateURL(url);
        if (!isValid) {
            return res.status(400).json({ error: 'URL no válida o no soportada.' });
        }

        // Obtener metadatos del video
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s-]/gi, ''); // Limpiar caracteres especiales
        const artist = info.videoDetails.author.name || 'Desconocido';
        const duration = parseInt(info.videoDetails.lengthSeconds, 10);
        const thumbnail = info.videoDetails.thumbnails.pop()?.url || '';

        // Definir la calidad de audio objetivo
        const qualityBitrate = parseInt(quality, 10);

        // Cabeceras para forzar la descarga del stream MP3
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.mp3"`);
        res.setHeader('X-Audio-Title', encodeURIComponent(title));
        res.setHeader('X-Audio-Artist', encodeURIComponent(artist));
        res.setHeader('X-Audio-Duration', duration);
        res.setHeader('X-Audio-Thumbnail', encodeURIComponent(thumbnail));

        // Transmitir el flujo de audio directamente al cliente
        ytdl(url, {
            filter: 'audioonly',
            quality: qualityBitrate >= 320 ? 'highestaudio' : 'lowestaudio',
        }).pipe(res);

    } catch (error) {
        console.error('Error procesando audio:', error);
        return res.status(500).json({ error: 'Error al procesar la conversión del audio.' });
    }
}