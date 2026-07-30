// assets/js/downloader.js
// Lógica de descarga de audio desde /api/convert.js y almacenamiento local

class Downloader {
    constructor() {
        this.form = document.getElementById('download-form');
        this.urlInput = document.getElementById('media-url');
        this.qualitySelect = document.getElementById('media-quality');
        this.btnDownload = document.getElementById('btn-download');
        
        // Elementos de la barra de progreso
        this.progressContainer = document.getElementById('download-progress');
        this.progressBar = document.getElementById('download-bar');
        this.progressStatus = document.getElementById('download-status');
        this.progressPercentage = document.getElementById('download-percentage');

        this.init();
    }

    init() {
        if (!this.form) return;

        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = this.urlInput.value.trim();
            const quality = this.qualitySelect.value;

            if (!url) return;

            await this.startDownload(url, quality);
        });
    }

    /**
     * Inicia la petición de descarga y procesa el flujo binario
     */
    async startDownload(url, quality) {
        this.setUIState(true);
        this.updateProgress(0, 'Conectando con el servidor...');

        try {
            const apiUrl = `/api/convert?url=${encodeURIComponent(url)}&quality=${quality}`;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'No se pudo procesar el enlace.');
            }

            // Extraer metadatos enviados desde las cabeceras de la API
            const title = decodeURIComponent(response.headers.get('X-Audio-Title') || 'Canción Desconocida');
            const artist = decodeURIComponent(response.headers.get('X-Audio-Artist') || 'Artista Desconocido');
            const duration = parseInt(response.headers.get('X-Audio-Duration') || '0', 10);
            const thumbnail = decodeURIComponent(response.headers.get('X-Audio-Thumbnail') || '');

            const contentLength = response.headers.get('Content-Length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

            // Leer la respuesta por trozos (Stream Reader) para actualizar el progreso
            const reader = response.body.getReader();
            let receivedBytes = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedBytes += value.length;

                if (totalBytes > 0) {
                    const percent = Math.round((receivedBytes / totalBytes) * 100);
                    this.updateProgress(percent, `Descargando: ${percent}%`);
                } else {
                    this.updateProgress(50, `Descargando audio (${(receivedBytes / (1024 * 1024)).toFixed(1)} MB)...`);
                }
            }

            // Crear el objeto Blob MP3 final
            const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });

            this.updateProgress(95, 'Guardando en el dispositivo...');

            // Estructura de la canción para guardar en DB
            const songRecord = {
                id: 'song_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                title: title,
                artist: artist,
                album: 'Descargas',
                duration: duration,
                thumbnail: thumbnail,
                blob: audioBlob,
                isFavorite: false,
                createdAt: new Date().toISOString()
            };

            // Guardar en IndexedDB
            await dbManager.saveSong(songRecord);

            this.updateProgress(100, '¡Descarga completada!');

            // Notificar a la UI para actualizar la lista en pantalla
            if (window.uiManager) {
                window.uiManager.loadSongs();
            }

            // Limpiar formulario
            this.urlInput.value = '';

        } catch (error) {
            console.error('Error al descargar:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setTimeout(() => {
                this.setUIState(false);
            }, 1500);
        }
    }

    /**
     * Actualiza la barra de progreso en pantalla
     */
    updateProgress(percent, text) {
        this.progressBar.style.width = `${percent}%`;
        this.progressPercentage.textContent = `${percent}%`;
        this.progressStatus.textContent = text;
    }

    /**
     * Alterna la visibilidad y disponibilidad del formulario mientras descarga
     */
    setUIState(isDownloading) {
        if (isDownloading) {
            this.progressContainer.classList.remove('hidden');
            this.btnDownload.disabled = true;
            this.btnDownload.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            this.progressContainer.classList.add('hidden');
            this.btnDownload.disabled = false;
            this.btnDownload.classList.remove('opacity-50', 'cursor-not-allowed');
            this.updateProgress(0, '');
        }
    }
}

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.downloader = new Downloader();
});