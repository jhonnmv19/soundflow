// assets/js/downloader.js
// Lógica de descarga de audio y almacenamiento local IndexedDB

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
            const quality = this.qualitySelect ? this.qualitySelect.value : '192';

            if (!url) return;

            await this.startDownload(url, quality);
        });
    }

    /**
     * Obtenemos la URL de descarga desde la API y procesamos el Blob en el navegador
     */
    async startDownload(url, quality) {
        this.setUIState(true);
        this.updateProgress(10, 'Obteniendo información del servidor...');

        try {
            const apiUrl = `/api/convert?url=${encodeURIComponent(url)}&quality=${quality}`;
            const response = await fetch(apiUrl);

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo procesar el enlace.');
            }

            if (!data.downloadUrl) {
                throw new Error('El servidor no devolvió una URL de audio válida.');
            }

            this.updateProgress(30, 'Descargando archivo de audio...');

            // El cliente descarga directamente el stream evadiendo bloqueos de Vercel
            const audioFetch = await fetch(data.downloadUrl);
            if (!audioFetch.ok) {
                throw new Error('No se pudo obtener el audio desde el servidor de origen.');
            }

            const contentLength = audioFetch.headers.get('Content-Length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

            const reader = audioFetch.body.getReader();
            let receivedBytes = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedBytes += value.length;

                if (totalBytes > 0) {
                    const percent = Math.round(30 + ((receivedBytes / totalBytes) * 60));
                    this.updateProgress(percent, `Descargando: ${percent}%`);
                } else {
                    const mb = (receivedBytes / (1024 * 1024)).toFixed(1);
                    this.updateProgress(60, `Descargando audio (${mb} MB)...`);
                }
            }

            // Crear el Blob binario MP3
            const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });

            this.updateProgress(95, 'Guardando en la biblioteca local...');

            // Construir registro de canción
            const songRecord = {
                id: 'song_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                title: data.title || 'Canción Desconocida',
                artist: data.artist || 'Artista Desconocido',
                album: 'Descargas',
                duration: data.duration || 0,
                thumbnail: data.thumbnail || '',
                blob: audioBlob,
                isFavorite: false,
                createdAt: new Date().toISOString()
            };

            // Guardar en la base de datos local (IndexedDB)
            if (window.dbManager) {
                await window.dbManager.saveSong(songRecord);
            }

            this.updateProgress(100, '¡Descarga completada!');

            // Actualizar interfaz de canciones
            if (window.uiManager) {
                window.uiManager.loadSongs();
            }

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

    updateProgress(percent, text) {
        if (this.progressBar) this.progressBar.style.width = `${percent}%`;
        if (this.progressPercentage) this.progressPercentage.textContent = `${percent}%`;
        if (this.progressStatus) this.progressStatus.textContent = text;
    }

    setUIState(isDownloading) {
        if (isDownloading) {
            if (this.progressContainer) this.progressContainer.classList.remove('hidden');
            if (this.btnDownload) {
                this.btnDownload.disabled = true;
                this.btnDownload.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
            if (this.progressContainer) this.progressContainer.classList.add('hidden');
            if (this.btnDownload) {
                this.btnDownload.disabled = false;
                this.btnDownload.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            this.updateProgress(0, '');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.downloader = new Downloader();
});