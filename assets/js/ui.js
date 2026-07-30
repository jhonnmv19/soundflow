// assets/js/ui.js
// Gestión de la Interfaz de Usuario: Renderizado, Filtros, Búsqueda y Ordenación

class UIManager {
    constructor() {
        this.currentTab = 'songs';
        this.allSongs = [];
        this.filteredSongs = [];
        this.sortAscending = false;

        this.elements = {
            viewContainer: document.getElementById('view-container'),
            songsList: document.getElementById('songs-list'),
            searchInput: document.getElementById('search-input'),
            sortBy: document.getElementById('sort-by'),
            btnSortOrder: document.getElementById('btn-sort-order'),
            tabButtons: document.querySelectorAll('.tab-btn'),
            btnSync: document.getElementById('btn-sync')
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSongs();
    }

    bindEvents() {
        // Manejo de pestañas (Canciones, Listas, Álbumes, Artistas)
        this.elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Búsqueda en tiempo real
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', () => this.applyFiltersAndSort());
        }

        // Criterio de ordenación
        if (this.elements.sortBy) {
            this.elements.sortBy.addEventListener('change', () => this.applyFiltersAndSort());
        }

        // Dirección de ordenación (Ascendente / Descendente)
        if (this.elements.btnSortOrder) {
            this.elements.btnSortOrder.addEventListener('click', () => {
                this.sortAscending = !this.sortAscending;
                this.applyFiltersAndSort();
            });
        }

        // Re-sincronizar biblioteca
        if (this.elements.btnSync) {
            this.elements.btnSync.addEventListener('click', () => this.loadSongs());
        }
    }

    /**
     * Carga las canciones desde IndexedDB y refresca la UI
     */
    async loadSongs() {
        if (!window.dbManager) return;
        this.allSongs = await window.dbManager.getAllSongs();
        if (window.playlistManager) await window.playlistManager.loadPlaylists();
        this.applyFiltersAndSort();
    }

    /**
     * Cambia la pestaña activa en la biblioteca
     */
    switchTab(tab) {
        this.currentTab = tab;
        this.elements.tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === tab) {
                btn.className = 'tab-btn border-b-2 border-brand-cyan text-brand-cyan pb-3';
            } else {
                btn.className = 'tab-btn border-b-2 border-transparent text-slate-400 hover:text-slate-200 pb-3';
            }
        });
        this.renderView();
    }

    /**
     * Filtra y ordena el catálogo de canciones
     */
    applyFiltersAndSort() {
        const query = this.elements.searchInput ? this.elements.searchInput.value.toLowerCase().trim() : '';
        const sortCriteria = this.elements.sortBy ? this.elements.sortBy.value : 'date';

        // 1. Filtrar por texto
        this.filteredSongs = this.allSongs.filter(song => {
            const title = (song.title || '').toLowerCase();
            const artist = (song.artist || '').toLowerCase();
            const album = (song.album || '').toLowerCase();
            return title.includes(query) || artist.includes(query) || album.includes(query);
        });

        // 2. Ordenar
        this.filteredSongs.sort((a, b) => {
            let valueA = a[sortCriteria];
            let valueB = b[sortCriteria];

            if (sortCriteria === 'title' || sortCriteria === 'artist') {
                valueA = (valueA || '').toLowerCase();
                valueB = (valueB || '').toLowerCase();
            } else if (sortCriteria === 'date') {
                valueA = new Date(a.createdAt || 0).getTime();
                valueB = new Date(b.createdAt || 0).getTime();
            }

            if (valueA < valueB) return this.sortAscending ? -1 : 1;
            if (valueA > valueB) return this.sortAscending ? 1 : -1;
            return 0;
        });

        this.renderView();
    }

    /**
     * Renderiza la vista correspondiente a la pestaña seleccionada
     */
    renderView() {
        if (!this.elements.viewContainer) return;

        switch (this.currentTab) {
            case 'songs':
                this.renderSongsList();
                break;
            case 'playlists':
                this.renderPlaylistsView();
                break;
            case 'albums':
                this.renderGroupedView('album', 'Álbumes');
                break;
            case 'artists':
                this.renderGroupedView('artist', 'Artistas');
                break;
        }

        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Renderiza la lista individual de canciones
     */
    renderSongsList() {
        if (this.filteredSongs.length === 0) {
            this.elements.viewContainer.innerHTML = `
                <div class="text-center py-12 text-slate-500">
                    <i data-lucide="music-off" class="w-12 h-12 mx-auto mb-3 stroke-1"></i>
                    <p class="text-sm">No se encontraron canciones descargadas.</p>
                </div>`;
            return;
        }

        const html = this.filteredSongs.map((song, index) => `
            <div class="group flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50 transition-all cursor-pointer" onclick="window.player.setQueue(window.uiManager.filteredSongs, ${index})">
                <div class="flex items-center gap-3.5 min-w-0">
                    <img src="${song.thumbnail || 'https://via.placeholder.com/50'}" alt="Cover" class="w-12 h-12 rounded-lg object-cover bg-slate-950 flex-shrink-0">
                    <div class="min-w-0">
                        <h4 class="text-sm font-semibold text-slate-200 group-hover:text-brand-cyan truncate transition-colors">${song.title}</h4>
                        <p class="text-xs text-slate-400 truncate">${song.artist} • <span class="text-slate-500">${this.formatDuration(song.duration)}</span></p>
                    </div>
                </div>
                <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                    <button onclick="window.uiManager.handleDeleteSong('${song.id}')" class="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors" title="Eliminar">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `).join('');

        this.elements.viewContainer.innerHTML = `<div class="space-y-2">${html}</div>`;
    }

    /**
     * Renderiza la vista de Listas de Reproducción y el botón para crear nuevas
     */
    renderPlaylistsView() {
        const playlists = window.playlistManager ? window.playlistManager.playlists : [];

        let html = `
            <div class="mb-6">
                <button onclick="window.uiManager.promptCreatePlaylist()" class="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-brand-cyan border border-brand-cyan/30 font-medium px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all">
                    <i data-lucide="plus" class="w-4 h-4"></i> Nueva lista de reproducción
                </button>
            </div>`;

        if (playlists.length === 0) {
            html += `
                <div class="text-center py-10 text-slate-500">
                    <i data-lucide="list-music" class="w-12 h-12 mx-auto mb-3 stroke-1"></i>
                    <p class="text-sm">No has creado listas de reproducción aún.</p>
                </div>`;
        } else {
            html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
            playlists.forEach(pl => {
                const metrics = window.playlistManager.calculateMetrics(pl.songIds, this.allSongs);
                html += `
                    <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all">
                        <div>
                            <h4 class="text-base font-semibold text-slate-200">${pl.name}</h4>
                            <p class="text-xs text-slate-400 mt-1">${metrics.count} canciones • ${metrics.formattedDuration} de reproducción</p>
                        </div>
                        <button onclick="window.uiManager.playPlaylist('${pl.id}')" class="p-3 bg-brand-cyan/10 hover:bg-brand-cyan text-brand-cyan hover:text-slate-950 rounded-full transition-all">
                            <i data-lucide="play" class="w-5 h-5 fill-current"></i>
                        </button>
                    </div>`;
            });
            html += `</div>`;
        }

        this.elements.viewContainer.innerHTML = html;
    }

    /**
     * Renderiza vistas agrupadas dinámicas por Artistas o Álbumes
     */
    renderGroupedView(key, label) {
        const groups = {};

        this.allSongs.forEach(song => {
            const groupName = song[key] || `Sin ${label}`;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(song);
        });

        const keys = Object.keys(groups);

        if (keys.length === 0) {
            this.elements.viewContainer.innerHTML = `
                <div class="text-center py-12 text-slate-500">
                    <p class="text-sm">No hay datos suficientes para agrupar por ${label.toLowerCase()}.</p>
                </div>`;
            return;
        }

        const html = keys.map(groupName => {
            const songs = groups[groupName];
            const metrics = window.playlistManager ? window.playlistManager.calculateMetrics(songs.map(s => s.id), songs) : { formattedDuration: '0 min' };

            return `
                <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold text-slate-200">${groupName}</h3>
                            <p class="text-xs text-slate-400">${songs.length} canciones • ${metrics.formattedDuration}</p>
                        </div>
                        <button onclick="window.player.setQueue(window.uiManager.getGroupSongs('${key}', '${groupName}'), 0)" class="p-2 text-brand-cyan hover:bg-slate-800 rounded-lg">
                            <i data-lucide="play-circle" class="w-6 h-6"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');

        this.elements.viewContainer.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${html}</div>`;
    }

    /**
     * Retorna las canciones pertenecientes a un grupo específico (Artista/Álbum)
     */
    getGroupSongs(key, value) {
        return this.allSongs.filter(song => (song[key] || `Sin ${key}`) === value);
    }

    /**
     * Solicita mediante prompt el nombre para una nueva playlist
     */
    async promptCreatePlaylist() {
        const name = prompt('Ingresa el nombre de la nueva lista de reproducción:');
        if (name && window.playlistManager) {
            await window.playlistManager.createPlaylist(name);
            this.renderPlaylistsView();
            if (window.lucide) window.lucide.createIcons();
        }
    }

    /**
     * Reproduce una playlist completa
     */
    playPlaylist(playlistId) {
        const playlist = window.playlistManager.playlists.find(p => p.id === playlistId);
        if (!playlist) return;

        const playlistSongs = this.allSongs.filter(s => playlist.songIds.includes(s.id));
        if (playlistSongs.length > 0 && window.player) {
            window.player.setQueue(playlistSongs, 0);
        } else {
            alert('Esta lista de reproducción no contiene canciones.');
        }
    }

    /**
     * Elimina una canción de la base de datos local
     */
    async handleDeleteSong(songId) {
        if (confirm('¿Estás seguro de que deseas eliminar esta canción del dispositivo?')) {
            await window.dbManager.deleteSong(songId);
            await this.loadSongs();
        }
    }

    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
}

// Instancia global
document.addEventListener('DOMContentLoaded', () => {
    window.uiManager = new UIManager();
});