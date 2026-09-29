/**
 * MedicalSpeech: Ultra-reliable, high-grade medical microphone and speech recognition
 * system engineered for clinical emergency admissions and triage.
 *
 * Features:
 * - Web Speech API with Russian language ('ru-RU') and multi-alternatives.
 * - Resilience against brief pauses (automatic restart on premature onend).
 * - Defensive error handling ('not-allowed', 'no-speech', 'network', 'audio-capture') with Russian messages.
 * - Web Audio API (AudioContext + AnalyserNode) for real-time acoustic & frequency analysis.
 * - Built-in live canvas visualizer (attachCanvas) rendering a smooth glowing medical waveform.
 * - Pure Web Audio synthesizers (start chime 440Hz->880Hz, end chime 880Hz->440Hz, error tone).
 * - Mobile haptic feedback (vibrate 30ms on start, 15-50-15ms on stop).
 * - Smart medical dictation text cleaner (BP, HR, SpO2, Temp, Glucose, Acronyms, Capitalization).
 */

class MedicalSpeech {
  /**
   * @param {Function} [onInterim] - Callback for real-time interim & combined dictation text
   * @param {Function} [onFinal] - Callback for final sanitized medical text on session end
   * @param {Function} [onStateChange] - Callback receiving (isListening: boolean, errorMsg?: string)
   */
  constructor(onInterim = null, onFinal = null, onStateChange = null) {
    this.onInterim = typeof onInterim === 'function' ? onInterim : null;
    this.onFinal = typeof onFinal === 'function' ? onFinal : null;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null;

    this.recognition = null;
    this._isListening = false;
    this.explicitStop = false;
    this.isSupported = false;

    // Dictation buffers
    this.accumulatedFinalText = '';
    this.latestInterim = '';
    this.restartAttempts = 0;
    this.consecutiveErrors = 0;
    this.restartTimer = null;

    // Web Audio API components
    this.audioCtx = null;
    this.mediaStream = null;
    this.analyser = null;
    this.micSource = null;
    this.timeDomainData = null;
    this.frequencyData = null;

    // Visualizer state
    this.attachedCanvases = new Set();
    this.animFrameId = null;
    this.idlePhase = 0;

    // Initialize speech recognition engine
    this._initRecognition();

    // Bind DOM elements if available
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupDOM());
      } else {
        this.setupDOM();
      }
    }
  }

  // ==========================================
  // Public Properties
  // ==========================================

  get isListening() {
    return Boolean(this._isListening);
  }

  set isListening(val) {
    this._isListening = Boolean(val);
  }

  // ==========================================
  // Speech Recognition Initialization
  // ==========================================

  _initRecognition() {
    const SpeechRecognition = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      console.warn('[MedicalSpeech] Web Speech API not supported in this environment.');
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ru-RU';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 2;

    this.recognition.onstart = () => {
      this._isListening = true;
      this.restartAttempts = 0;
      this.consecutiveErrors = 0;
      this.updateUI(true);
      if (this.onStateChange) this.onStateChange(true);
    };

    this.recognition.onresult = (event) => {
      if (!this._isListening || this.explicitStop) {
        return;
      }
      this.restartAttempts = 0;
      this.consecutiveErrors = 0;

      let currentInterim = '';
      let currentFinal = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          currentFinal += res[0].transcript + ' ';
        } else {
          currentInterim += res[0].transcript;
        }
      }

      if (currentFinal) {
        this.accumulatedFinalText += currentFinal;
      }
      this.latestInterim = currentInterim;

      const combinedRaw = (this.accumulatedFinalText + ' ' + currentInterim).trim();
      const formatted = this.formatMedicalText(combinedRaw);

      if (this.onInterim) {
        this.onInterim(formatted);
      }

      const statusEl = document.getElementById('voice-status');
      if (statusEl) {
        statusEl.innerText = currentInterim || formatted || 'Слушаю вас...';
      }
    };

    this.recognition.onerror = (event) => {
      const error = event.error;
      console.warn('[MedicalSpeech] Recognition error:', error);

      if (error === 'no-speech') {
        // Pauses are natural during emergency examination; do not abort session
        this.updateStatusText('Ожидание речи...');
        return;
      }

      if (error === 'not-allowed' || error === 'service-not-allowed') {
        this.explicitStop = true;
        this.stop();
        this.playErrorTone();
        this.updateStatusText('Доступ к микрофону заблокирован. Разрешите доступ в настройках.');
        if (this.onStateChange) this.onStateChange(false, 'not-allowed');
        return;
      }

      if (error === 'audio-capture') {
        this.explicitStop = true;
        this.stop();
        this.playErrorTone();
        this.updateStatusText('Микрофон не обнаружен или занят другим приложением.');
        if (this.onStateChange) this.onStateChange(false, 'audio-capture');
        return;
      }

      if (error === 'network') {
        this.consecutiveErrors++;
        this.updateStatusText('Ошибка сети при распознавании...');
        if (this.consecutiveErrors >= 3) {
          this.explicitStop = true;
          this.stop();
          this.playErrorTone();
          this.updateStatusText('Ошибка сети при распознавании речи. Проверьте интернет-соединение.');
          if (this.onStateChange) this.onStateChange(false, 'network');
        }
        return;
      }

      if (error === 'aborted') {
        // Deliberate abort during shutdown or browser pause
        return;
      }

      this.updateStatusText(`Ошибка распознавания: ${error}`);
    };

    this.recognition.onend = () => {
      // Resilience against brief pauses:
      // If user hasn't explicitly stopped and isListening is true, restart automatically
      if (this._isListening && !this.explicitStop) {
        this._scheduleRestart();
      } else {
        this._stopAudioCapture();
        this.updateUI(false);
      }
    };
  }

  _scheduleRestart() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (!this._isListening || this.explicitStop) return;

    this.restartAttempts++;
    if (this.restartAttempts > 10) {
      console.warn('[MedicalSpeech] Exceeded maximum restart attempts without speech input.');
      this.stop();
      this.updateStatusText('Распознавание завершено.');
      return;
    }

    this.restartTimer = setTimeout(() => {
      if (!this._isListening || this.explicitStop) return;
      try {
        if (this.recognition) {
          this.recognition.start();
        }
      } catch (err) {
        if (err.name !== 'InvalidStateError') {
          console.warn('[MedicalSpeech] Restart exception:', err);
        }
        // Secondary fallback retry
        this.restartTimer = setTimeout(() => {
          if (this._isListening && !this.explicitStop) {
            try { this.recognition.start(); } catch (_) {}
          }
        }, 250);
      }
    }, 120);
  }

  // ==========================================
  // Web Audio Synthesizers (Zero MP3/WAV)
  // ==========================================

  _ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  playTone(frequency, startTime, duration, type = 'sine', peakGain = 0.15) {
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, startTime);

      const attack = 0.012;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peakGain, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn('[MedicalSpeech] Synthesizer error:', e);
    }
  }

  /**
   * Pleasant ascending two-tone chime (440Hz -> 880Hz sine)
   */
  playChimeStart() {
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(440, now, 0.10, 'sine', 0.18);
    this.playTone(880, now + 0.08, 0.16, 'sine', 0.14);
  }

  /**
   * Soft descending two-tone chime (880Hz -> 440Hz sine)
   */
  playChimeEnd() {
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(880, now, 0.09, 'sine', 0.15);
    this.playTone(440, now + 0.07, 0.16, 'sine', 0.13);
  }

  /**
   * Gentle warning low tone
   */
  playErrorTone() {
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(220, now, 0.18, 'sine', 0.18);
    this.playTone(196, now + 0.10, 0.22, 'sine', 0.15);
  }

  // ==========================================
  // Mobile Haptic Feedback
  // ==========================================

  triggerHaptic(pattern) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  // ==========================================
  // Web Audio Stream & Visualizer
  // ==========================================

  async _startAudioCapture() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return;
    }

    const audioCtx = this._ensureAudioContext();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (audioCtx) {
        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.75;

        this.timeDomainData = new Uint8Array(this.analyser.fftSize);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        this.micSource = audioCtx.createMediaStreamSource(this.mediaStream);
        this.micSource.connect(this.analyser);
        // NOTE: Analyser is deliberately NOT connected to ctx.destination
        // to prevent microphone feedback loop into user's speakers
      }

      this._startVisualizerLoop();
    } catch (err) {
      console.warn('[MedicalSpeech] Audio capture error:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.updateStatusText('Доступ к микрофону отклонен.');
        this.playErrorTone();
        this.stop();
        if (this.onStateChange) this.onStateChange(false, 'not-allowed');
        throw err;
      }
    }
  }

  _stopAudioCapture() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (_) {}
      this.micSource = null;
    }
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
      this.mediaStream = null;
    }
    this._renderIdleCanvases();
  }

  /**
   * Attaches a canvas element to render live glowing audio waveforms.
   * @param {HTMLCanvasElement|string} canvasEl
   */
  attachCanvas(canvasEl) {
    let el = canvasEl;
    if (typeof el === 'string' && typeof document !== 'undefined') {
      el = document.querySelector(el);
    }
    if (el && el.tagName === 'CANVAS') {
      this.attachedCanvases.add(el);
      if (this._isListening && !this.animFrameId) {
        this._startVisualizerLoop();
      } else {
        this._renderCanvasWaveform(el, null, 0);
      }
    }
    return this;
  }

  detachCanvas(canvasEl) {
    let el = canvasEl;
    if (typeof el === 'string' && typeof document !== 'undefined') {
      el = document.querySelector(el);
    }
    if (el) {
      this.attachedCanvases.delete(el);
    }
    return this;
  }

  _startVisualizerLoop() {
    if (this.animFrameId) return;

    const render = () => {
      if (!this._isListening) {
        this._renderIdleCanvases();
        return;
      }

      let volume = 0;
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        this.analyser.getByteFrequencyData(this.frequencyData);

        let sum = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
          sum += this.frequencyData[i];
        }
        volume = Math.min(1.0, (sum / this.frequencyData.length) / 80.0);
      }

      // Update DOM frequency bars
      this._updateWaveBars(this.frequencyData, volume);

      this.idlePhase += 0.08;

      // Render all registered canvases
      for (const canvas of this.attachedCanvases) {
        this._renderCanvasWaveform(canvas, this.timeDomainData, volume);
      }

      this.animFrameId = requestAnimationFrame(render);
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  _renderIdleCanvases() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    for (const canvas of this.attachedCanvases) {
      this._renderCanvasWaveform(canvas, null, 0);
    }
  }

  _renderCanvasWaveform(canvas, timeData, volume) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
    const width = rect.width > 0 ? rect.width : (canvas.width / dpr || 140);
    const height = rect.height > 0 ? rect.height : (canvas.height / dpr || 24);

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;

    // ECG-style faint horizontal reference baseline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // High-visibility glowing cyan-sky clinical gradient
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
    grad.addColorStop(0.2, 'rgba(56, 189, 248, 0.9)');
    grad.addColorStop(0.5, 'rgba(14, 165, 233, 1.0)');
    grad.addColorStop(0.8, 'rgba(56, 189, 248, 0.9)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.15)');

    ctx.beginPath();
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = grad;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowBlur = Math.min(10, 3 + volume * 10);

    const bufferLength = timeData ? timeData.length : 0;
    const isSpeaking = this._isListening && bufferLength > 0 && volume > 0.025;

    if (isSpeaking) {
      const sliceWidth = width / (bufferLength - 1);
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const norm = (timeData[i] - 128) / 128.0;
        const maxAmp = (height * 0.44) * Math.min(1.8, 0.5 + volume * 2.0);
        const y = centerY + norm * maxAmp;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
    } else {
      // Gentle glowing idle sinusoidal breathing wave
      const points = 30;
      const step = width / points;
      for (let i = 0; i <= points; i++) {
        const nx = i / points;
        const windowing = Math.sin(Math.PI * nx);
        const amp = this._isListening ? (height * 0.18 * windowing) : 0;
        const y = centerY + Math.sin(this.idlePhase + i * 0.4) * amp;
        if (i === 0) {
          ctx.moveTo(i * step, y);
        } else {
          ctx.lineTo(i * step, y);
        }
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  _updateWaveBars(freqData, volume) {
    if (typeof document === 'undefined') return;
    const barsContainer = document.getElementById('voice-bars');
    if (!barsContainer) return;
    const bars = barsContainer.querySelectorAll('.wave-bar');
    if (!bars || bars.length === 0) return;

    if (!this._isListening || !freqData || volume <= 0.02) {
      bars.forEach((b) => {
        b.style.height = '4px';
        b.style.opacity = '0.4';
      });
      return;
    }

    const step = Math.floor(freqData.length / (bars.length + 1));
    bars.forEach((bar, idx) => {
      const val = freqData[(idx + 1) * step] || 0;
      const height = Math.max(4, Math.min(18, Math.round((val / 255) * 18)));
      bar.style.height = `${height}px`;
      bar.style.opacity = (0.4 + (val / 255) * 0.6).toFixed(2);
    });
  }

  _resetWaveBars() {
    if (typeof document === 'undefined') return;
    const barsContainer = document.getElementById('voice-bars');
    if (!barsContainer) return;
    const bars = barsContainer.querySelectorAll('.wave-bar');
    bars.forEach((b) => {
      b.style.height = '4px';
      b.style.opacity = '0.4';
    });
  }

  // ==========================================
  // Smart Medical Dictation Text Cleaner
  // ==========================================

  /**
   * Sanitizes and transforms spoken clinical dictation into standardized medical notation.
   * @param {string} text
   * @returns {string}
   */
  formatMedicalText(text) {
    return MedicalSpeech.formatMedicalText(text);
  }

  static formatMedicalText(text) {
    if (!text || typeof text !== 'string') return '';
    try {
      let s = text;

      // 1. Blood Pressure: "давление 120 на 80", "артериальное давление 120 на 80", "АД 120 на 80", "давление 120/80" -> "АД 120/80"
      s = s.replace(/(?:(?<!\p{L})(?:артериальное\s+)?давление|(?<!\p{L})ад)\s*(?::\s*)?(\d{2,3})\s*(?:на|\/)\s*(\d{2,3})/giu, 'АД $1/$2');

      // 2. Pulse / Heart Rate: "пульс [число]" -> "ЧСС [число]/мин"
      // Also "пульс 78 ударов в минуту", "пульс 78 в минуту", "чсс 78" -> "ЧСС 78/мин"
      s = s.replace(/(?<!\p{L})(?:пульс|чсс)\s*(?::\s*)?(\d{2,3})(?:\s*(?:ударов|уд)?(?:\s*(?:\/|в)\s*мин(?:уту)?|\/мин|в минуту))?/giu, 'ЧСС $1/мин');

      // 3. Oxygen Saturation: "сатурация [число]" -> "SpO2 [число]%"
      // Also "сатурация 98%", "сатурация 98 процентов", "spo2 98", "спо2 98" -> "SpO2 98%"
      s = s.replace(/(?<!\p{L})(?:сатурация|спо2|sp\s*o2|spo2)\s*(?::\s*)?(\d{2,3})(?:\s*(?:%|процент(?:а|ов)?))?/giu, 'SpO2 $1%');

      // 4. Temperature:
      // "температура 37 и 5" / "37 и 2" -> "t 37.5°C" / "t 37.2°C"
      // Explicit "температура 37 и 5", "температура 37.5", "температура 37,2"
      s = s.replace(/(?<!\p{L})(?:температура|темп(?:\.|\b))\s*(?::\s*)?(\d{2})\s*(?:и|,|\.)\s*(\d)(?:\s*(?:градус(?:а|ов)?(?:\s*цельсия)?|°c|°))?/giu, 't $1.$2°C');

      // Standalone "37 и 5" / "37 и 2" / "36 и 6" (human body temp range 34..42)
      s = s.replace(/(?<!\d|\p{L})(3[4-9]|4[0-2])\s*и\s*(\d)(?!\s*(?:года|лет|мес|дн|час|мин|сек|кг|мг|мл|см|мм|%)|\d)/giu, 't $1.$2°C');

      // Integer temperature: "температура 38", "температура 39 градусов"
      s = s.replace(/(?<!\p{L})(?:температура|темп(?:\.|\b))\s*(?::\s*)?(\d{2})(?!\s*[.,и]\s*\d)(?!\s*°C)(?:\s*(?:градус(?:а|ов)?(?:\s*цельсия)?|°c|°))?/giu, 't $1°C');

      // 5. Respiratory Rate: "чдд [число]" -> "ЧДД [число]/мин"
      s = s.replace(/(?<!\p{L})(?:чдд|частота\s+дыхания)\s*(?::\s*)?(\d{1,2})(?:\s*(?:в\s*мин(?:уту)?|\/мин))?/giu, 'ЧДД $1/мин');

      // 6. Blood Glucose: "глюкоза 5.6", "сахар 6.2" -> "Глюкоза 5.6 ммоль/л"
      s = s.replace(/(?<!\p{L})(?:глюкоза|сахар\s+крови|сахар)\s*(?::\s*)?(\d{1,2}(?:[.,]\d)?)(?:\s*ммоль(?:\/л)?)?/giu, 'Глюкоза $1 ммоль/л');

      // 7. Clinical acronyms
      s = s.replace(/(?<!\p{L})(экг|слр|ивл|узи|кт|мрт|оак|оам|бх)(?!\p{L})/giu, (m) => m.toUpperCase());

      // Administration routes
      s = s.replace(/(?<!\p{L})(?:в\/в|внутривенно)(?!\p{L})/giu, 'в/в');
      s = s.replace(/(?<!\p{L})(?:в\/м|внутримышечно)(?!\p{L})/giu, 'в/м');

      // Insert comma between consecutive vital signs if spoken without punctuation
      s = s.replace(/(\d+(?:\/\d+)?|%|°C|\/мин)\s+(?=(?:АД|ЧСС|SpO2|ЧДД|t\s+\d|Глюкоза))/gu, '$1, ');

      // 8. Clean spacing & formatting
      s = s.replace(/\s+/g, ' ');
      s = s.replace(/\s+([,.:;?!])/g, '$1');
      s = s.replace(/([,;?!])([^\s])/g, '$1 $2');
      s = s.replace(/\.([а-яёa-zА-ЯЁA-Z])/gu, '. $1');

      // 9. Sentence capitalization (preserving lowercase 't' in 't 37.5°C')
      s = s.replace(/(^\s*|[.!?]\s+)([a-zа-яё])/gu, (m, prefix, char, offset, fullStr) => {
        const after = fullStr.slice(offset + m.length);
        if ((char === 't' || char === 'T') && /^\s*\d{2}(?:\.\d)?°C/i.test(after)) {
          return prefix + 't';
        }
        return prefix + char.toUpperCase();
      });

      return s.trim();
    } catch (e) {
      console.warn('[MedicalSpeech] formatMedicalText fallback:', e);
      return text.trim();
    }
  }

  // ==========================================
  // DOM & UI Management
  // ==========================================

  setupDOM() {
    if (typeof document === 'undefined') return;

    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      micBtn.onclick = (e) => {
        e.preventDefault();
        this.toggle();
      };
    }

    // Auto-attach canvas inside #voice-banner if present
    const banner = document.getElementById('voice-banner');
    if (banner) {
      const canvas = banner.querySelector('canvas');
      if (canvas) {
        this.attachCanvas(canvas);
      }
    }
  }

  updateUI(listening) {
    if (typeof document === 'undefined') return;

    const micBtn = document.getElementById('mic-btn');
    const banner = document.getElementById('voice-banner');
    const status = document.getElementById('voice-status');

    if (listening) {
      if (micBtn) {
        micBtn.classList.remove('bg-slate-800', 'text-sky-400', 'bg-sky-500', 'animate-pulse');
        micBtn.classList.add('bg-red-600', 'text-white', 'recording-pulse-ring');
        micBtn.setAttribute('title', 'Остановить запись');
      }
      if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
      }
      if (status) {
        status.innerText = 'Слушаю вас...';
      }
    } else {
      if (micBtn) {
        micBtn.classList.remove('bg-red-600', 'text-white', 'recording-pulse-ring', 'bg-sky-500', 'animate-pulse');
        micBtn.classList.add('bg-slate-800', 'text-sky-400');
        micBtn.setAttribute('title', 'Голосовой ввод');
      }
      if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
      }
      this._resetWaveBars();
    }
  }

  updateStatusText(text) {
    if (typeof document === 'undefined') return;
    const status = document.getElementById('voice-status');
    if (status) {
      status.innerText = text;
    }
  }

  // ==========================================
  // Public Control API: start(), stop(), toggle()
  // ==========================================

  async start() {
    if (this._isListening) return true;

    if (!this.isSupported) {
      this.updateStatusText('Голосовой ввод не поддерживается браузером.');
      this.playErrorTone();
      if (this.onStateChange) this.onStateChange(false, 'unsupported');
      return false;
    }

    this.explicitStop = false;
    this._isListening = true;
    this.accumulatedFinalText = '';
    this.latestInterim = '';
    this.consecutiveErrors = 0;
    this.restartAttempts = 0;

    // Mobile haptic pulse (30ms)
    this.triggerHaptic([30]);

    // Ascending start chime
    this.playChimeStart();

    // Visual indicators
    this.updateUI(true);

    // Start Web Audio analyser & visualizer
    try {
      await this._startAudioCapture();
    } catch (e) {
      console.warn('[MedicalSpeech] Audio stream initiation note:', e);
    }

    // Launch speech recognition
    try {
      this.recognition.start();
    } catch (e) {
      if (e.name !== 'InvalidStateError') {
        console.warn('[MedicalSpeech] Recognition start error:', e);
      }
    }

    return true;
  }

  stop(commit = true) {
    if (!this._isListening && !this.explicitStop) {
      this.updateUI(false);
      return;
    }

    this.explicitStop = true;
    this._isListening = false;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    // Mobile haptic pulse ([15, 50, 15]ms)
    this.triggerHaptic([15, 50, 15]);

    // Descending end chime
    this.playChimeEnd();

    // Terminate speech recognition session
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    // Stop microphone stream & visualizer
    this._stopAudioCapture();

    // Update UI elements
    this.updateUI(false);

    // Merge finalized text with any remaining interim speech only if committed
    if (commit) {
      let combined = this.accumulatedFinalText;
      if (this.latestInterim && this.latestInterim.trim()) {
        combined += ' ' + this.latestInterim;
      }
      const formattedFinal = this.formatMedicalText(combined);

      if (this.onFinal && formattedFinal) {
        this.onFinal(formattedFinal);
      }
    }

    if (this.onStateChange) {
      this.onStateChange(false);
    }

    // Reset transcription buffers
    this.accumulatedFinalText = '';
    this.latestInterim = '';
    this.restartAttempts = 0;
  }

  /**
   * Immediately aborts and discards all speech recognition sessions without committing.
   * Engineered for instant execution when user presses Send.
   */
  abort() {
    this.explicitStop = true;
    this._isListening = false;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.accumulatedFinalText = '';
    this.latestInterim = '';
    this.restartAttempts = 0;

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (_) {}
    }

    this._stopAudioCapture();
    this.updateUI(false);

    if (this.onStateChange) {
      this.onStateChange(false);
    }
  }

  toggle() {
    if (this._isListening) {
      this.stop();
    } else {
      this.start();
    }
  }
}

// Global exposure
if (typeof window !== 'undefined') {
  window.MedicalSpeech = MedicalSpeech;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedicalSpeech;
  module.exports.MedicalSpeech = MedicalSpeech;
}
