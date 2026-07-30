// assets/js/playlists.js
// Lógica para la creación, gestión y cálculos de Listas de Reproducción

class PlaylistManager {
    constructor() {
        this.playlists = [];
    }

    /**
     * Carga todas las listas desde IndexedDB
     */
    async loadPlaylists() {
        if (window.dbManager) {
            this.playlists = await window.dbManager.getAllPlaylists();
        }
        return this.playlists;
    }

    /**
     * Crea una nueva lista de reproducción
     * @param {string} name - Nombre de la lista
     */
    async createPlaylist(name) {
        if (!name || !name.trim()) return null;

        const newPlaylist = {
            name: name.trim(),
            songIds: [],
            createdAt: new Date().toISOString()
        };

        const id = await window.dbManager.savePlaylist(newPlaylist);
        newPlaylist.id = id;
        this.playlists.push(newPlaylist);

        return newPlaylist;
    }

    /**
     * Añade una canción a una lista de reproducción existente
     */
    async addSongToPlaylist(playlistId, songId) {
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (!playlist) return false;

        if (!playlist.songIds.includes(songId)) {
            playlist.songIds.push(songId);
            await window.dbManager.savePlaylist(playlist);
            return true;
        }
        return false;
    }

    /**
     * Remueve una canción de una lista
     */
    async removeSongFromPlaylist(playlistId, songId) {
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (!playlist) return false;

        playlist.songIds = playlist.songIds.filter(id => id !== songId);
        await window.dbManager.savePlaylist(playlist);
        return true;
    }

    /**
     * Calcula las métricas de la lista (Total de canciones y duración acumulada en horas/minutos)
     * @param {Array} songIds - Lista de IDs de las canciones en la playlist
     * @param {Array} allSongs - Catálogo completo de canciones
     */
    calculateMetrics(songIds = [], allSongs = []) {
        const playlistSongs = allSongs.filter(song => songIds.includes(song.id));
        const count = playlistSongs.length;

        const totalSeconds = playlistSongs.reduce((acc, song) => acc + (song.duration || 0), 0);

        return {
            count,
            formattedDuration: this.formatTotalTime(totalSeconds),
            totalSeconds
        };
    }

    /**
     * Convierte segundos acumulados a una cadena legible (Ej: "2h 15m" o "45 min")
     */
    formatTotalTime(totalSeconds) {
        if (!totalSeconds || totalSeconds <= 0) return '0 min';

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min`;
        }
        return `${minutes} min`;
    }
}

// Instancia global
document.addEventListener('DOMContentLoaded', () => {
    window.playlistManager = new PlaylistManager();
});