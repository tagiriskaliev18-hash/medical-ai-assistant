// Clinical Audio Tools: CPR Metronome (110 BPM) & Medical Timers

class ClinicalAudio {
  constructor() {
    this.ctx = null;
    this.cprInterval = null;
    this.isCprPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq = 800, type = 'sine', duration = 0.08, gainVal = 0.3) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio play error", e);
    }
  }

  playChimeStart() {
    this.playTone(523.25, 'triangle', 0.12, 0.2); // C5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.16, 0.25), 100); // E5
  }

  playChimeEnd() {
    this.playTone(659.25, 'triangle', 0.12, 0.2);
    setTimeout(() => this.playTone(523.25, 'triangle', 0.16, 0.2), 100);
  }

  playAlertAlarm() {
    this.playTone(880, 'sawtooth', 0.15, 0.3);
    setTimeout(() => this.playTone(880, 'sawtooth', 0.15, 0.3), 200);
  }

  // CPR Metronome: ERC/AHA recommendation is 100-120 bpm (110 bpm is ideal)
  toggleCPRMetronome(onTickCallback) {
    if (this.isCprPlaying) {
      this.stopCPRMetronome();
      return false;
    } else {
      this.startCPRMetronome(onTickCallback);
      return true;
    }
  }

  startCPRMetronome(onTickCallback) {
    this.init();
    this.isCprPlaying = true;
    const intervalMs = Math.round(60000 / 110); // ~545ms for 110 BPM
    let count = 0;

    this.cprInterval = setInterval(() => {
      count++;
      // High pitch every 30 compressions to signal 2 breaths
      if (count % 30 === 0) {
        this.playTone(1200, 'square', 0.1, 0.4);
      } else {
        this.playTone(880, 'sine', 0.06, 0.3);
      }
      if (onTickCallback) {
        onTickCallback(count);
      }
    }, intervalMs);
  }

  stopCPRMetronome() {
    if (this.cprInterval) {
      clearInterval(this.cprInterval);
      this.cprInterval = null;
    }
    this.isCprPlaying = false;
  }
}

const clinicalAudio = new ClinicalAudio();
