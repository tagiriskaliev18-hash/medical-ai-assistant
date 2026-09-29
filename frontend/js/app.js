// Main Application Controller: Chat, SSE Streaming, Voice, and UI Orchestration

class MedicalApp {
  constructor() {
    this.messages = [];
    this.isStreaming = false;
    this.voiceAssistant = null;
    this.autoTTS = false;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupVoice();
    this.loadConfig();
  }

  setupEventListeners() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const ttsToggle = document.getElementById('tts-toggle');
    const settingsBtn = document.getElementById('settings-btn');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      // Auto-grow textarea
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (this.voiceAssistant) {
          this.voiceAssistant.toggle();
        }
      });
    }

    if (ttsToggle) {
      ttsToggle.addEventListener('click', () => {
        this.autoTTS = !this.autoTTS;
        ttsToggle.classList.toggle('text-sky-400', this.autoTTS);
        ttsToggle.classList.toggle('text-slate-400', !this.autoTTS);
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }
  }

  setupVoice() {
    const micBtn = document.getElementById('mic-btn');
    const voiceStatus = document.getElementById('voice-status');
    const input = document.getElementById('user-input');

    this.voiceAssistant = new VoiceAssistant(
      // On speech result
      (result) => {
        if (input) {
          input.value = result.combined;
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        }
        if (voiceStatus) {
          voiceStatus.innerText = `«${result.combined}»`;
        }
      },
      // On status change
      (status) => {
        if (micBtn) {
          if (status.listening) {
            micBtn.classList.add('listening-active');
            document.getElementById('voice-bars').classList.remove('hidden');
          } else {
            micBtn.classList.remove('listening-active');
            document.getElementById('voice-bars').classList.add('hidden');
          }
        }
        if (voiceStatus) {
          voiceStatus.innerText = status.text;
        }
      }
    );
  }

  async sendMessage(customText = null) {
    if (this.isStreaming) return;

    const input = document.getElementById('user-input');
    const text = customText || (input ? input.value.trim() : '');
    if (!text) return;

    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    // Stop voice listening if active
    if (this.voiceAssistant && this.voiceAssistant.isListening) {
      this.voiceAssistant.stop();
    }

    // Append User Message to Chat
    this.appendMessage('user', text);

    // Prepare Doctor response container
    const doctorMsgEl = this.appendMessage('doctor', '', true);
    this.isStreaming = true;
    this.updateSendButtonState(true);

    let fullResponseText = '';

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: this.messages.slice(-6)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep partial line in buffer

        for (const block of lines) {
          if (block.startsWith('data: ')) {
            const rawData = block.replace('data: ', '').trim();
            if (rawData === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(rawData);
              if (parsed.token) {
                fullResponseText += parsed.token;
                this.renderDoctorContent(doctorMsgEl, fullResponseText);
              }
            } catch (err) {
              console.warn("SSE json parse error", err);
            }
          }
        }
      }

      // Finish streaming
      this.isStreaming = false;
      this.updateSendButtonState(false);
      doctorMsgEl.classList.remove('cursor-blink');

      // Final render to resolve all procedure tags
      this.renderDoctorContent(doctorMsgEl, fullResponseText, true);

      // Save to history
      this.messages.push({ role: 'user', content: text });
      this.messages.push({ role: 'assistant', content: fullResponseText });

      // Voice TTS if enabled
      if (this.autoTTS) {
        medicalTTS.speak(fullResponseText);
      }

    } catch (e) {
      console.error("Streaming error:", e);
      this.isStreaming = false;
      this.updateSendButtonState(false);
      doctorMsgEl.classList.remove('cursor-blink');
      doctorMsgEl.innerHTML = `
        <div class="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
          ⚠️ Не удалось связаться с сервером. Пожалуйста, повторите запрос или проверьте соединение.
        </div>
      `;
    }
  }

  appendMessage(sender, content, isStreamingPlaceholder = false) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return null;

    // Hide welcome banner if present
    const welcome = document.getElementById('welcome-card');
    if (welcome) welcome.style.display = 'none';

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `flex gap-3 mb-5 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

    if (sender === 'user') {
      msgWrapper.innerHTML = `
        <div class="max-w-[85%] md:max-w-[70%] bg-sky-600 text-white rounded-2xl rounded-tr-sm p-4 shadow-lg text-sm leading-relaxed">
          ${this.escapeHtml(content)}
        </div>
        <div class="w-8 h-8 rounded-full bg-sky-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow">
          Я
        </div>
      `;
    } else {
      msgWrapper.innerHTML = `
        <div class="w-9 h-9 rounded-full bg-emerald-600 flex-shrink-0 flex items-center justify-center text-white text-base shadow border border-emerald-400/40">
          🩺
        </div>
        <div class="max-w-[90%] md:max-w-[80%] bg-slate-800/90 text-slate-100 rounded-2xl rounded-tl-sm p-5 shadow-xl border border-slate-700/80 text-sm leading-relaxed markdown-body ${isStreamingPlaceholder ? 'cursor-blink' : ''}">
          ${content}
        </div>
      `;
    }

    chatContainer.appendChild(msgWrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    return msgWrapper.querySelector('.markdown-body');
  }

  renderDoctorContent(container, rawMarkdown, isFinal = false) {
    if (!container) return;

    let html = this.parseSimpleMarkdown(rawMarkdown);

    // Replace procedure tags [PROCEDURE:xyz]
    html = html.replace(/\[PROCEDURE:([a-zA-Z0-9_]+)\]/g, (match, procId) => {
      return proceduresManager.renderCard(procId);
    });

    container.innerHTML = html;

    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  parseSimpleMarkdown(md) {
    if (!md) return '';
    let text = md;

    // Headers
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // GitHub style alerts
    text = text.replace(/>\s*\[!CAUTION\]\s*\n((?:>.*(?:\n|$))*)/g, (match, body) => {
      const cleanBody = body.replace(/^>\s*/gm, '');
      return `<div class="p-3 my-2 bg-red-950/60 border border-red-500 rounded-lg text-red-200 text-xs shadow-md">🚨 ${cleanBody}</div>`;
    });

    // Lists
    text = text.replace(/^\s*\-\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

    // Line breaks
    text = text.replace(/\n\n/g, '<br/><br/>');

    return text;
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  updateSendButtonState(isBusy) {
    const btn = document.getElementById('send-btn');
    if (!btn) return;
    if (isBusy) {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>`;
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btn.innerHTML = `<span>➤</span>`;
    }
  }

  async loadConfig() {
    try {
      const res = await fetch('/api/chat/config');
      const data = await res.json();
      const infoEl = document.getElementById('active-model-info');
      if (infoEl) {
        infoEl.innerText = `${data.model} (${data.api_key_masked || 'active'})`;
      }
    } catch (e) {}
  }

  openSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async saveSettings() {
    const key = document.getElementById('settings-key').value;
    const url = document.getElementById('settings-url').value;
    const model = document.getElementById('settings-model').value;

    try {
      await fetch('/api/chat/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key || undefined,
          base_url: url || undefined,
          model: model || undefined
        })
      });
      this.loadConfig();
      this.closeSettings();
      alert("Настройки успешно сохранены!");
    } catch (e) {
      alert("Ошибка сохранения: " + e);
    }
  }
}

// Global instance
let medicalApp;
document.addEventListener('DOMContentLoaded', () => {
  medicalApp = new MedicalApp();
});
