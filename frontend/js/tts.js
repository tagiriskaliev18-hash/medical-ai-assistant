// Medical Speech Synthesis (TTS) - Audio Playback of Doctor Advice

class MedicalTTS {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isPlaying = false;
  }

  speak(text, onEnd) {
    if (!this.synth) return;
    this.stop();

    // Clean markdown symbols for natural speech
    const cleanText = text
      .replace(/###|##|#|\*|_|`|\[PROCEDURE:[^\]]+\]/g, ' ')
      .replace(/>\s*\[!(CAUTION|WARNING|NOTE)\]/g, ' Внимание: ')
      .replace(/🔴|🟡|🟢|⚡|⛔|🖼️|👨‍⚕️|⚖️|❌|✓|♥/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    this.utterance = new SpeechSynthesisUtterance(cleanText);
    this.utterance.lang = 'ru-RU';
    this.utterance.rate = 1.05; // Slightly clear and brisk
    this.utterance.pitch = 1.0;

    // Pick best Russian voice if available
    const voices = this.synth.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith('ru') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Yandex') || v.name.includes('Microsoft')));
    if (ruVoice) {
      this.utterance.voice = ruVoice;
    }

    this.isPlaying = true;
    this.utterance.onend = () => {
      this.isPlaying = false;
      if (onEnd) onEnd();
    };
    this.utterance.onerror = () => {
      this.isPlaying = false;
      if (onEnd) onEnd();
    };

    this.synth.speak(this.utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
  }
}

const medicalTTS = new MedicalTTS();
