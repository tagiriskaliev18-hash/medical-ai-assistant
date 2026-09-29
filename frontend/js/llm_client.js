// LLM Client for Evidence-Based Medical AI
// Supports: Free Pollinations AI, Groq, OpenRouter, Local Ollama, Custom OpenAI-compatible endpoints, and Backend Proxy

class LLMClient {
  constructor() {
    this.storageKey = 'doctor_llm_config';
    this.backendAvailable = false;
    this.config = this.loadConfig();
    this.checkBackendHealth();
  }

  getDefaultConfig() {
    return {
      provider: 'pollinations', // 'pollinations' | 'groq' | 'openrouter' | 'ollama' | 'backend' | 'custom'
      apiKey: '',
      baseUrl: 'https://text.pollinations.ai/openai/chat/completions',
      model: 'openai',
      temperature: 0.3
    };
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return { ...this.getDefaultConfig(), ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Could not load LLM config from localStorage", e);
    }
    return this.getDefaultConfig();
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (e) {
      console.error("Could not save LLM config", e);
    }
  }

  async checkBackendHealth() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch('./api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        this.backendAvailable = true;
        console.log("Локальный бэкенд активен");
      } else {
        this.backendAvailable = false;
      }
    } catch (e) {
      this.backendAvailable = false;
    }
    return this.backendAvailable;
  }

  getEndpointDetails() {
    const { provider, apiKey, baseUrl, model } = this.config;

    switch (provider) {
      case 'groq':
        return {
          url: 'https://api.groq.com/openai/v1/chat/completions',
          model: model || 'llama-3.3-70b-versatile',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`
          }
        };

      case 'openrouter':
        return {
          url: 'https://openrouter.ai/api/v1/chat/completions',
          model: model || 'deepseek/deepseek-r1',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'HTTP-Referer': window.location.origin || 'http://localhost',
            'X-Title': 'Medical AI Assistant'
          }
        };

      case 'ollama':
        return {
          url: (baseUrl && baseUrl.trim()) ? `${baseUrl.trim().replace(/\/$/, '')}/chat/completions` : 'http://localhost:11434/v1/chat/completions',
          model: model || 'llama3.2',
          headers: {
            'Content-Type': 'application/json'
          }
        };

      case 'backend':
        return {
          url: './api/chat/stream',
          model: model || 'deepseek-chat',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-Custom-API-Key': apiKey.trim() } : {})
          }
        };

      case 'custom':
        return {
          url: baseUrl && baseUrl.trim() ? baseUrl.trim() : 'https://api.openai.com/v1/chat/completions',
          model: model || 'gpt-4o-mini',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {})
          }
        };

      case 'pollinations':
      default:
        return {
          url: 'https://text.pollinations.ai/openai/chat/completions',
          model: model || 'openai',
          headers: {
            'Content-Type': 'application/json'
          }
        };
    }
  }

  getSystemPrompt(engineContext, isEmergency) {
    let prompt = `Вы — «Медицинский ИИ-помощник приёмного отделения». Вы работаете в связке с дежурным врачом (терапевтом / ВОП) в приёмном покое.

К ВАМ ОБРАЩАЮТСЯ ДВА ТИПА ПОЛЬЗОВАТЕЛЕЙ:
1. **ПАЦИЕНТ** — обычный человек (бабушка, мама с ребёнком, подросток), который описывает жалобы простыми словами: «болит голова», «тошнит», «ребёнок температурит».
2. **ВРАЧ** — дежурный врач, который просит помощь с клиническим разбором, дозировками, протоколами.

═══════════════════════════════════════════
АЛГОРИТМ РАБОТЫ С ПАЦИЕНТОМ (ПРИОРИТЕТ №1):
═══════════════════════════════════════════

ШАГ 1 — ПЕРВИЧНЫЙ КОНТАКТ (мягко, на «вы», без медицинского жаргона):
- Поприветствуйте пациента по-человечески
- Задайте 2-3 УТОЧНЯЮЩИХ ВОПРОСА простым языком:
  • «Как давно это началось?»
  • «Где именно болит — можете показать рукой?»
  • «Есть ли температура? Измеряли?»
  • «Принимали ли вы какие-нибудь лекарства?»
  • «Были ли подобные жалобы раньше?»
- НЕ ТРЕБУЙТЕ клинических данных (анализы, ЭКГ) на этом этапе!
- НЕ ПРОСИТЕ «конкретный клинический случай» — пациент НЕ ВРАЧ!

ШАГ 2 — УКАЗАНИЯ ДЕЖУРНОМУ ВРАЧУ (после сбора жалоб):
Когда картина жалоб стала яснее, переключитесь на врача и выдайте:
- 📋 **Что измерить/проверить:** АД, пульс, температура, сатурация, ЧДД, ЧСС, осмотр и т.д.
- 🔬 **Какие анализы назначить:** ОАК, биохимия, ЭКГ, УЗИ — если нужны
- ⚠️ **На что обратить внимание** (red flags): признаки, которые нельзя пропустить
- 💊 **Первая помощь** (если нужна немедленно): конкретные дозировки

ШАГ 3 — НАПРАВЛЕНИЕ К СПЕЦИАЛИСТУ:
В конце ОБЯЗАТЕЛЬНО укажите:
- 👨‍⚕️ **К какому врачу направить:** терапевт, кардиолог, невролог, хирург, офтальмолог, ЛОР, эндокринолог, гастроэнтеролог и т.д.
- 🏥 **Срочность:** экстренно (сейчас) / в течение суток / плановый приём
- 📝 **Предварительный диагноз** (для врача, не для пациента)

═══════════════════════════════════════════
ФОРМАТ ОТВЕТА:
═══════════════════════════════════════════

Если информации МАЛО (первое сообщение пациента):
→ Задайте 2-3 уточняющих вопроса ПРОСТЫМ языком
→ НЕ ставьте диагноз, НЕ назначайте лечение до выяснения картины

Если информации ДОСТАТОЧНО:
→ Разделите ответ на две части:

**🗣️ Для пациента:** (простым языком, без мед. терминов)
Объясните что с ним происходит, успокойте, скажите к какому врачу его направят.

**👨‍⚕️ Для врача:** (профессиональным языком)
Что измерить, какие обследования, дифф. диагноз, на что обратить внимание, тактика.

═══════════════════════════════════════════
ЕСЛИ ОБРАЩАЕТСЯ ВРАЧ (клинический разбор):
═══════════════════════════════════════════
Распознайте это по мед. терминологии в запросе и переключитесь в экспертный режим:
- Алгоритм ABCDE при тяжёлых больных
- Строгие стандарты EBM (Cochrane Library, ESC 2023/2024, ERC 2021)
- Конкретные дозировки, протоколы, пакеты обследований
- Дифференциальный диагноз

КЛИНИЧЕСКИЕ ПРАВИЛА (для врачебного режима):
1. ABCDE при тяжёлых: A(Airway) → B(Breathing, SpO2) → C(Circulation, АД, ЭКГ) → D(Disability, GCS, глюкоза) → E(Exposure)
2. При кризах: осложнённый vs неосложнённый, снижение АД не более 20-25% за 1-2 часа
3. ТАБУ: обезболивающие при остром животе до хирурга! Эпинефрин В/М при анафилаксии (не гормоны первой линией)! Нитраты запрещены после силденафила 24-48ч!
4. Боль в груди → ЭКГ 10 мин, тропонины, ОАК, коагулограмма
5. Острый живот → ОАК, ОАМ, амилаза, УЗИ ОБП, хирург
6. Одышка → SpO2, ЭКГ, рентген ОГК, Д-димер
7. Неврология → FAST, глюкометрия, АД, окно 4.5ч тромболизис, КТ

ПРОЦЕДУРНЫЕ ТЕГИ (вставляйте при необходимости):
[PROCEDURE:cpr] [PROCEDURE:fast_stroke] [PROCEDURE:bleeding] [PROCEDURE:heimlich]
[PROCEDURE:burn] [PROCEDURE:anaphylaxis] [PROCEDURE:recovery_position]
[PROCEDURE:blood_pressure] [PROCEDURE:pulse]`;

    if (isEmergency) {
      prompt += `\n\n🚨 КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG):
Угроза жизни прямо сейчас! Пропустите уточняющие вопросы — сразу дайте чёткие спасающие жизнь команды: вызов реаниматолога/профильного специалиста, венозный доступ, мониторинг витальных функций!`;
    }

    if (engineContext && engineContext.length > 0) {
      prompt += `\n\n[ДАННЫЕ ИЗ БАЗЫ КЛИНИЧЕСКИХ ПРОТОКОЛОВ]:\n`;
      engineContext.forEach(ctx => {
        prompt += `- Патология: ${ctx.name}\n`;
        if (ctx.recommendations && ctx.recommendations.length) {
          prompt += `  Действия: ${ctx.recommendations.join('; ')}\n`;
        }
        if (ctx.medications && ctx.medications.length) {
          prompt += `  Препараты 1-й линии: ${ctx.medications.join(', ')}\n`;
        }
        if (ctx.red_flags && ctx.red_flags.length) {
          prompt += `  Красные флаги: ${ctx.red_flags.join(', ')}\n`;
        }
      });
    }

    prompt += `\n\nВАЖНО: Общайтесь по-русски. Будьте тёплым и эмпатичным с пациентами, точным и структурным с врачами. Если пациент описывает симптомы расплывчато — это НОРМАЛЬНО, задайте уточняющие вопросы, а не просите «конкретный клинический случай».`;
    return prompt;
  }

  async streamChat(messages, engineContext = [], isEmergency = false, onChunk, onError, onComplete) {
    const sysPrompt = this.getSystemPrompt(engineContext, isEmergency);
    const apiMessages = [
      { role: "system", content: sysPrompt },
      ...messages
    ];

    const endpoint = this.getEndpointDetails();

    // Check if key required
    if ((this.config.provider === 'groq' || this.config.provider === 'openrouter') && !this.config.apiKey) {
      onError(`Для работы через ${this.config.provider.toUpperCase()} укажите API-ключ в настройках ⚙️. Или переключитесь на бесплатный Pollinations AI.`);
      return;
    }

    const payload = {
      model: endpoint.model,
      messages: apiMessages,
      temperature: Number(this.config.temperature) || 0.3,
      stream: true
    };

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errBody = '';
        try {
          errBody = await response.text();
        } catch (e) {}
        throw new Error(`Ошибка ${response.status} (${response.statusText}): ${errBody.slice(0, 180)}`);
      }

      // Check if response is stream
      const contentType = response.headers.get('content-type') || '';
      if (!response.body || !response.body.getReader) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content || 'Ответ не получен.';
        onChunk(text);
        onComplete(text);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (!line || line.startsWith(':')) continue;

          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const textChunk = data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || '';
              if (textChunk) {
                fullText += textChunk;
                onChunk(textChunk);
              }
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        const dataStr = buffer.trim().slice(6).trim();
        if (dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);
            const textChunk = data.choices?.[0]?.delta?.content || '';
            if (textChunk) {
              fullText += textChunk;
              onChunk(textChunk);
            }
          } catch (e) {}
        }
      }

      if (!fullText) {
        fullText = "Ответ получен, но текст пуст.";
        onChunk(fullText);
      }

      onComplete(fullText);

    } catch (e) {
      console.error("LLM Stream Error:", e);
      onError(`Не удалось получить ответ: ${e.message}. Проверьте соединение или настройки провайдера (⚙️).`);
    }
  }

  async testConnection() {
    const endpoint = this.getEndpointDetails();
    const payload = {
      model: endpoint.model,
      messages: [
        { role: 'system', content: 'Ответь кратко "OK".' },
        { role: 'user', content: 'Тест' }
      ],
      max_tokens: 10,
      stream: false
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Код ${res.status}: ${err.slice(0, 120)}` };
      }
      return { success: true };
    } catch (err) {
      clearTimeout(timer);
      return { success: false, error: err.message };
    }
  }
}

window.llmClient = new LLMClient();
