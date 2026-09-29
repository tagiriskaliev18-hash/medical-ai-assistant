// Main Application Controller: Chat, SSE Streaming, Voice, and UI Orchestration

class MedicalApp {
  constructor() {
    this.messages = [];
    this.isStreaming = false;
    this.voiceAssistant = null;
    this.autoTTS = false;
    
    // Initialize client-side engines
    if (window.clinicalEngine) {
      window.clinicalEngine.loadData();
    }

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupVoice();
  }

  setupEventListeners() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

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
  }

  setupVoice() {
    if (window.MedicalSpeech) {
      this.voiceAssistant = new window.MedicalSpeech((transcript) => {
        const input = document.getElementById('user-input');
        if (input) {
          input.value = transcript;
          input.dispatchEvent(new Event('input'));
        }
      }, (finalTranscript) => {
        const input = document.getElementById('user-input');
        if (input) {
          input.value = finalTranscript;
        }
        // Auto-send when voice stops
        setTimeout(() => this.sendMessage(), 500);
      });
    }
  }

  toggleTTS() {
    this.autoTTS = !this.autoTTS;
    const btn = document.getElementById('tts-toggle');
    if (btn) {
      btn.style.opacity = this.autoTTS ? '1' : '0.5';
    }
    if (!this.autoTTS && window.medicalTTS) {
      window.medicalTTS.stop();
    }
  }

  async sendMessage(overrideText = null) {
    if (this.isStreaming) return;
    
    const inputEl = document.getElementById('user-input');
    const text = overrideText || inputEl.value.trim();
    if (!text) return;

    if (!overrideText) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    this.appendMessage('user', text);
    this.updateSendButtonState(true);
    this.isStreaming = true;

    const doctorMsgEl = this.appendMessage('assistant', '', true);
    
    let isEmergency = false;
    let engineContext = [];

    // Local Clinical Engine Scan
    if (window.clinicalEngine) {
      const redFlag = window.clinicalEngine.scanRedFlags(text);
      if (redFlag) {
        isEmergency = true;
        // Inject Red Flag UI directly
        const rfHtml = `
<div class="mb-4 bg-red-950/80 border border-red-500 rounded-xl p-4 shadow-lg animate-pulse">
  <div class="flex items-center gap-2 mb-2">
    <span class="text-2xl">🚨</span>
    <h3 class="text-red-400 font-bold text-sm uppercase tracking-wide">КРИТИЧЕСКОЕ СОСТОЯНИЕ</h3>
  </div>
  <p class="text-white text-base font-bold mb-2">${redFlag.title}</p>
  <p class="text-red-200 mb-3">${redFlag.action}</p>
  ${redFlag.procedure_id ? `[PROCEDURE:${redFlag.procedure_id}]` : ''}
</div>`;
        this.renderDoctorContent(doctorMsgEl, rfHtml);
      }
      
      engineContext = window.clinicalEngine.findGuidelines(text);
    }

    let fullResponseText = '';

    try {
      if (window.llmClient) {
        await window.llmClient.streamChat(
          this.messages.slice(-6),
          engineContext,
          isEmergency,
          // onChunk
          (chunk) => {
            fullResponseText += chunk;
            this.renderDoctorContent(doctorMsgEl, fullResponseText);
          },
          // onError
          (errMsg) => {
            this.isStreaming = false;
            this.updateSendButtonState(false);
            doctorMsgEl.classList.remove('cursor-blink');
            this.renderDoctorContent(doctorMsgEl, `<div class="text-red-400">⚠️ ${errMsg}</div>`);
          },
          // onComplete
          (finalText) => {
            this.isStreaming = false;
            this.updateSendButtonState(false);
            doctorMsgEl.classList.remove('cursor-blink');
            this.renderDoctorContent(doctorMsgEl, finalText, true);
            
            this.messages.push({ role: 'user', content: text });
            this.messages.push({ role: 'assistant', content: finalText });

            if (this.autoTTS && window.medicalTTS) {
              window.medicalTTS.speak(finalText);
            }
          }
        );
      } else {
        throw new Error("LLM Client not loaded.");
      }
    } catch (e) {
      console.error("Streaming error:", e);
      this.isStreaming = false;
      this.updateSendButtonState(false);
      doctorMsgEl.classList.remove('cursor-blink');
      doctorMsgEl.innerHTML = `
        <div class="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
          ⚠️ Не удалось связаться с нейросетью. Пожалуйста, проверьте подключение.
        </div>
      `;
    }
  }

  appendMessage(sender, content, isStreamingPlaceholder = false) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return null;

    const welcome = document.getElementById('welcome-card');
    if (welcome) welcome.style.display = 'none';

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `flex gap-3 mb-5 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

    if (sender === 'user') {
      msgWrapper.innerHTML = `
        <div class="max-w-[85%] md:max-w-[75%] bg-sky-600 text-white rounded-2xl rounded-tr-sm p-4 shadow-lg text-sm leading-relaxed whitespace-pre-wrap">
          ${this.escapeHtml(content)}
        </div>
        <div class="w-8 h-8 rounded-full bg-sky-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow mt-1">
          Я
        </div>
      `;
    } else {
      msgWrapper.innerHTML = `
        <div class="w-9 h-9 rounded-full bg-emerald-600 flex-shrink-0 flex items-center justify-center text-white text-base shadow border border-emerald-400/40 mt-1">
          🩺
        </div>
        <div class="max-w-[90%] md:max-w-[85%] bg-slate-800/90 text-slate-100 rounded-2xl rounded-tl-sm p-5 shadow-xl border border-slate-700/80 text-sm leading-relaxed markdown-body ${isStreamingPlaceholder ? 'cursor-blink' : ''}">
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
    if (window.proceduresManager) {
      html = html.replace(/\[PROCEDURE:([a-zA-Z0-9_]+)\]/g, (match, procId) => {
        return window.proceduresManager.renderCard(procId);
      });
    }
    
    // Create DOM element to attach events if needed (though proceduresManager uses global event delegation)
    container.innerHTML = html;
    
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  parseSimpleMarkdown(md) {
    if (!md) return '';
    let text = md;
    text = text.replace(/^### (.*$)/gim, '<h3 class="text-md font-bold mt-4 mb-2 text-white">$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-4 mb-2 text-white">$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-2 text-white">$1</h1>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/>\s*\[!CAUTION\]\s*\n((?:>.*(?:\n|$))*)/g, (match, body) => {
      const cleanBody = body.replace(/^>\s*/gm, '');
      return `<div class="p-4 my-3 bg-red-950/80 border-l-4 border-red-500 rounded-r-lg text-red-100 text-sm shadow-md">🚨 ${cleanBody}</div>`;
    });
    text = text.replace(/^\s*\-\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal">$1</li>');
    text = text.replace(/\n\n/g, '<br/><br/>');
    return text;
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  updateSendButtonState(isBusy) {
    const btn = document.getElementById('send-btn');
    if (!btn) return;
    if (isBusy) {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      btn.innerHTML = `<span class="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>`;
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btn.innerHTML = `➤`;
    }
  }
}

let medicalApp;
document.addEventListener('DOMContentLoaded', () => {
  medicalApp = new MedicalApp();
});
