// assets/js/db.js
// Gestor de base de datos en cliente mediante IndexedDB

const DB_NAME = 'SoundFlowDB';
const DB_VERSION = 1;

class DBManager {
    constructor() {
        this.db = null;
        this.initPromise = null;
    }

    /**
     * Inicializa la base de datos creando los almacenes necesarios
     */
    async initDB() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('Error al abrir IndexedDB:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Almacén 1: Canciones descargadas
                if (!db.objectStoreNames.contains('songs')) {
                    const songsStore = db.createObjectStore('songs', { keyPath: 'id' });
                    songsStore.createIndex('title', 'title', { unique: false });
                    songsStore.createIndex('artist', 'artist', { unique: false });
                    songsStore.createIndex('album', 'album', { unique: false });
                    songsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    songsStore.createIndex('isFavorite', 'isFavorite', { unique: false });
                }

                // Almacén 2: Listas de reproducción personalizadas
                if (!db.objectStoreNames.contains('playlists')) {
                    const playlistsStore = db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
                    playlistsStore.createIndex('name', 'name', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Asegura que la BD esté conectada antes de realizar transacciones
     */
    async ensureDB() {
        if (!this.db) {
            await this.initDB();
        }
    }

    /**
     * Guarda una canción completa en IndexedDB
     */
    async saveSong(songData) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            const request = store.put(songData);

            request.onsuccess = () => resolve(songData);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Obtiene todas las canciones guardadas
     */
    async getAllSongs() {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['songs'], 'readonly');
            const store = transaction.objectStore('songs');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Obtiene una canción por su ID
     */
    async getSongById(id) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['songs'], 'readonly');
            const store = transaction.objectStore('songs');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Elimina una canción del almacenamiento
     */
    async deleteSong(id) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Alterna el estado de favorito de una canción
     */
    async toggleFavorite(id) {
        const song = await this.getSongById(id);
        if (!song) return null;

        song.isFavorite = !song.isFavorite;
        await this.saveSong(song);
        return song.isFavorite;
    }

    /**
     * Guarda o actualiza una lista de reproducción
     */
    async savePlaylist(playlist) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlists'], 'readwrite');
            const store = transaction.objectStore('playlists');
            const request = store.put(playlist);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Obtiene todas las listas de reproducción
     */
    async getAllPlaylists() {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlists'], 'readonly');
            const store = transaction.objectStore('playlists');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

// Instancia global del gestor de base de datos
window.dbManager = new DBManager();