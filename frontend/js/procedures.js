// Interactive Clinical Procedures & Visual Manipulation Cards

class ProceduresManager {
  constructor() {
    this.procedures = {};
    this.activeProcedure = null;
    this.activeTimer = null;
    this.timerSeconds = 0;
    this.loadProcedures();
  }

  async loadProcedures() {
    if (window.clinicalEngine && window.clinicalEngine.proceduresMap && Object.keys(window.clinicalEngine.proceduresMap).length > 0) {
      this.procedures = { ...window.clinicalEngine.proceduresMap };
      return;
    }
    try {
      const res = await fetch('./assets/data/procedures.json');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.procedures || []);
        list.forEach(p => {
          this.procedures[p.id] = p;
        });
        return;
      }
    } catch (e) {
      console.warn("Could not load ./assets/data/procedures.json", e);
    }
    try {
      const res = await fetch('/api/procedures');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.procedures || []);
        list.forEach(p => {
          this.procedures[p.id] = p;
        });
      }
    } catch (e) {
      console.warn("Could not load procedures from API", e);
    }
  }

  syncFromEngine(proceduresMap) {
    if (proceduresMap && typeof proceduresMap === 'object') {
      this.procedures = { ...this.procedures, ...proceduresMap };
    }
  }

  renderCard(procId) {
    const p = this.procedures[procId] || (window.clinicalEngine && window.clinicalEngine.proceduresMap && window.clinicalEngine.proceduresMap[procId]);
    if (!p) return '';

    return `
      <div class="procedure-card my-4 p-4 rounded-xl border border-sky-700/50 bg-slate-800/90 shadow-xl overflow-hidden transition-all hover:border-sky-500">
        <div class="flex flex-col md:flex-row items-center gap-4">
          <div class="w-full md:w-44 h-36 flex-shrink-0 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 p-1 flex items-center justify-center">
            <img src="./assets/svg/${p.svg_icon}" alt="${p.title}" class="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform" onclick="proceduresManager.openModal('${p.id}')">
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${procId === 'cpr' || procId === 'fast_stroke' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'}">
                ${p.badge}
              </span>
              <span class="text-xs text-slate-400">Доказательный стандарт</span>
            </div>
            <h4 class="text-base font-bold text-white mb-1">${p.title}</h4>
            <p class="text-xs text-slate-300 mb-3">${p.summary}</p>
            <div class="flex flex-wrap gap-2">
              <button onclick="proceduresManager.openModal('${p.id}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow">
                <span>👁️ Пошаговая схема и детали</span>
              </button>
              ${procId === 'cpr' ? `
                <button id="card-cpr-btn" onclick="proceduresManager.toggleCPRMetronome()" class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow">
                  <span id="card-cpr-icon">🔊</span>
                  <span id="card-cpr-text">Запустить метроном СЛР (110 bpm)</span>
                </button>
              ` : ''}
              ${procId === 'pulse' ? `
                <button onclick="proceduresManager.startPulseTimer()" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow">
                  <span>⏱️ Запустить таймер 30 сек</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  openModal(procId) {
    const p = this.procedures[procId] || (window.clinicalEngine && window.clinicalEngine.proceduresMap && window.clinicalEngine.proceduresMap[procId]);
    if (!p) return;
    this.activeProcedure = p;

    const modal = document.getElementById('procedure-modal');
    const content = document.getElementById('procedure-modal-content');
    if (!modal || !content) return;

    let stepsHtml = p.steps.map((step, idx) => `
      <li class="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/60 mb-2">
        <span class="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-400/30 flex items-center justify-center font-bold text-xs">${idx + 1}</span>
        <span class="text-sm text-slate-200 leading-snug">${step}</span>
      </li>
    `).join('');

    let contraHtml = p.contraindications ? p.contraindications.map(c => `
      <li class="text-xs text-red-300 flex items-start gap-1.5 mb-1">
        <span class="text-red-400">❌</span> <span>${c}</span>
      </li>
    `).join('') : '';

    content.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between pb-4 border-b border-slate-700">
          <div>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">${p.badge}</span>
            <h3 class="text-xl font-bold text-white mt-1">${p.title}</h3>
          </div>
          <button onclick="proceduresManager.closeModal()" class="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition">
            ✕
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
          <div class="flex flex-col items-center justify-center bg-slate-950 p-4 rounded-xl border border-slate-800">
            <img src="./assets/svg/${p.svg_icon}" alt="${p.title}" class="max-h-72 w-auto object-contain">
            <div class="mt-3 text-xs text-slate-400 text-center italic">
              Клинический источник: ${p.guideline || 'ERC/WHO Protocols'}
            </div>
            
            ${procId === 'cpr' ? `
              <div class="mt-4 w-full flex flex-col items-center p-3 rounded-lg bg-slate-900 border border-red-500/30">
                <button id="modal-cpr-btn" onclick="proceduresManager.toggleCPRMetronome()" class="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition">
                  <span id="modal-cpr-icon">🔊</span>
                  <span id="modal-cpr-text">Включить метроном СЛР (110 BPM)</span>
                </button>
                <div id="cpr-visual-pulse" class="w-8 h-8 rounded-full bg-red-500/30 border border-red-500 mt-2 flex items-center justify-center font-mono text-xs font-bold text-white transition-all">
                  ♥
                </div>
              </div>
            ` : ''}

            ${procId === 'pulse' ? `
              <div class="mt-4 w-full flex flex-col items-center p-3 rounded-lg bg-slate-900 border border-amber-500/30">
                <div class="text-2xl font-mono font-bold text-amber-400 mb-2" id="pulse-timer-display">30 сек</div>
                <button onclick="proceduresManager.startPulseTimer()" class="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold text-xs transition">
                  Запустить замер пульса
                </button>
              </div>
            ` : ''}
          </div>

          <div class="flex flex-col">
            <h4 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">Пошаговый алгоритм выполнения</h4>
            <ol class="space-y-1 overflow-y-auto max-h-72 pr-2">
              ${stepsHtml}
            </ol>

            ${contraHtml ? `
              <div class="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/50">
                <h5 class="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Категорически запрещено:</h5>
                <ul class="space-y-0.5">
                  ${contraHtml}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button onclick="proceduresManager.closeModal()" class="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition">
            Закрыть
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  closeModal() {
    const modal = document.getElementById('procedure-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  toggleCPRMetronome() {
    const isRunning = clinicalAudio.toggleCPRMetronome((count) => {
      const visualPulse = document.getElementById('cpr-visual-pulse');
      if (visualPulse) {
        visualPulse.style.transform = 'scale(1.35)';
        visualPulse.innerText = count % 30 || 30;
        setTimeout(() => {
          if (visualPulse) visualPulse.style.transform = 'scale(1)';
        }, 120);
      }
    });

    const updateBtns = (text, icon, bgClass) => {
      ['card-cpr', 'modal-cpr'].forEach(prefix => {
        const textEl = document.getElementById(`${prefix}-text`);
        const iconEl = document.getElementById(`${prefix}-icon`);
        const btnEl = document.getElementById(`${prefix}-btn`);
        if (textEl) textEl.innerText = text;
        if (iconEl) iconEl.innerText = icon;
        if (btnEl) {
          btnEl.className = btnEl.className.replace(/bg-(red|emerald)-\d+/g, bgClass);
        }
      });
    };

    if (isRunning) {
      updateBtns("Остановить метроном СЛР", "⏹️", "bg-emerald-600");
    } else {
      updateBtns("Запустить метроном СЛР (110 bpm)", "🔊", "bg-red-600");
    }
  }

  startPulseTimer() {
    const display = document.getElementById('pulse-timer-display');
    let timeLeft = 30;
    if (this.activeTimer) clearInterval(this.activeTimer);

    clinicalAudio.playTone(600, 'sine', 0.1);
    if (display) display.innerText = `${timeLeft} сек`;

    this.activeTimer = setInterval(() => {
      timeLeft--;
      if (display) display.innerText = `${timeLeft} сек`;
      if (timeLeft <= 0) {
        clearInterval(this.activeTimer);
        clinicalAudio.playTone(1000, 'sine', 0.3);
        if (display) display.innerText = "Умножьте удары на 2!";
      }
    }, 1000);
  }
}

const proceduresManager = new ProceduresManager();
