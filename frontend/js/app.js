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
    const micBtn = document.getElementById('mic-btn');

    const updateInputButtons = () => {
      if (!input) return;
      const hasText = input.value.trim().length > 0;
      if (hasText) {
        if (sendBtn) sendBtn.classList.remove('hidden');
        if (micBtn) micBtn.classList.add('hidden');
      } else {
        if (sendBtn) sendBtn.classList.add('hidden');
        if (micBtn) micBtn.classList.remove('hidden');
      }
    };

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
          updateInputButtons();
        }
      });
      // Auto-grow textarea & toggle mic/send
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        updateInputButtons();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        this.sendMessage();
        updateInputButtons();
      });
    }

    // Modal close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Reactive update on model change
    window.addEventListener('llm-model-changed', () => {
      this.updateProviderBadge();
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
      }, (isListening, errorMsg) => {
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) {
          if (isListening) {
            micBtn.classList.add('!bg-[#FF453A]', 'recording-pulse-ring');
          } else {
            micBtn.classList.remove('!bg-[#FF453A]', 'recording-pulse-ring');
          }
        }
        if (errorMsg) {
          console.warn('Voice state notice:', errorMsg);
        }
      });

      window.medicalSpeechInstance = this.voiceAssistant;

      // Attach HTML5 visualizer canvas if present
      const canvas = document.getElementById('voice-canvas');
      if (canvas && this.voiceAssistant.attachCanvas) {
        this.voiceAssistant.attachCanvas(canvas);
      }
    }
  }

  openToolsSheet() {
    const sheet = document.getElementById('tools-sheet');
    if (sheet) {
      sheet.classList.remove('hidden');
      sheet.classList.add('flex');
    }
  }

  closeToolsSheet() {
    const sheet = document.getElementById('tools-sheet');
    if (sheet) {
      sheet.classList.add('hidden');
      sheet.classList.remove('flex');
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
        .then((reg) => {
          reg.update();
        })
        .catch((err) => console.log('ServiceWorker не зарегистрирован:', err));
    }
  }

  toggleTTS() {
    this.autoTTS = !this.autoTTS;
    const btn = document.getElementById('tts-toggle');
    if (btn) {
      btn.style.opacity = this.autoTTS ? '1' : '0.5';
    }
    const toolsStatus = document.getElementById('tools-tts-status');
    if (toolsStatus) {
      toolsStatus.innerText = this.autoTTS ? 'Включена (автоозвучка)' : 'Выключена';
      toolsStatus.className = this.autoTTS ? 'text-xs text-[#30D158] font-medium' : 'text-xs text-[#8E8E93]';
    }
    if (!this.autoTTS && window.medicalTTS) {
      window.medicalTTS.stop();
    }
  }

  updateProviderBadge() {
    const badge = document.getElementById('current-provider-badge');
    if (badge) {
      badge.innerText = 'Клинический консилиум';
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
    msgWrapper.className = `flex mb-4 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

    if (sender === 'user') {
      msgWrapper.innerHTML = `
        <div class="bubble-user max-w-[85%] sm:max-w-[75%] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
          ${this.escapeHtml(content)}
        </div>
      `;
    } else {
      msgWrapper.innerHTML = `
        <div class="bubble-ai max-w-[92%] sm:max-w-[85%] p-4 sm:p-5 text-[14px] leading-relaxed markdown-body ${isStreamingPlaceholder ? 'cursor-blink' : ''}">
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

    // Clinical Sections: Patient Communication vs Doctor Action Plan
    text = text.replace(/(?:<strong class="text-white">)?(?:🗣️|🗣)?\s*(?:Для пациента|Пациенту):?(?:<\/strong>)?([\s\S]*?)(?=(?:<strong class="text-white">)?(?:👨‍⚕️|👨)?\s*(?:Для врача|Врачу)|$)/gi, (match, body) => {
      const trimmed = body.trim();
      if (!trimmed) return match;
      return `<div class="section-patient"><div class="flex items-center gap-1.5 font-bold text-sky-300 text-xs mb-1.5 uppercase tracking-wide"><span>🗣️</span> Пациенту (понятным языком):</div>${trimmed}</div>`;
    });

    text = text.replace(/(?:<strong class="text-white">)?(?:👨‍⚕️|👨)?\s*(?:Для врача|Врачу):?(?:<\/strong>)?([\s\S]*?)$/gi, (match, body) => {
      const trimmed = body.trim();
      if (!trimmed) return match;
      return `<div class="section-doctor"><div class="flex items-center gap-1.5 font-bold text-sky-400 text-xs mb-1.5 uppercase tracking-wide"><span>👨‍⚕️</span> Дежурному врачу (диагностика & профиль):</div>${trimmed}</div>`;
    });

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

    if (provider === 'multillm') {
      if (keyContainer) {
        keyContainer.classList.remove('hidden');
        const keyInp = document.getElementById('setting-api-key');
        if (keyInp) keyInp.placeholder = 'sk-... (Ключ шлюза / CheapVibeCode, если требуется)';
      }
      if (baseContainer) {
        baseContainer.classList.remove('hidden');
        const baseInp = document.getElementById('setting-base-url');
        if (baseInp) baseInp.placeholder = 'https://api.openai.com/v1 или URL вашего шлюза';
      }
      if (modelInput && (!modelInput.value || modelInput.value === 'openai')) modelInput.value = 'deepseek-v4-pro';
    } else if (provider === 'pollinations') {
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
          btn.className = 'px-3 py-2 rounded-t-xl bg-[#0A84FF] text-white font-medium transition';
          pane.classList.remove('hidden');
        } else {
          btn.className = 'px-3 py-2 rounded-t-xl bg-white/5 text-[#8E8E93] hover:text-white transition';
          pane.classList.add('hidden');
        }
      }
    });
  }

  calcCKDEPI() {
    if (!window.medicalSkillsEngine) return;
    const gender = document.getElementById('ckd-gender')?.value || document.getElementById('calc-ckd-gender')?.value || 'male';
    const age = document.getElementById('ckd-age')?.value || document.getElementById('calc-ckd-age')?.value || 55;
    const cr = document.getElementById('ckd-creat')?.value || document.getElementById('calc-ckd-cr')?.value || 85;

    const res = window.medicalSkillsEngine.calculateCKDEPI(gender, age, cr);
    const resultBox = document.getElementById('ckd-result') || document.getElementById('calc-ckd-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <div class="p-3 bg-black/60 rounded-xl border border-[#0A84FF]/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-[#0A84FF]">СКФ (CKD-EPI): <span class="text-base text-white font-mono">${res.egfr}</span> мл/мин/1.73м²</span>
            <span class="px-2 py-0.5 rounded font-bold ${res.egfr >= 60 ? 'bg-[#30D158]/20 text-[#30D158]' : 'bg-[#FF453A]/20 text-[#FF453A]'}">${res.stage}</span>
          </div>
          <p class="text-[#8E8E93] mb-1">${res.category}</p>
          <p class="text-white text-[11px] mb-2">💡 <strong>Клиническое решение:</strong> ${res.recommendation}</p>
          <button onclick="medicalApp.insertSkillResultToChat('СКФ по CKD-EPI: ${res.egfr} мл/мин/1.73м² (Стадия ${res.stage}). ${res.recommendation}')" class="px-3 py-1.5 bg-[#0A84FF] active:scale-95 text-white rounded-lg text-[11px] font-semibold transition">
            💬 Вставить в диалог
          </button>
        </div>
      `;
    }
  }
  calculateCKD() { return this.calcCKDEPI(); }

  calcCURB65() {
    if (!window.medicalSkillsEngine) return;
    const c = !!document.getElementById('curb-c')?.checked;
    const u = !!document.getElementById('curb-u')?.checked;
    const r = !!document.getElementById('curb-r')?.checked;
    const b = !!document.getElementById('curb-b')?.checked;
    const age65 = !!document.getElementById('curb-65')?.checked;

    const res = window.medicalSkillsEngine.calculateCURB65(c, u, r, b, age65);
    const resultBox = document.getElementById('curb-result') || document.getElementById('calc-curb-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <div class="p-3 bg-black/60 rounded-xl border border-[#0A84FF]/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-[#0A84FF]">Баллы CURB-65: <span class="text-base text-white font-mono">${res.score} из 5</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score <= 1 ? 'bg-[#30D158]/20 text-[#30D158]' : (res.score === 2 ? 'bg-[#FF9F0A]/20 text-[#FF9F0A]' : 'bg-[#FF453A]/20 text-[#FF453A]')}">${res.riskGroup}</span>
          </div>
          <p class="text-[#8E8E93] mb-1">Ожидаемая 30-дневная летальность: <strong>${res.mortality}</strong></p>
          <p class="text-white text-[11px] mb-2">🏥 <strong>Маршрутизация:</strong> ${res.routing}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Оценка пневмонии по CURB-65: ${res.score} баллов (${res.riskGroup}). ${res.routing}')" class="px-3 py-1.5 bg-[#0A84FF] active:scale-95 text-white rounded-lg text-[11px] font-semibold transition">
            💬 Вставить в диалог
          </button>
        </div>
      `;
    }
  }
  calculateCURB() { return this.calcCURB65(); }

  calcCHA2DS2() {
    if (!window.medicalSkillsEngine) return;
    const age = Number(document.getElementById('cha-age')?.value || 65);
    const gender = document.getElementById('cha-gender')?.value || 'male';
    const isFemale = gender === 'female' || !!document.getElementById('cha-female')?.checked;
    const age75 = age >= 75 || !!document.getElementById('cha-age75')?.checked;
    const age65_74 = (age >= 65 && age < 75) || !!document.getElementById('cha-age65')?.checked;

    const inputs = {
      chf: !!document.getElementById('cha-chf')?.checked,
      htn: !!document.getElementById('cha-htn')?.checked,
      age75,
      dm: !!document.getElementById('cha-dm')?.checked,
      stroke: !!document.getElementById('cha-stroke')?.checked,
      vasc: !!document.getElementById('cha-vasc')?.checked,
      age65_74,
      female: isFemale
    };

    const res = window.medicalSkillsEngine.calculateCHA2DS2VASc(inputs);
    const resultBox = document.getElementById('cha-result') || document.getElementById('calc-cha-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <div class="p-3 bg-black/60 rounded-xl border border-[#0A84FF]/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-[#0A84FF]">Шкала CHA₂DS₂-VASc: <span class="text-base text-white font-mono">${res.score} балл(ов)</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score >= 2 ? 'bg-[#FF453A]/20 text-[#FF453A]' : 'bg-[#30D158]/20 text-[#30D158]'}">${res.score >= 2 ? 'Высокий риск' : 'Низкий/умеренный'}</span>
          </div>
          <p class="text-white text-[11px] mb-2">💊 <strong>Показания к ПОАК:</strong> ${res.recommendation}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Шкала CHA2DS2-VASc: ${res.score} балл(ов). Рекомендация: ${res.recommendation}')" class="px-3 py-1.5 bg-[#0A84FF] active:scale-95 text-white rounded-lg text-[11px] font-semibold transition">
            💬 Вставить в диалог
          </button>
        </div>
      `;
    }
  }
  calculateCHA() { return this.calcCHA2DS2(); }

  calcGCS() {
    if (!window.medicalSkillsEngine) return;
    const e = document.getElementById('gcs-eye')?.value || 4;
    const v = document.getElementById('gcs-verbal')?.value || 5;
    const m = document.getElementById('gcs-motor')?.value || 6;

    const res = window.medicalSkillsEngine.calculateGCS(e, v, m);
    const resultBox = document.getElementById('gcs-result') || document.getElementById('calc-gcs-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <div class="p-3 bg-black/60 rounded-xl border border-[#0A84FF]/40 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-[#0A84FF]">Шкала Глазго: <span class="text-base text-white font-mono">${res.score} / 15 (${res.details})</span></span>
            <span class="px-2 py-0.5 rounded font-bold ${res.score <= 8 ? 'bg-[#FF453A]/30 text-[#FF453A] animate-pulse' : (res.score <= 12 ? 'bg-[#FF9F0A]/20 text-[#FF9F0A]' : 'bg-[#30D158]/20 text-[#30D158]')}">${res.status}</span>
          </div>
          <p class="text-white text-[11px] mb-2">🚨 <strong>Клиническое действие:</strong> ${res.action}</p>
          <button onclick="medicalApp.insertSkillResultToChat('Шкала комы Глазго (GCS): ${res.score} баллов (${res.status}, ${res.details}). Действие: ${res.action}')" class="px-3 py-1.5 bg-[#0A84FF] active:scale-95 text-white rounded-lg text-[11px] font-semibold transition">
            💬 Вставить в диалог
          </button>
        </div>
      `;
    }
  }
  calculateGCS() { return this.calcGCS(); }

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

  evaluateLabs() {
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
    const resultBox = document.getElementById('labs-result') || document.getElementById('lab-eval-result');
    if (!resultBox) return;

    resultBox.classList.remove('hidden');

    let findingsHtml = res.findings.length > 0
      ? `<div class="mb-2"><span class="font-bold text-[#FF9F0A]">Отклонения:</span> <ul class="list-disc pl-4 text-[#8E8E93] mt-1 space-y-0.5">${res.findings.map(f => `<li class="text-white">${f}</li>`).join('')}</ul></div>`
      : `<p class="text-[#30D158] font-semibold mb-2">✅ Введённые показатели находятся в пределах нормы.</p>`;

    let syndromesHtml = res.syndromes.length > 0
      ? `<div class="space-y-2 mt-2">${res.syndromes.map(s => `
          <div class="p-2.5 rounded-xl ${s.severity === 'CRITICAL' ? 'bg-[#FF453A]/15 border border-[#FF453A]/40' : 'bg-[#FF9F0A]/15 border border-[#FF9F0A]/40'}">
            <div class="flex items-center gap-1.5 mb-1">
              <span class="text-sm">${s.severity === 'CRITICAL' ? '🚨' : '⚠️'}</span>
              <strong class="text-white text-xs">${s.title}</strong>
            </div>
            <p class="text-[#8E8E93] text-[11px] leading-relaxed">${s.comment}</p>
          </div>
        `).join('')}</div>`
      : '';

    resultBox.innerHTML = `
      <div class="p-3 bg-black/60 rounded-xl border border-white/10 text-xs">
        <h4 class="font-bold text-[#30D158] mb-2">Результат лабораторного скрининга:</h4>
        ${findingsHtml}
        ${syndromesHtml}
        <div class="mt-3 pt-2 border-t border-white/10">
          <button onclick="medicalApp.insertSkillResultToChat('Лабораторный экспресс-анализ: ' + '${res.findings.join(', ')}' + '. Синдромы: ' + '${res.syndromes.map(s => s.title).join('; ')}')" class="px-3 py-1.5 bg-[#30D158] active:scale-95 text-white rounded-lg text-xs font-semibold transition">
            💬 Отправить в чат к ИИ-врачу
          </button>
        </div>
      </div>
    `;
  }
  evaluateLabsFromModal() { return this.evaluateLabs(); }

  // --- DRUGS & DDI MODAL ---
  openDrugsModal(tab = 'emergency') {
    const modal = document.getElementById('drugs-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      this.switchDrugTab(tab);
      this.renderEmergencyDrugs();
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
    const btnEmerg = document.getElementById('tab-drug-emergency') || document.getElementById('tab-btn-emerg-drugs');
    const btnDDI = document.getElementById('tab-drug-ddi') || document.getElementById('tab-btn-ddi');
    const paneEmerg = document.getElementById('drug-pane-emergency') || document.getElementById('pane-emerg-drugs');
    const paneDDI = document.getElementById('drug-pane-ddi') || document.getElementById('pane-ddi');

    if (tab === 'emergency') {
      if (btnEmerg) btnEmerg.className = 'px-3 py-1.5 rounded-t-xl bg-[#0A84FF] text-white font-medium';
      if (btnDDI) btnDDI.className = 'px-3 py-1.5 rounded-t-xl bg-white/5 text-[#8E8E93]';
      if (paneEmerg) paneEmerg.classList.remove('hidden');
      if (paneDDI) paneDDI.classList.add('hidden');
      this.renderEmergencyDrugs();
    } else {
      if (btnEmerg) btnEmerg.className = 'px-3 py-1.5 rounded-t-xl bg-white/5 text-[#8E8E93]';
      if (btnDDI) btnDDI.className = 'px-3 py-1.5 rounded-t-xl bg-[#0A84FF] text-white font-medium';
      if (paneEmerg) paneEmerg.classList.add('hidden');
      if (paneDDI) paneDDI.classList.remove('hidden');
    }
  }

  renderEmergencyDrugs(query = '') {
    const container = document.getElementById('emergency-drugs-list');
    if (!container || !window.medicalSkillsEngine) return;

    const drugs = window.medicalSkillsEngine.emergencyDrugs || [];
    const q = (query || '').toLowerCase().trim();

    const filtered = q
      ? drugs.filter(d => (d.name && d.name.toLowerCase().includes(q)) ||
                          (d.inn && d.inn.toLowerCase().includes(q)) ||
                          (d.group && d.group.toLowerCase().includes(q)) ||
                          (d.indications && d.indications.some(ind => ind.toLowerCase().includes(q))))
      : drugs;

    if (filtered.length === 0) {
      container.innerHTML = `<p class="p-3 text-xs text-[#8E8E93] text-center">Препараты по запросу «${this.escapeHtml(query)}» не найдены.</p>`;
      return;
    }

    container.innerHTML = filtered.map(d => `
      <div class="p-3 rounded-2xl bg-black/40 border border-white/10 hover:border-white/20 transition space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <div>
            <strong class="text-white text-sm block">${d.name}</strong>
            <span class="text-[11px] text-[#8E8E93]">${d.inn || ''} • ${d.group || ''}</span>
          </div>
          <button onclick="medicalApp.insertSkillResultToChat('Назначение препарата: ${d.name} (${d.inn || ''}). Дозировка: ${d.dosage || ''}. Показания: ${(d.indications || []).join(', ')}')" class="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-lg text-[11px] transition">
            💬 В чат
          </button>
        </div>
        <div class="text-[11px] text-white">
          <span class="text-[#0A84FF] font-semibold">Дозировка:</span> ${d.dosage || 'По клиническому протоколу'} (${d.route || 'в/в'})
        </div>
        ${d.indications ? `<div class="text-[11px] text-[#8E8E93]"><span class="text-[#30D158] font-semibold">Показания:</span> ${d.indications.join(', ')}</div>` : ''}
        ${d.contraindications ? `<div class="text-[11px] text-[#FF453A]"><span class="font-semibold">Противопоказания:</span> ${d.contraindications.join(', ')}</div>` : ''}
      </div>
    `).join('');
  }

  filterEmergencyDrugs() {
    const input = document.getElementById('drug-search-input');
    const val = input ? input.value : '';
    this.renderEmergencyDrugs(val);
  }

  screenDDI() {
    if (!window.medicalSkillsEngine) return;
    const input = document.getElementById('ddi-drugs-input')?.value || document.getElementById('ddi-input')?.value || '';
    const drugs = input.split(',').map(s => s.trim()).filter(Boolean);
    const resultBox = document.getElementById('ddi-result');
    if (!resultBox) return;

    resultBox.classList.remove('hidden');

    if (drugs.length < 2) {
      resultBox.innerHTML = `<p class="text-xs text-[#FF9F0A]">Введите как минимум два препарата через запятую (например: Нитроглицерин, Силденафил).</p>`;
      return;
    }

    const alerts = window.medicalSkillsEngine.checkDrugInteractions(drugs);

    if (alerts.length === 0) {
      resultBox.innerHTML = `
        <div class="p-3 bg-[#30D158]/15 border border-[#30D158]/40 rounded-xl text-[#30D158] text-xs">
          ✅ Опасных межлекарственных взаимодействий среди указанных средств не обнаружено.
        </div>
      `;
    } else {
      resultBox.innerHTML = alerts.map(a => `
        <div class="p-3 mb-2 rounded-xl ${a.severity === 'CRITICAL' ? 'bg-[#FF453A]/20 border border-[#FF453A] text-white' : 'bg-[#FF9F0A]/20 border border-[#FF9F0A] text-white'} text-xs">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-base">${a.severity === 'CRITICAL' ? '⛔' : '⚠️'}</span>
            <strong class="text-white text-xs">${a.drugs.join(' + ').toUpperCase()}</strong>
          </div>
          <p class="mb-1 text-white"><strong>Риск:</strong> ${a.risk}</p>
          <p class="text-[11px] text-[#8E8E93] mb-1"><strong>Механизм:</strong> ${a.mechanism}</p>
          <p class="text-[11px] font-semibold text-[#0A84FF]">💡 <strong>Рекомендация:</strong> ${a.recommendation}</p>
        </div>
      `).join('');
    }
  }
  checkDDIFromModal() { return this.screenDDI(); }

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

  closeModelPickerModal() {}

  closeAllModals() {
    this.closeToolsSheet();
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

