class MedicalSpeech {
  constructor(onInterim, onFinal) {
    this.recognition = null;
    this.isListening = false;
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.fullTranscript = '';
    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ru-RU';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.setupDOM();

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI(true);
      if (window.clinicalAudio) window.clinicalAudio.playChimeStart();
      this.fullTranscript = '';
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this.fullTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const combined = this.fullTranscript + interimTranscript;
      if (this.onInterim) this.onInterim(combined);
      
      const status = document.getElementById('voice-status');
      if (status) status.innerText = interimTranscript || "Слушаю вас...";
    };

    this.recognition.onerror = (event) => {
      console.error("Speech error:", event.error);
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.stop();
      }
    };
  }

  setupDOM() {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (this.isListening) this.stop();
        else this.start();
      });
    }
  }

  updateUI(listening) {
    const micBtn = document.getElementById('mic-btn');
    const banner = document.getElementById('voice-banner');
    const bars = document.getElementById('voice-bars');
    const status = document.getElementById('voice-status');
    
    if (listening) {
      if (micBtn) {
        micBtn.classList.add('bg-sky-500', 'text-white');
        micBtn.classList.add('animate-pulse');
      }
      if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
      }
      if (status) status.innerText = "Слушаю вас...";
    } else {
      if (micBtn) {
        micBtn.classList.remove('bg-sky-500', 'text-white', 'animate-pulse');
        micBtn.classList.add('bg-slate-800', 'text-sky-400');
      }
      if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
      }
    }
  }

  start() {
    if (!this.recognition) return alert("Голосовой ввод не поддерживается браузером.");
    try {
      this.recognition.start();
    } catch (e) {}
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.updateUI(false);
    if (window.clinicalAudio) window.clinicalAudio.playChimeEnd();
    
    // Auto submit final text
    if (this.fullTranscript.trim() && this.onFinal) {
      this.onFinal(this.fullTranscript);
    }
  }
}

window.MedicalSpeech = MedicalSpeech;
