// Main Application Controller: Chat, SSE Streaming, Voice, Red Flags, Offline Support & Clinical Handoff

class MedicalApp {
  constructor() {
    this.messages = [];
    this.detectedRedFlags = [];
    this.isStreaming = false;
    this.voiceAssistant = null;
    this.autoTTS = false;
    this.isOffline = !navigator.onLine;
    
    // Initialize client-side clinical database
    if (window.clinicalEngine) {
      window.clinicalEngine.loadData();
    }

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupVoice();
    this.setupNetworkMonitoring();
    this.setupPWA();
    this.updateProviderBadge();
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

    // Modal close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
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
          input.dispatchEvent(new Event('input'));
        }
      });
    }
  }

  setupNetworkMonitoring() {
    const updateStatus = () => {
      this.isOffline = !navigator.onLine;
      const banner = document.getElementById('offline-indicator');
      if (banner) {
        if (this.isOffline) {
          banner.classList.remove('hidden');
          banner.classList.add('flex');
        } else {
          banner.classList.add('hidden');
          banner.classList.remove('flex');
        }
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  setupPWA() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker зарегистрирован:', reg.scope))
        .catch((err) => console.log('ServiceWorker не зарегистрирован:', err));
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

  updateProviderBadge() {
    const badge = document.getElementById('current-provider-badge');
    if (badge && window.llmClient) {
      const p = window.llmClient.config.provider;
      const map = {
        pollinations: 'Pollinations AI (Free)',
        groq: 'Groq (Llama-3)',
        openrouter: 'OpenRouter',
        ollama: 'Локальный Ollama',
        backend: 'FastAPI Backend',
        custom: 'Custom LLM API'
      };
      badge.innerText = map[p] || p;
    }
  }

  async sendMessage(overrideText = null) {
    if (this.isStreaming) return;
    
    const inputEl = document.getElementById('user-input');
    const text = overrideText || (inputEl ? inputEl.value.trim() : '');
    if (!text) return;

    if (!overrideText && inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    this.appendMessage('user', text);
    this.updateSendButtonState(true);
    this.isStreaming = true;

    const doctorMsgEl = this.appendMessage('assistant', '', true);
    
    let isEmergency = false;
    let engineContext = [];
    let redFlagAlert = null;

    // 1. Client-Side Clinical Engine Screening (Red Flags & Protocols)
    if (window.clinicalEngine) {
      redFlagAlert = window.clinicalEngine.scanRedFlags(text);
      if (redFlagAlert) {
        isEmergency = true;
        this.detectedRedFlags.push({
          time: new Date().toLocaleTimeString(),
          title: redFlagAlert.title,
          action: redFlagAlert.action,
          procedure_id: redFlagAlert.procedure_id
        });

        // Play alert audio chime
        if (window.clinicalAudio) {
          window.clinicalAudio.playAlertAlarm();
        }

        const rfHtml = `
<div class="mb-4 bg-red-950/90 border-2 border-red-500 rounded-xl p-4 shadow-2xl animate-pulse">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-2xl animate-bounce">🚨</span>
      <h3 class="text-red-400 font-extrabold text-sm uppercase tracking-wider">КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG)</h3>
    </div>
    <span class="text-xs px-2 py-0.5 rounded bg-red-800 text-red-100 font-mono">103 / 112</span>
  </div>
  <p class="text-white text-base font-bold mb-2">${redFlagAlert.title}</p>
  <p class="text-red-100 text-sm leading-relaxed mb-3">${redFlagAlert.action}</p>
  
  <div class="flex flex-wrap items-center gap-2 my-2">
    <a href="tel:103" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition shadow">
      📞 Вызов скорой: 103
    </a>
    <a href="tel:112" class="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition shadow">
      🚨 Единый номер: 112
    </a>
  </div>

  ${redFlagAlert.procedure_id ? `[PROCEDURE:${redFlagAlert.procedure_id}]` : ''}
</div>`;
        this.renderDoctorContent(doctorMsgEl, rfHtml);
      }
      
      engineContext = window.clinicalEngine.findGuidelines(text);
    }

    // 2. Offline Mode Fallback: Use Local Deterministic EBM Data
    if (!navigator.onLine) {
      setTimeout(() => {
        let offlineResponse = '';
        if (engineContext && engineContext.length > 0) {
          offlineResponse = `### 🔌 Режим офлайн (нет связи)\n\nНейросеть недоступна, но **локальная база доказательной медицины (EBM)** нашла совпадения в протоколах:\n\n`;
          engineContext.forEach(ctx => {
            offlineResponse += `#### Протокол: ${ctx.name}\n`;
            if (ctx.recommendations) {
              offlineResponse += `**Действия:**\n${ctx.recommendations.map(r => `- ${r}`).join('\n')}\n\n`;
            }
            if (ctx.medications && ctx.medications.length) {
              offlineResponse += `**Препараты (после очной консультации):** ${ctx.medications.join(', ')}\n\n`;
            }
            if (ctx.requires_doctor) {
              offlineResponse += `> [!CAUTION]\n> Данное состояние требует обязательного очного обращения к врачу!\n\n`;
            }
          });
        } else {
          offlineResponse = `### 🔌 Режим офлайн (нет связи)\n\nИнтернет временно недоступен. Если есть прямая угроза жизни, **немедленно звоните 103 или 112** (экстренный вызов работает даже при нулевом балансе и без сим-карты).\n\nВы можете воспользоваться карточками первой помощи из меню быстрых запросов выше.`;
        }

        const basePrefix = redFlagAlert ? '' : '';
        this.finalizeMessage(doctorMsgEl, text, offlineResponse);
      }, 300);
      return;
    }

    // 3. Online Mode: Stream via LLM Client
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
            const banner = redFlagAlert ? this.getEmergencyHeaderHtml(redFlagAlert) : '';
            this.renderDoctorContent(doctorMsgEl, fullResponseText, false, banner);
          },
          // onError
          (errMsg) => {
            this.isStreaming = false;
            this.updateSendButtonState(false);
            doctorMsgEl.classList.remove('cursor-blink');
            
            // If LLM failed but we have clinical context, show EBM fallback
            let fallbackText = '';
            if (engineContext && engineContext.length > 0) {
              fallbackText = `\n\n### 📋 Рекомендации из клинической базы EBM:\n`;
              engineContext.forEach(c => {
                fallbackText += `**${c.name}**:\n${c.recommendations.map(r => `- ${r}`).join('\n')}\n`;
              });
            }

            const banner = redFlagAlert ? this.getEmergencyHeaderHtml(redFlagAlert) : '';
            const safeErr = this.escapeHtml(errMsg || 'Неизвестная ошибка');
            const errHtml = `
              <div class="p-4 my-2 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-sm">
                <p class="font-bold mb-1">⚠️ Обращение к нейросети завершилось ошибкой</p>
                <p class="text-xs text-amber-300 mb-2">${safeErr}</p>
                <p class="text-xs">Вы можете сменить провайдера в <strong>⚙️ Настройках</strong> или воспользоваться кнопками быстрой помощи.</p>
              </div>
            `;
            const fallbackParsed = this.parseSimpleMarkdown(fallbackText);
            doctorMsgEl.innerHTML = banner + errHtml + fallbackParsed;
          },
          // onComplete
          (finalText) => {
            const banner = redFlagAlert ? this.getEmergencyHeaderHtml(redFlagAlert) : '';
            this.renderDoctorContent(doctorMsgEl, finalText, true, banner);
            this.finalizeMessage(doctorMsgEl, text, banner + finalText, finalText);
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
        <div class="p-4 bg-red-900/40 border border-red-500/60 rounded-xl text-red-200 text-sm">
          ⚠️ Сбой связи. Проверьте интернет или настройки провайдера в меню ⚙️.
        </div>
      `;
    }
  }

  getEmergencyHeaderHtml(redFlag) {
    return `
<div class="mb-4 bg-red-950/90 border-2 border-red-500 rounded-xl p-4 shadow-2xl">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-2xl">🚨</span>
      <h3 class="text-red-400 font-extrabold text-sm uppercase tracking-wider">КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG)</h3>
    </div>
    <span class="text-xs px-2 py-0.5 rounded bg-red-800 text-red-100 font-mono">103 / 112</span>
  </div>
  <p class="text-white text-base font-bold mb-2">${redFlag.title}</p>
  <p class="text-red-100 text-sm leading-relaxed mb-3">${redFlag.action}</p>
  
  <div class="flex flex-wrap items-center gap-2 my-2">
    <a href="tel:103" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition shadow">
      📞 Вызов скорой: 103
    </a>
    <a href="tel:112" class="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition shadow">
      🚨 Единый номер: 112
    </a>
  </div>

  ${redFlag.procedure_id ? `[PROCEDURE:${redFlag.procedure_id}]` : ''}
</div>`;
  }

  finalizeMessage(doctorMsgEl, userText, displayHtml, rawTextForTTS = '') {
    this.isStreaming = false;
    this.updateSendButtonState(false);
    doctorMsgEl.classList.remove('cursor-blink');
    this.renderDoctorContent(doctorMsgEl, displayHtml, true);
    
    this.messages.push({ role: 'user', content: userText });
    this.messages.push({ role: 'assistant', content: displayHtml });

    if (this.autoTTS && window.medicalTTS) {
      window.medicalTTS.speak(rawTextForTTS || displayHtml);
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

  renderDoctorContent(container, rawMarkdown, isFinal = false, headerHtml = '') {
    if (!container) return;
    let html = this.parseSimpleMarkdown(rawMarkdown);
    if (window.proceduresManager) {
      html = html.replace(/\[PROCEDURE:([a-zA-Z0-9_]+)\]/g, (match, procId) => {
        return window.proceduresManager.renderCard(procId);
      });
    }
    
    container.innerHTML = (headerHtml || '') + html;
    
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  parseSimpleMarkdown(md) {
    if (!md) return '';
    // 1. Strictly escape HTML special characters first to neutralize any injection from LLM output
    let text = this.escapeHtml(md);

    // 2. Format headings and markdown blocks
    text = text.replace(/^#### (.*$)/gim, '<h4 class="text-sm font-bold mt-3 mb-1 text-sky-400">$1</h4>');
    text = text.replace(/^### (.*$)/gim, '<h3 class="text-md font-bold mt-4 mb-2 text-white border-b border-slate-700 pb-1">$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-4 mb-2 text-white">$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-2 text-white">$1</h1>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Callouts (matched with both escaped &gt; and unescaped >)
    text = text.replace(/(?:&gt;|>)\s*\[!CAUTION\]\s*\n((?:(?:&gt;|>).*(?:\n|$))*)/g, (match, body) => {
      const cleanBody = body.replace(/^(?:&gt;|>)\s*/gm, '');
      return `<div class="p-4 my-3 bg-red-950/80 border-l-4 border-red-500 rounded-r-lg text-red-100 text-sm shadow-md">🚨 <strong>ВНИМАНИЕ:</strong> ${cleanBody}</div>`;
    });
    text = text.replace(/(?:&gt;|>)\s*\[!IMPORTANT\]\s*\n((?:(?:&gt;|>).*(?:\n|$))*)/g, (match, body) => {
      const cleanBody = body.replace(/^(?:&gt;|>)\s*/gm, '');
      return `<div class="p-3 my-2 bg-amber-950/80 border-l-4 border-amber-500 rounded-r-lg text-amber-100 text-xs shadow-md">⚠️ ${cleanBody}</div>`;
    });

    text = text.replace(/^\s*\-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-200">$1</li>');
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-slate-200">$1</li>');
    text = text.replace(/\n\n/g, '<br/><br/>');
    return text;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  // --- Clinical Handoff / Emergency Summary (103 / 112) ---
  generateHandoffSummaryText() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU');
    const timeStr = now.toLocaleTimeString('ru-RU');

    let text = `🩺 ПАМЯТКА ДЛЯ БРИГАДЫ СКОРОЙ МЕДИЦИНСКОЙ ПОМОЩИ (103 / 112)\n`;
    text += `Время фиксации: ${dateStr}, ${timeStr}\n`;
    text += `═══════════════════════════════════════════════════════════\n\n`;

    // 1. Red Flags
    text += `🚨 ОБНАРУЖЕННЫЕ ЖИЗНЕУГРОЖАЮЩИЕ ПРИЗНАКИ (RED FLAGS):\n`;
    if (this.detectedRedFlags.length > 0) {
      this.detectedRedFlags.forEach((rf, i) => {
        text += ` [!] ${rf.time} — ${rf.title}\n     Рекомендация: ${rf.action}\n`;
      });
    } else {
      text += ` Не зафиксировано явных критических маркеров при автоскрининге.\n`;
    }
    text += `\n`;

    // 2. Patient complaints / Dialog timeline
    text += `📋 ПЕРВИЧНЫЕ ЖАЛОБЫ И АНАМНЕЗ СО СЛОВ ПОСТРАДАВШЕГО/СВИДЕТЕЛЕЙ:\n`;
    const userMsgs = this.messages.filter(m => m.role === 'user');
    if (userMsgs.length > 0) {
      userMsgs.forEach((m, idx) => {
        text += ` ${idx + 1}. "${m.content}"\n`;
      });
    } else {
      text += ` Сообщений не зафиксировано.\n`;
    }
    text += `\n`;

    // 3. Recommended Manipulations
    text += `🛠️ ПРЕДПРИНЯТЫЕ / РЕКОМЕНДОВАННЫЕ ДЕЙСТВИЯ ПЕРВОЙ ПОМОЩИ:\n`;
    if (this.detectedRedFlags.some(r => r.procedure_id === 'cpr')) {
      text += ` - Протокол СЛР 30:2 (запущен аудиометроном 110 BPM)\n`;
    }
    if (this.detectedRedFlags.some(r => r.procedure_id === 'bleeding')) {
      text += ` - Остановка кровотечения: прямое давление / наложение жгута\n`;
    }
    if (this.detectedRedFlags.some(r => r.procedure_id === 'fast_stroke')) {
      text += ` - Выявлены признаки инсульта по шкале УДАР / FAST\n`;
    }
    if (this.detectedRedFlags.some(r => r.procedure_id === 'heimlich')) {
      text += ` - Прием Геймлиха при удушье / удары по межлопаточной области\n`;
    }
    text += ` - Сервис функционировал на принципах Доказательной Медицины (EBM/ERC/WHO)\n\n`;
    text += `═══════════════════════════════════════════════════════════\n`;
    text += `Примечание: информация сформирована автоматически в системе «Подручный Доктор» для ускорения клинического триажа.`;

    return text;
  }

  showEmergencySummaryModal() {
    const summaryText = this.generateHandoffSummaryText();
    const modal = document.getElementById('summary-modal');
    const textarea = document.getElementById('summary-text-content');
    if (modal && textarea) {
      textarea.value = summaryText;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeSummaryModal() {
    const modal = document.getElementById('summary-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async copySummaryToClipboard() {
    const textarea = document.getElementById('summary-text-content');
    if (!textarea) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      alert('✅ Сводка для скорой помощи успешно скопирована в буфер обмена!');
    } catch (e) {
      textarea.select();
      document.execCommand('copy');
      alert('✅ Сводка скопирована!');
    }
  }

  shareSummary() {
    const summaryText = this.generateHandoffSummaryText();
    if (navigator.share) {
      navigator.share({
        title: 'Медицинская сводка для скорой помощи (103/112)',
        text: summaryText
      }).catch(err => console.log('Share canceled or failed', err));
    } else {
      this.copySummaryToClipboard();
    }
  }

  printSummary() {
    const summaryText = this.generateHandoffSummaryText();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
        <head>
          <title>Сводка для скорой помощи</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace; padding: 20px; white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
            h2 { margin-top: 0; color: #b91c1c; }
          </style>
        </head>
        <body>
          <h2>🚑 Памятка для бригады скорой помощи (103/112)</h2>
          <hr/>
          <div>${this.escapeHtml(summaryText)}</div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  // --- Settings Modal Management ---
  openSettingsModal() {
    if (!window.llmClient) return;
    const cfg = window.llmClient.config;

    const providerSelect = document.getElementById('setting-provider');
    const apiKeyInput = document.getElementById('setting-api-key');
    const baseUrlInput = document.getElementById('setting-base-url');
    const modelInput = document.getElementById('setting-model');
    const tempInput = document.getElementById('setting-temp');
    const tempValue = document.getElementById('setting-temp-val');
    const backendStatus = document.getElementById('setting-backend-status');

    if (providerSelect) providerSelect.value = cfg.provider;
    if (apiKeyInput) apiKeyInput.value = cfg.apiKey || '';
    if (baseUrlInput) baseUrlInput.value = cfg.baseUrl || '';
    if (modelInput) modelInput.value = cfg.model || '';
    if (tempInput) {
      tempInput.value = cfg.temperature || 0.3;
      if (tempValue) tempValue.innerText = cfg.temperature || 0.3;
    }

    if (backendStatus) {
      if (window.llmClient.backendAvailable) {
        backendStatus.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span> FastAPI Бэкенд активен (http://localhost:8000)`;
        backendStatus.className = 'text-xs text-emerald-400 font-semibold flex items-center';
      } else {
        backendStatus.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-slate-500 mr-1.5"></span> Сервер не запущен (работает автономный статический режим)`;
        backendStatus.className = 'text-xs text-slate-400 flex items-center';
      }
    }

    this.updateProviderSpecificFields();

    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  updateProviderSpecificFields() {
    const provider = document.getElementById('setting-provider')?.value || 'pollinations';
    const keyContainer = document.getElementById('setting-key-container');
    const baseContainer = document.getElementById('setting-base-container');
    const modelInput = document.getElementById('setting-model');

    if (provider === 'pollinations') {
      if (keyContainer) keyContainer.classList.add('hidden');
      if (baseContainer) baseContainer.classList.add('hidden');
      if (modelInput && !modelInput.value) modelInput.value = 'openai';
    } else if (provider === 'groq') {
      if (keyContainer) keyContainer.classList.remove('hidden');
      if (baseContainer) baseContainer.classList.add('hidden');
      if (modelInput && (!modelInput.value || modelInput.value === 'openai')) modelInput.value = 'llama-3.3-70b-versatile';
    } else if (provider === 'openrouter') {
      if (keyContainer) keyContainer.classList.remove('hidden');
      if (baseContainer) baseContainer.classList.add('hidden');
      if (modelInput && (!modelInput.value || modelInput.value === 'openai')) modelInput.value = 'deepseek/deepseek-r1';
    } else if (provider === 'ollama') {
      if (keyContainer) keyContainer.classList.add('hidden');
      if (baseContainer) baseContainer.classList.remove('hidden');
      if (modelInput && (!modelInput.value || modelInput.value === 'openai')) modelInput.value = 'llama3.2';
    } else {
      if (keyContainer) keyContainer.classList.remove('hidden');
      if (baseContainer) baseContainer.classList.remove('hidden');
    }
  }

  saveSettings() {
    if (!window.llmClient) return;

    const provider = document.getElementById('setting-provider')?.value || 'pollinations';
    const apiKey = document.getElementById('setting-api-key')?.value.trim() || '';
    const baseUrl = document.getElementById('setting-base-url')?.value.trim() || '';
    const model = document.getElementById('setting-model')?.value.trim() || '';
    const temperature = parseFloat(document.getElementById('setting-temp')?.value) || 0.3;

    window.llmClient.saveConfig({
      provider,
      apiKey,
      baseUrl,
      model,
      temperature
    });

    this.updateProviderBadge();
    this.closeSettingsModal();
    alert('✅ Настройки ИИ-модели успешно сохранены!');
  }

  async testSettingsConnection() {
    const testBtn = document.getElementById('test-conn-btn');
    const testResult = document.getElementById('test-conn-result');
    if (!testBtn || !window.llmClient) return;

    // Temporarily save to test
    const provider = document.getElementById('setting-provider')?.value || 'pollinations';
    const apiKey = document.getElementById('setting-api-key')?.value.trim() || '';
    const baseUrl = document.getElementById('setting-base-url')?.value.trim() || '';
    const model = document.getElementById('setting-model')?.value.trim() || '';
    const temperature = parseFloat(document.getElementById('setting-temp')?.value) || 0.3;

    window.llmClient.saveConfig({ provider, apiKey, baseUrl, model, temperature });

    testBtn.disabled = true;
    testBtn.innerText = 'Проверка...';
    if (testResult) {
      testResult.innerText = 'Устанавливаем соединение...';
      testResult.className = 'text-xs text-sky-400 mt-2';
    }

    const res = await window.llmClient.testConnection();

    testBtn.disabled = false;
    testBtn.innerText = '⚡ Проверить подключение';

    if (testResult) {
      if (res.success) {
        testResult.innerText = '✅ Соединение успешно установлено! Модель готова к работе.';
        testResult.className = 'text-xs text-emerald-400 font-bold mt-2';
      } else {
        testResult.innerText = `❌ Ошибка: ${res.error}`;
        testResult.className = 'text-xs text-red-400 font-semibold mt-2';
      }
    }
  }

  // --- MEDICAL SKILLS HUB CONTROLLERS ---

  openCalculatorsModal(tab = 'ckd') {
    const modal = document.getElementById('calculators-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      this.switchCalcTab(tab);
    }
  }

  closeCalculatorsModal() {
    const modal = document.getElementById('calculators-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  switchCalcTab(tab) {
    const tabs = ['ckd', 'curb', 'cha', 'gcs'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const pane = document.getElementById(`calc-pane-${t}`);
      if (btn && pane) {
        if (t === tab) {
          btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white shadow';
          pane.classList.remove('hidden');
        } else {
          btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700';
          pane.classList.add('hidden');
        }
      }
    });
  }

  calculateCKD() {
    if (!window.medicalSkillsEngine) return;
    const gender = document.getElementById('calc-ckd-gender')?.value || 'male';
    const age = document.getElementById('calc-ckd-age')?.value || 55;
    const cr = document.getElementById('calc-ckd-cr')?.value || 85;

    const res = window.medicalSkillsEngine.calculateCKDEPI(gender, age, cr);
    const resultBox = document.getElementById('calc-ckd-result');
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="p-3 bg-slate-950 rounded-xl border border-sky-600/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-sky-400">СКФ (CKD-EPI): <span class="text-base text-white font-mono">${res.egfr}</span> мл/мин/1.73м²</span>
            <span class="px-2 py-0.5 rounded font-bold ${res.egfr >= 60 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}">${res.stage}</span>
          </div>
          <p class="text-slate-300 mb-1">${res.category}</p>
          <p class="text-slate-400 text-[11px] mb-2">💡 <strong>Клиническое решение:</strong> ${res.recommendation}</p>
          <div class="flex gap-2">
            <button onclick="medicalApp.insertSkillResultToChat('СКФ по CKD-EPI: ${res.egfr} мл/мин/1.73м² (Стадия ${res.stage}). ${res.recommendation}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold">
              💬 Вставить в чат
            </button>
          </div>
        </div>
      `;
    }
  }

  calculateCURB() {
    if (!window.medicalSkillsEngine) return;
    const c = document.getElementById('curb-c')?.checked || false;
    const u = document.getElementById('curb-u')?.checked || false;
    const r = document.getElementById('curb-r')?.checked || false;
    const b = document.getElementById('curb-b')?.checked || false;
    const age65 = document.getElementById('curb-65')?.checked || false;

    const res = window.medicalSkillsEngine.calculateCURB65(c, u, r, b, age65);
    const resultBox = document.getElementById('calc-curb-result');
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="p-3 bg-slate-950 rounded-xl border border-sky-600/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-sky-400">Баллы CURB-65: <span class="text-base text-white font-mono">${res.score} из 5</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score <= 1 ? 'bg-emerald-900/60 text-emerald-300' : (res.score === 2 ? 'bg-amber-900/60 text-amber-300' : 'bg-red-900/60 text-red-300')}">${res.riskGroup}</span>
          </div>
          <p class="text-slate-300 mb-1">Ожидаемая 30-дневная летальность: <strong>${res.mortality}</strong></p>
          <p class="text-slate-200 text-[11px] mb-2">🏥 <strong>Маршрутизация:</strong> ${res.routing}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Оценка пневмонии по CURB-65: ${res.score} баллов (${res.riskGroup}). ${res.routing}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold">
            💬 Вставить в чат
          </button>
        </div>
      `;
    }
  }

  calculateCHA() {
    if (!window.medicalSkillsEngine) return;
    const inputs = {
      chf: document.getElementById('cha-chf')?.checked,
      htn: document.getElementById('cha-htn')?.checked,
      age75: document.getElementById('cha-age75')?.checked,
      dm: document.getElementById('cha-dm')?.checked,
      stroke: document.getElementById('cha-stroke')?.checked,
      vasc: document.getElementById('cha-vasc')?.checked,
      age65_74: document.getElementById('cha-age65')?.checked,
      female: document.getElementById('cha-female')?.checked
    };

    const res = window.medicalSkillsEngine.calculateCHA2DS2VASc(inputs);
    const resultBox = document.getElementById('calc-cha-result');
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="p-3 bg-slate-950 rounded-xl border border-sky-600/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-sky-400">Шкала CHA₂DS₂-VASc: <span class="text-base text-white font-mono">${res.score} балл(ов)</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score >= 2 ? 'bg-red-900/60 text-red-300' : 'bg-emerald-900/60 text-emerald-300'}">${res.score >= 2 ? 'Высокий риск' : 'Низкий/умеренный'}</span>
          </div>
          <p class="text-slate-200 text-[11px] mb-2">💊 <strong>Показания к антикоагулянтам (ПОАК):</strong> ${res.recommendation}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Шкала CHA2DS2-VASc: ${res.score} балл(ов). Рекомендация: ${res.recommendation}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold">
            💬 Вставить в чат
          </button>
        </div>
      `;
    }
  }

  calculateGCS() {
    if (!window.medicalSkillsEngine) return;
    const e = document.getElementById('gcs-eye')?.value || 4;
    const v = document.getElementById('gcs-verbal')?.value || 5;
    const m = document.getElementById('gcs-motor')?.value || 6;

    const res = window.medicalSkillsEngine.calculateGCS(e, v, m);
    const resultBox = document.getElementById('calc-gcs-result');
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="p-3 bg-slate-950 rounded-xl border border-sky-600/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-sky-400">Шкала Глазго: <span class="text-base text-white font-mono">${res.score} / 15 (${res.details})</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score <= 8 ? 'bg-red-900/90 text-red-200 animate-pulse' : (res.score <= 12 ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/60 text-emerald-300')}">${res.status}</span>
          </div>
          <p class="text-slate-200 text-[11px] mb-2">🚨 <strong>Клиническое действие:</strong> ${res.action}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Шкала комы Глазго (GCS): ${res.score} баллов (${res.status}, ${res.details}). Действие: ${res.action}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold">
            💬 Вставить в чат
          </button>
        </div>
      `;
    }
  }

  // --- LABS EVALUATOR MODAL ---
  openLabsModal() {
    const modal = document.getElementById('labs-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeLabsModal() {
    const modal = document.getElementById('labs-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  evaluateLabsFromModal() {
    if (!window.medicalSkillsEngine) return;
    const inputs = {
      wbc: document.getElementById('lab-wbc')?.value,
      band: document.getElementById('lab-band')?.value,
      crp: document.getElementById('lab-crp')?.value,
      amylase: document.getElementById('lab-amylase')?.value,
      troponin: document.getElementById('lab-troponin')?.value,
      ddimer: document.getElementById('lab-ddimer')?.value,
      glucose: document.getElementById('lab-glucose')?.value,
      potassium: document.getElementById('lab-potassium')?.value,
      creatinine: document.getElementById('lab-creatinine')?.value,
      hb: document.getElementById('lab-hb')?.value
    };

    const res = window.medicalSkillsEngine.evaluateLabs(inputs);
    const resultBox = document.getElementById('lab-eval-result');
    if (!resultBox) return;

    let findingsHtml = res.findings.length > 0
      ? `<div class="mb-2"><span class="font-bold text-amber-400">Отклонения:</span> <ul class="list-disc pl-4 text-slate-300">${res.findings.map(f => `<li>${f}</li>`).join('')}</ul></div>`
      : `<p class="text-emerald-400 font-semibold mb-2">✅ Введенные показатели находятся в пределах базовых референсов.</p>`;

    let syndromesHtml = res.syndromes.length > 0
      ? `<div class="space-y-2">${res.syndromes.map(s => `
          <div class="p-2.5 rounded-lg ${s.severity === 'CRITICAL' ? 'bg-red-950/80 border border-red-500' : 'bg-amber-950/70 border border-amber-500'}">
            <div class="flex items-center gap-1.5 mb-1">
              <span class="text-sm">${s.severity === 'CRITICAL' ? '🚨' : '⚠️'}</span>
              <strong class="text-white text-xs">${s.title}</strong>
            </div>
            <p class="text-slate-200 text-[11px] leading-relaxed">${s.comment}</p>
          </div>
        `).join('')}</div>`
      : '';

    resultBox.innerHTML = `
      <div class="p-3 bg-slate-950 rounded-xl border border-slate-700 text-xs">
        <h4 class="font-bold text-sky-400 mb-2">Результат лабораторного скрининга:</h4>
        ${findingsHtml}
        ${syndromesHtml}
        <div class="mt-3 pt-2 border-t border-slate-800">
          <button onclick="medicalApp.insertSkillResultToChat('Лабораторный анализ: ' + '${res.findings.join(', ')}' + '. Синдромы: ' + '${res.syndromes.map(s => s.title).join('; ')}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold">
            💬 Отправить в чат к ИИ-врачу
          </button>
        </div>
      </div>
    `;
  }

  // --- DRUGS & DDI MODAL ---
  openDrugsModal(tab = 'emergency') {
    const modal = document.getElementById('drugs-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      this.switchDrugTab(tab);
    }
  }

  closeDrugsModal() {
    const modal = document.getElementById('drugs-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  switchDrugTab(tab) {
    const btnEmerg = document.getElementById('tab-btn-emerg-drugs');
    const btnDDI = document.getElementById('tab-btn-ddi');
    const paneEmerg = document.getElementById('pane-emerg-drugs');
    const paneDDI = document.getElementById('pane-ddi');

    if (tab === 'emergency') {
      if (btnEmerg) btnEmerg.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white shadow';
      if (btnDDI) btnDDI.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700';
      if (paneEmerg) paneEmerg.classList.remove('hidden');
      if (paneDDI) paneDDI.classList.add('hidden');
    } else {
      if (btnEmerg) btnEmerg.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700';
      if (btnDDI) btnDDI.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white shadow';
      if (paneEmerg) paneEmerg.classList.add('hidden');
      if (paneDDI) paneDDI.classList.remove('hidden');
    }
  }

  checkDDIFromModal() {
    if (!window.medicalSkillsEngine) return;
    const input = document.getElementById('ddi-input')?.value || '';
    const drugs = input.split(',').map(s => s.trim()).filter(Boolean);
    const resultBox = document.getElementById('ddi-result');
    if (!resultBox) return;

    if (drugs.length < 2) {
      resultBox.innerHTML = `<p class="text-xs text-amber-400">Введите как минимум два препарата через запятую (например: Каптоприл, Верошпирон).</p>`;
      return;
    }

    const alerts = window.medicalSkillsEngine.checkDrugInteractions(drugs);

    if (alerts.length === 0) {
      resultBox.innerHTML = `
        <div class="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs">
          ✅ Опасных межлекарственных взаимодействий среди указанных средств не обнаружено.
        </div>
      `;
    } else {
      resultBox.innerHTML = alerts.map(a => `
        <div class="p-3 mb-2 rounded-xl ${a.severity === 'CRITICAL' ? 'bg-red-950/80 border border-red-500 text-red-200' : 'bg-amber-950/80 border border-amber-500 text-amber-200'} text-xs">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-base">${a.severity === 'CRITICAL' ? '⛔' : '⚠️'}</span>
            <strong class="text-white text-xs">${a.drugs.join(' + ').toUpperCase()}</strong>
          </div>
          <p class="mb-1"><strong>Риск:</strong> ${a.risk}</p>
          <p class="text-[11px] text-slate-300 mb-1"><strong>Механизм:</strong> ${a.mechanism}</p>
          <p class="text-[11px] font-semibold text-white">💡 <strong>Рекомендация:</strong> ${a.recommendation}</p>
        </div>
      `).join('');
    }
  }

  // --- SOAP CLINICAL NOTE GENERATOR ---
  openSOAPModal() {
    const modal = document.getElementById('soap-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeSOAPModal() {
    const modal = document.getElementById('soap-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  generateSOAPFromModal() {
    if (!window.medicalSkillsEngine) return;
    const patientAge = document.getElementById('soap-age')?.value || '';
    const patientGender = document.getElementById('soap-gender')?.value || 'male';
    const complaints = document.getElementById('soap-complaints')?.value || '';
    const anamnesis = document.getElementById('soap-anamnesis')?.value || '';
    const vitals = {
      bp: document.getElementById('soap-bp')?.value || '130/80',
      pulse: document.getElementById('soap-pulse')?.value || '78',
      spo2: document.getElementById('soap-spo2')?.value || '98',
      rr: document.getElementById('soap-rr')?.value || '16',
      lungs: document.getElementById('soap-lungs')?.value || 'Везикулярное дыхание, хрипов нет',
      abdomen: document.getElementById('soap-abdomen')?.value || 'Живот мягкий, безболезненный во всех отделах'
    };
    const diagnosis = {
      name: document.getElementById('soap-diag-name')?.value || 'Острое состояние',
      code: document.getElementById('soap-diag-code')?.value || 'I10'
    };
    const plan = {
      diagnostics: document.getElementById('soap-plan-diag')?.value || 'ОАК, биохимия, ЭКГ',
      medications: document.getElementById('soap-plan-med')?.value || 'По протоколу'
    };
    const routing = document.getElementById('soap-routing')?.value || 'Госпитализация / Наблюдение';

    const text = window.medicalSkillsEngine.generateSOAPNote({
      patientAge, patientGender, complaints, anamnesis, vitals, diagnosis, plan, routing
    });

    const outArea = document.getElementById('soap-output-text');
    if (outArea) {
      outArea.value = text;
      const previewBlock = document.getElementById('soap-preview-block');
      if (previewBlock) previewBlock.classList.remove('hidden');
    }
  }

  copySOAPToClipboard() {
    const outArea = document.getElementById('soap-output-text');
    if (!outArea) return;
    navigator.clipboard.writeText(outArea.value).then(() => {
      alert('✅ Протокол осмотра скопирован! Вы можете вставить его в КМИС / Дамумед / ЕМИАС.');
    }).catch(() => {
      outArea.select();
      document.execCommand('copy');
      alert('✅ Протокол скопирован!');
    });
  }

  insertSkillResultToChat(text) {
    this.closeAllModals();
    this.sendMessage(text);
  }

  closeAllModals() {
    this.closeSettingsModal();
    this.closeSummaryModal();
    this.closeCalculatorsModal();
    this.closeLabsModal();
    this.closeDrugsModal();
    this.closeSOAPModal();
    if (window.proceduresManager) {
      window.proceduresManager.closeModal();
    }
  }
}

let medicalApp;
document.addEventListener('DOMContentLoaded', () => {
  medicalApp = new MedicalApp();
  window.medicalApp = medicalApp;
});
