// assets/js/player.js
// Motor de audio para SoundFlow: Gestión de reproducción, modos, velocidades y Media Session API

class AudioPlayer {
    constructor() {
        this.audio = new Audio();
        
        // Estado de la cola y reproducción
        this.queue = [];            // Lista actual de canciones (IDs u objetos)
        this.originalQueue = [];    // Copia original para mantener el orden al desactivar shuffle
        this.currentIndex = -1;     // Índice de la canción actual en queue
        this.isPlaying = false;

        // Modos de repetición: 'off' | 'one' | 'all' | 'stop-after-current'
        this.repeatMode = 'all';
        this.isShuffle = false;

        // Elementos de la interfaz de usuario
        this.ui = {
            btnPlayPause: document.getElementById('btn-play-pause'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnShuffle: document.getElementById('btn-shuffle'),
            btnRepeat: document.getElementById('btn-repeat'),
            btnSpeed: document.getElementById('btn-speed'),
            btnFavorite: document.getElementById('btn-favorite'),
            seekBar: document.getElementById('seek-bar'),
            currentTime: document.getElementById('current-time'),
            totalDuration: document.getElementById('total-duration'),
            cover: document.getElementById('player-cover'),
            title: document.getElementById('player-title'),
            artist: document.getElementById('player-artist')
        };

        // Velocidades disponibles
        this.speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
        this.currentSpeedIndex = 2; // Por defecto 1.0x

        this.currentObjectUrl = null;

        this.init();
    }

    init() {
        this.bindAudioEvents();
        this.bindUIEvents();
        this.updateRepeatUI();
        this.updateShuffleUI();
    }

    /**
     * Vincula los eventos nativos del elemento Audio de HTML5
     */
    bindAudioEvents() {
        // Actualización de la barra de progreso y tiempo
        this.audio.addEventListener('timeupdate', () => {
            if (!this.audio.duration) return;
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            if (this.ui.seekBar) this.ui.seekBar.value = progress || 0;
            if (this.ui.currentTime) this.ui.currentTime.textContent = this.formatTime(this.audio.currentTime);
        });

        // Carga de metadatos (duración total)
        this.audio.addEventListener('loadedmetadata', () => {
            if (this.ui.totalDuration) this.ui.totalDuration.textContent = this.formatTime(this.audio.duration);
        });

        // Evento al finalizar la canción
        this.audio.addEventListener('ended', () => {
            this.handleSongEnded();
        });

        // Manejo de errores de reproducción
        this.audio.addEventListener('error', (e) => {
            console.error('Error en el elemento de Audio:', e);
        });
    }

    /**
     * Vincula los eventos con la interfaz gráfica
     */
    bindUIEvents() {
        // Play / Pause
        if (this.ui.btnPlayPause) {
            this.ui.btnPlayPause.addEventListener('click', () => this.togglePlay());
        }

        // Anterior / Siguiente
        if (this.ui.btnPrev) {
            this.ui.btnPrev.addEventListener('click', () => this.playPrevious());
        }
        if (this.ui.btnNext) {
            this.ui.btnNext.addEventListener('click', () => this.playNext());
        }

        // Cambio de progreso manual (Seek)
        if (this.ui.seekBar) {
            this.ui.seekBar.addEventListener('input', (e) => {
                if (!this.audio.duration) return;
                const seekTo = (e.target.value / 100) * this.audio.duration;
                this.audio.currentTime = seekTo;
            });
        }

        // Selector de velocidad
        if (this.ui.btnSpeed) {
            this.ui.btnSpeed.addEventListener('click', () => this.cycleSpeed());
        }

        // Alternar Aleatorio (Shuffle)
        if (this.ui.btnShuffle) {
            this.ui.btnShuffle.addEventListener('click', () => this.toggleShuffle());
        }

        // Alternar Repetir
        if (this.ui.btnRepeat) {
            this.ui.btnRepeat.addEventListener('click', () => this.cycleRepeatMode());
        }

        // Alternar Favorito
        if (this.ui.btnFavorite) {
            this.ui.btnFavorite.addEventListener('click', async () => {
                const currentSong = this.getCurrentSong();
                if (currentSong && window.dbManager) {
                    const isFav = await window.dbManager.toggleFavorite(currentSong.id);
                    currentSong.isFavorite = isFav;
                    this.updateFavoriteUI(isFav);
                    if (window.uiManager) window.uiManager.loadSongs();
                }
            });
        }
    }

    /**
     * Establece una lista de reproducción y empieza a reproducir desde un índice específico
     */
    async setQueue(songsList, startIndex = 0) {
        if (!songsList || songsList.length === 0) return;

        this.originalQueue = [...songsList];
        
        if (this.isShuffle) {
            this.queue = this.shuffleArray([...songsList]);
            const currentSong = songsList[startIndex];
            this.currentIndex = this.queue.findIndex(s => s.id === currentSong.id);
        } else {
            this.queue = [...songsList];
            this.currentIndex = startIndex;
        }

        await this.loadAndPlayCurrentSong();
    }

    /**
     * Carga el Blob de audio desde la cola e inicia la reproducción
     */
    async loadAndPlayCurrentSong() {
        const song = this.getCurrentSong();
        if (!song) return;

        // Liberar la URL anterior de la memoria
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
        }

        // Crear una nueva Object URL a partir del Blob binario en IndexedDB
        this.currentObjectUrl = URL.createObjectURL(song.blob);
        this.audio.src = this.currentObjectUrl;
        this.audio.playbackRate = this.speeds[this.currentSpeedIndex];

        this.updatePlayerUI(song);
        this.setupMediaSession(song);

        try {
            await this.audio.play();
            this.isPlaying = true;
            this.updatePlayPauseUI();
        } catch (error) {
            console.error('Error al iniciar reproducción automática:', error);
            this.isPlaying = false;
            this.updatePlayPauseUI();
        }
    }

    /**
     * Alterna la reproducción o pausa
     */
    togglePlay() {
        if (!this.audio.src) return;

        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
        } else {
            this.audio.play();
            this.isPlaying = true;
        }
        this.updatePlayPauseUI();
    }

    /**
     * Avanza a la siguiente canción respetando las reglas de reproducción
     */
    playNext() {
        if (this.queue.length === 0) return;

        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
        } else if (this.repeatMode === 'all') {
            this.currentIndex = 0; // Vuelve al inicio de la cola
        } else {
            return; // Fin de la cola
        }

        this.loadAndPlayCurrentSong();
    }

    /**
     * Retrocede a la canción anterior o reinicia la actual si ya pasaron más de 3 segundos
     */
    playPrevious() {
        if (this.queue.length === 0) return;

        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }

        if (this.currentIndex > 0) {
            this.currentIndex--;
        } else {
            this.currentIndex = this.queue.length - 1;
        }

        this.loadAndPlayCurrentSong();
    }

    /**
     * Maneja la lógica al terminar una canción según el modo activo
     */
    handleSongEnded() {
        if (this.repeatMode === 'one') {
            this.audio.currentTime = 0;
            this.audio.play();
        } else if (this.repeatMode === 'stop-after-current') {
            this.isPlaying = false;
            this.updatePlayPauseUI();
        } else {
            this.playNext();
        }
    }

    /**
     * Alterna el modo aleatorio (Shuffle)
     */
    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        const currentSong = this.getCurrentSong();

        if (this.isShuffle) {
            this.queue = this.shuffleArray([...this.originalQueue]);
            if (currentSong) {
                this.currentIndex = this.queue.findIndex(s => s.id === currentSong.id);
            }
        } else {
            this.queue = [...this.originalQueue];
            if (currentSong) {
                this.currentIndex = this.queue.findIndex(s => s.id === currentSong.id);
            }
        }

        this.updateShuffleUI();
    }

    /**
     * Rota los modos de repetición: All -> One -> Stop After Current -> Off -> All
     */
    cycleRepeatMode() {
        const modes = ['all', 'one', 'stop-after-current', 'off'];
        const currentIdx = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentIdx + 1) % modes.length];
        this.updateRepeatUI();
    }

    /**
     * Rota la velocidad de reproducción (0.5x - 2.0x)
     */
    cycleSpeed() {
        this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.speeds.length;
        const newSpeed = this.speeds[this.currentSpeedIndex];
        this.audio.playbackRate = newSpeed;

        if (this.ui.btnSpeed) {
            this.ui.btnSpeed.textContent = `${newSpeed.toFixed(1)}x`;
        }
    }

    /**
     * Retorna el objeto de la canción activa
     */
    getCurrentSong() {
        return this.queue[this.currentIndex] || null;
    }

    /**
     * Mezcla un array aleatoriamente (Algoritmo Fisher-Yates)
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Formatea segundos a formato mm:ss
     */
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- ACTUALIZACIONES DE INTERFAZ GRÁFICA (UI) ---

    updatePlayerUI(song) {
        if (this.ui.title) this.ui.title.textContent = song.title;
        if (this.ui.artist) this.ui.artist.textContent = song.artist;
        if (this.ui.cover) {
            this.ui.cover.src = song.thumbnail || 'https://via.placeholder.com/50';
        }
        this.updateFavoriteUI(song.isFavorite);
    }

    updatePlayPauseUI() {
        if (!this.ui.btnPlayPause) return;
        const icon = this.ui.btnPlayPause.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', this.isPlaying ? 'pause' : 'play');
            if (window.lucide) window.lucide.createIcons();
        }
    }

    updateShuffleUI() {
        if (!this.ui.btnShuffle) return;
        if (this.isShuffle) {
            this.ui.btnShuffle.classList.add('text-brand-cyan');
            this.ui.btnShuffle.classList.remove('text-slate-500');
        } else {
            this.ui.btnShuffle.classList.remove('text-brand-cyan');
            this.ui.btnShuffle.classList.add('text-slate-500');
        }
    }

    updateRepeatUI() {
        if (!this.ui.btnRepeat) return;
        this.ui.btnRepeat.classList.remove('text-brand-cyan', 'text-slate-500', 'text-amber-400');

        if (this.repeatMode === 'all') {
            this.ui.btnRepeat.classList.add('text-brand-cyan');
            this.ui.btnRepeat.title = 'Repetir toda la cola';
        } else if (this.repeatMode === 'one') {
            this.ui.btnRepeat.classList.add('text-amber-400');
            this.ui.btnRepeat.title = 'Repetir pista actual';
        } else if (this.repeatMode === 'stop-after-current') {
            this.ui.btnRepeat.classList.add('text-red-400');
            this.ui.btnRepeat.title = 'Parar al terminar la canción';
        } else {
            this.ui.btnRepeat.classList.add('text-slate-500');
            this.ui.btnRepeat.title = 'Repetición desactivada';
        }
    }

    updateFavoriteUI(isFavorite) {
        if (!this.ui.btnFavorite) return;
        const icon = this.ui.btnFavorite.querySelector('i');
        if (isFavorite) {
            this.ui.btnFavorite.classList.add('text-red-500');
            this.ui.btnFavorite.classList.remove('text-slate-400');
            if (icon) icon.style.fill = 'currentColor';
        } else {
            this.ui.btnFavorite.classList.remove('text-red-500');
            this.ui.btnFavorite.classList.add('text-slate-400');
            if (icon) icon.style.fill = 'none';
        }
    }

    /**
     * Integra la notificación nativa de reproducción en Android / iOS / Windows
     */
    setupMediaSession(song) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.artist,
                album: song.album || 'SoundFlow',
                artwork: [
                    { src: song.thumbnail || 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: song.thumbnail || 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
            navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
        }
    }
}

// Instancia global del reproductor
document.addEventListener('DOMContentLoaded', () => {
    window.player = new AudioPlayer();
});