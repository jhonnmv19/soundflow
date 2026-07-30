// assets/js/timer.js
// Temporizador de apagado automático (Sleep Timer) con efecto fade-out

class SleepTimer {
    constructor() {
        this.timerId = null;
        this.intervalId = null;
        this.remainingSeconds = 0;
        this.isTimerActive = false;

        this.btnTimer = document.getElementById('btn-timer');
        this.init();
    }

    init() {
        if (!this.btnTimer) return;

        this.btnTimer.addEventListener('click', () => {
            if (this.isTimerActive) {
                this.showActiveTimerOptions();
            } else {
                this.promptSetTimer();
            }
        });
    }

    /**
     * Muestra un menú/prompt para seleccionar el tiempo del temporizador
     */
    promptSetTimer() {
        const option = prompt(
            "Configurar temporizador de apagado:\n\n" +
            "Ingresa los minutos (ej. 15, 30, 45, 60) o '0' para cancelar:",
            "30"
        );

        if (option === null) return; // Cancelado por el usuario

        const minutes = parseInt(option.trim(), 10);

        if (isNaN(minutes) || minutes <= 0) {
            alert("Tiempo no válido.");
            return;
        }

        this.startTimer(minutes);
    }

    /**
     * Inicia la cuenta regresiva del temporizador
     * @param {number} minutes - Tiempo en minutos
     */
    startTimer(minutes) {
        this.clearTimer(); // Limpiar temporizadores previos si existen

        this.remainingSeconds = minutes * 60;
        this.isTimerActive = true;

        this.updateUI();

        // Intervalo de actualización cada segundo
        this.intervalId = setInterval(() => {
            this.remainingSeconds--;

            if (this.remainingSeconds <= 0) {
                this.onTimerExpired();
            } else {
                this.updateUI();
            }
        }, 1000);
    }

    /**
     * Maneja el fin del temporizador con efecto de reducción gradual de volumen
     */
    async onTimerExpired() {
        this.clearTimer();

        if (window.player && window.player.audio) {
            const audio = window.player.audio;
            const originalVolume = audio.volume;

            // Transición suave de volumen (Fade Out de 3 segundos)
            const fadeSteps = 15;
            const fadeInterval = 200; // 200ms x 15 = 3000ms
            const volumeStep = originalVolume / fadeSteps;

            for (let i = 0; i < fadeSteps; i++) {
                if (audio.volume - volumeStep > 0) {
                    audio.volume -= volumeStep;
                } else {
                    audio.volume = 0;
                }
                await new Promise(resolve => setTimeout(resolve, fadeInterval));
            }

            // Pausar reproducción y restaurar el volumen original
            if (window.player.isPlaying) {
                window.player.togglePlay();
            }
            audio.volume = originalVolume;
        }

        alert("El temporizador finalizó y la reproducción se ha detenido.");
    }

    /**
     * Detiene y resetea la cuenta regresiva
     */
    clearTimer() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.timerId) clearTimeout(this.timerId);

        this.intervalId = null;
        this.timerId = null;
        this.remainingSeconds = 0;
        this.isTimerActive = false;

        this.updateUI();
    }

    /**
     * Muestra opciones cuando hay un temporizador actualmente activo
     */
    showActiveTimerOptions() {
        const formattedRemaining = this.formatTime(this.remainingSeconds);
        const confirmCancel = confirm(
            `Temporizador activo: Quedan ${formattedRemaining}.\n\n¿Deseas cancelar el temporizador?`
        );

        if (confirmCancel) {
            this.clearTimer();
        }
    }

    /**
     * Actualiza la interfaz visual del botón del temporizador
     */
    updateUI() {
        if (!this.btnTimer) return;

        if (this.isTimerActive) {
            this.btnTimer.classList.add('text-brand-cyan');
            this.btnTimer.classList.remove('text-slate-400');
            this.btnTimer.title = `Temporizador activo: ${this.formatTime(this.remainingSeconds)}`;
        } else {
            this.btnTimer.classList.remove('text-brand-cyan');
            this.btnTimer.classList.add('text-slate-400');
            this.btnTimer.title = 'Temporizador de apagado';
        }
    }

    /**
     * Formatea segundos a min:seg
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
}

// Instancia global del temporizador
document.addEventListener('DOMContentLoaded', () => {
    window.sleepTimer = new SleepTimer();
});