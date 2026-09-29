// Real-time Voice Recognition Module using Web Speech API

class VoiceAssistant {
  constructor(onResult, onStatusChange) {
    this.recognition = null;
    this.isListening = false;
    this.onResult = onResult;
    this.onStatusChange = onStatusChange;
    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser.");
      if (this.onStatusChange) {
        this.onStatusChange({ supported: false, listening: false, text: "Голосовой ввод не поддерживается браузером" });
      }
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ru-RU';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.recognition.onstart = () => {
      this.isListening = true;
      clinicalAudio.playChimeStart();
      if (this.onStatusChange) {
        this.onStatusChange({ supported: true, listening: true, text: "Слушаю вас... Говорите симптомы" });
      }
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (this.onResult) {
        this.onResult({
          final: finalTranscript,
          interim: interimTranscript,
          combined: finalTranscript || interimTranscript
        });
      }
    };

    this.recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      this.stop();
      if (this.onStatusChange) {
        this.onStatusChange({ 
          supported: true, 
          listening: false, 
          text: event.error === 'not-allowed' ? "Доступ к микрофону заблокирован" : "Ошибка распознавания речи" 
        });
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.stop();
      }
    };
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (!this.recognition) {
      alert("Ваш браузер не поддерживает голосовой ввод Web Speech API. Рекомендуется Google Chrome, Edge или Яндекс.Браузер.");
      return;
    }
    try {
      this.recognition.start();
    } catch (e) {
      console.warn("Speech start exception:", e);
    }
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    clinicalAudio.playChimeEnd();
    if (this.onStatusChange) {
      this.onStatusChange({ supported: true, listening: false, text: "Микрофон отключен" });
    }
  }
}
