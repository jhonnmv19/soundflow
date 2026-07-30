// assets/js/app.js
// Inicialización global del sistema, PWA y Web Share API

class App {
    constructor() {
        this.btnShare = document.getElementById('btn-share');
        this.init();
    }

    async init() {
        // 1. Inicializar Base de Datos en el cliente
        try {
            if (window.dbManager) {
                await window.dbManager.initDB();
                console.log('[SoundFlow] IndexedDB inicializada correctamente.');
                
                // Cargar canciones iniciales en la UI
                if (window.uiManager) {
                    await window.uiManager.loadSongs();
                }
            }
        } catch (error) {
            console.error('[SoundFlow] Error inicializando la base de datos:', error);
        }

        // 2. Registrar Service Worker para PWA
        this.registerServiceWorker();

        // 3. Registrar eventos de Web Share API
        this.bindShareAPI();

        // 4. Monitorear estado de conexión
        this.bindNetworkEvents();
    }

    /**
     * Registra el Service Worker en navegadores compatibles
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then((reg) => {
                        console.log('[SoundFlow] Service Worker registrado exitosamente:', reg.scope);
                    })
                    .catch((err) => {
                        console.error('[SoundFlow] Fallo al registrar Service Worker:', err);
                    });
            });
        }
    }

    /**
     * Habilita la Web Share API para compartir la PWA o contenido
     */
    bindShareAPI() {
        if (!this.btnShare) return;

        this.btnShare.addEventListener('click', async () => {
            const shareData = {
                title: 'SoundFlow',
                text: '¡Prueba SoundFlow! Descarga y escucha tus canciones favoritas offline.',
                url: window.location.href
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.log('Error al compartir o acción cancelada:', err);
                }
            } else {
                // Fallback: Copiar enlace al portapapeles
                navigator.clipboard.writeText(window.location.href);
                alert('¡Enlace de SoundFlow copiado al portapapeles!');
            }
        });
    }

    /**
     * Muestra alertas contextuales según el estado de la red
     */
    bindNetworkEvents() {
        window.addEventListener('online', () => {
            console.log('[SoundFlow] Conexión reestablecida.');
        });

        window.addEventListener('offline', () => {
            console.log('[SoundFlow] Modo sin conexión activo.');
        });
    }
}

// Inicialización general al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    window.soundFlowApp = new App();
});