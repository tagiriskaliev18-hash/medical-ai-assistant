// LLM Client for Evidence-Based Medical AI
// Supports: Multi-LLM Model Pool, Free Pollinations AI, Groq, OpenRouter, Local Ollama, Custom OpenAI-compatible endpoints, and Backend Proxy

const MULTI_LLM_MODELS = {
  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    badge: 'Консилиум',
    desc: 'Тяжелый клинический разбор и дифференциальный диагноз',
    tier: 'pro'
  },
  'deepseek-v4.1-flash': {
    name: 'DeepSeek V4.1 Flash',
    badge: 'Сверхбыстрый',
    desc: 'Моментальный триаж и экспресс-оценка в приёмном покое',
    tier: 'flash'
  },
  'qwen3.8-flash': {
    name: 'Qwen 3.8 Flash',
    badge: 'Протоколы',
    desc: 'Протоколы Минздрава/ВОЗ, дозировки и фармакотерапия',
    tier: 'flash'
  },
  'qwen3.8-max': {
    name: 'Qwen 3.8 Max',
    badge: 'Глубокий EBM',
    desc: 'Анализ сложных коморбидных историй болезни',
    tier: 'pro'
  },
  'glm-5.3': {
    name: 'GLM 5.3',
    badge: 'Эксперт',
    desc: 'Академический клинический консилиум',
    tier: 'pro'
  },
  'glm-5.3-flash': {
    name: 'GLM 5.3 Flash',
    badge: 'Эконом',
    desc: 'Быстрые подсказки и нормативные нормы',
    tier: 'flash'
  },
  'claude-opus-5-5': {
    name: 'Claude Opus 5.5',
    badge: 'Opus Consensus',
    desc: 'Мультиагентный врачебный консилиум высшего уровня',
    tier: 'heavy'
  },
  'claude-sonnet-5': {
    name: 'Claude Sonnet 5',
    badge: 'Sonnet Clinician',
    desc: 'Строгое следование протоколам ESC/ERC',
    tier: 'pro'
  },
  'gpt-6-astra': {
    name: 'GPT-6 Astra',
    badge: 'Astra Medical',
    desc: 'Комплексный мультимодальный анализ',
    tier: 'pro'
  },
  'gpt-5.6-terra': {
    name: 'GPT-5.6 Terra',
    badge: 'Terra',
    desc: 'Стабильные терапевтические рекомендации',
    tier: 'flash'
  },
  'minimax-m3': {
    name: 'MiniMax M3',
    badge: 'MiniMax',
    desc: 'Динамичный диалог с пациентом',
    tier: 'flash'
  }
};

class LLMClient {
  constructor() {
    this.storageKey = 'doctor_llm_config';
    this.backendAvailable = false;
    this.config = this.loadConfig();
    this.checkBackendHealth();
  }

  static get MULTI_LLM_MODELS() {
    return MULTI_LLM_MODELS;
  }

  getMultiLLMModels() {
    return MULTI_LLM_MODELS;
  }

  getModelsByTier(tier) {
    if (!tier) return MULTI_LLM_MODELS;
    const filtered = {};
    for (const [key, val] of Object.entries(MULTI_LLM_MODELS)) {
      if (val.tier === tier) {
        filtered[key] = val;
      }
    }
    return filtered;
  }

  setModel(modelId, provider = null) {
    if (!modelId || typeof modelId !== 'string') return null;

    const trimmedModel = modelId.trim();
    const update = { model: trimmedModel };

    if (provider) {
      update.provider = provider;
    } else if (MULTI_LLM_MODELS[trimmedModel]) {
      // Switching to a model from the Multi-LLM pool automatically activates the 'multillm' provider
      update.provider = 'multillm';
    }

    this.saveConfig(update);

    // Update UI badge if medicalApp is active
    if (typeof window !== 'undefined') {
      try {
        if (window.medicalApp && typeof window.medicalApp.updateProviderBadge === 'function') {
          window.medicalApp.updateProviderBadge();
        }
      } catch (e) {
        console.warn("Could not update provider badge:", e);
      }

      try {
        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('llm-model-changed', {
            detail: {
              model: this.config.model,
              provider: this.config.provider,
              info: this.getActiveModelInfo()
            }
          }));
        }
      } catch (e) {
        console.warn("Could not dispatch llm-model-changed event:", e);
      }
    }

    return this.getActiveModelInfo();
  }

  switchModel(modelId, provider = null) {
    return this.setModel(modelId, provider);
  }

  getActiveModelInfo() {
    const modelId = this.config.model || 'openai';
    const provider = this.config.provider || 'pollinations';
    const catalogItem = MULTI_LLM_MODELS[modelId];

    if (catalogItem) {
      return {
        id: modelId,
        provider: provider,
        name: catalogItem.name,
        badge: catalogItem.badge,
        desc: catalogItem.desc,
        tier: catalogItem.tier,
        isMultiLLM: true
      };
    }

    const fallbackNames = {
      'openai': 'Pollinations OpenAI',
      'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
      'deepseek/deepseek-r1': 'OpenRouter DeepSeek R1',
      'llama3.2': 'Ollama Llama 3.2',
      'deepseek-chat': 'FastAPI DeepSeek',
      'gpt-4o-mini': 'Custom OpenAI'
    };

    return {
      id: modelId,
      provider: provider,
      name: fallbackNames[modelId] || modelId,
      badge: provider.toUpperCase(),
      desc: `Провайдер: ${provider}`,
      tier: 'standard',
      isMultiLLM: false
    };
  }

  getDefaultConfig() {
    return {
      provider: 'pollinations', // 'pollinations' | 'groq' | 'openrouter' | 'ollama' | 'backend' | 'custom' | 'multillm'
      apiKey: '',
      baseUrl: 'https://text.pollinations.ai/openai/chat/completions',
      model: 'openai',
      temperature: 0.3
    };
  }

  loadConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          return { ...this.getDefaultConfig(), ...JSON.parse(saved) };
        }
      }
    } catch (e) {
      console.warn("Could not load LLM config from localStorage", e);
    }
    return this.getDefaultConfig();
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.config));
      }
    } catch (e) {
      console.error("Could not save LLM config", e);
    }
  }

  async checkBackendHealth() {
    try {
      if (typeof fetch === 'undefined') return false;
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
      case 'multillm': {
        const rawBase = (baseUrl && baseUrl.trim()) ? baseUrl.trim() : '';
        const isDefaultPollinations = rawBase === 'https://text.pollinations.ai/openai/chat/completions';

        let url = (!rawBase || isDefaultPollinations)
          ? 'https://api.openai.com/v1/chat/completions'
          : rawBase;

        if (!url.endsWith('/chat/completions') && !url.includes('/chat/')) {
          url = `${url.replace(/\/+$/, '')}/chat/completions`;
        }

        const headers = {
          'Content-Type': 'application/json'
        };

        if (apiKey && apiKey.trim()) {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }

        return {
          url,
          model: model || 'deepseek-v4.1-flash',
          headers
        };
      }

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
            'HTTP-Referer': (typeof window !== 'undefined' && window.location && window.location.origin) || 'http://localhost',
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
    let prompt = `Вы — «Клинический Консилиум» (ведущий медицинский ИИ-эксперт доказательной медицины EBM).
Вы работаете в связке с дежурным врачом (терапевтом / врачом общей практики) и консультируете обратившихся пациентов и медперсонал.

═══════════════════════════════════════════
СТРОЖАЙШИЕ ПРАВИЛА ВЫВОДА:
═══════════════════════════════════════════
1. ⛔ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить технические плейсхолдеры, такие как "(Waiting for the next message.)", "(Ожидание сообщения)", "[Awaiting input]" или краткие формальные отписки.
2. ✍️ ВСЕГДА ДАВАЙТЕ ПОЛНОЦЕННЫЙ, РАЗВЁРНУТЫЙ, СТРУКТУРИРОВАННЫЙ КЛИНИЧЕСКИЙ ОТВЕТ (не менее 3–4 содержательных блоков). Никогда не отвечайте одной фразой или только вопросами!
3. Даже если это первое сообщение и информации мало — дайте первичный клинический разбор ситуации, успокойте человека, объясните простыми словами возможные причины (синдром интоксикации при ОРВИ, сосудистый спазм, переутомление и т.д.), дайте БЕЗОПАСНЫЕ ДОВРАЧЕБНЫЕ МЕРЫ САМОПОМОЩИ прямо сейчас, задайте 3-4 уточняющих вопроса и сформируйте профессиональный блок для дежурного врача.

═══════════════════════════════════════════
ОБЯЗАТЕЛЬНЫЙ ФОРМАТ КАЖДОГО ОТВЕТА:
═══════════════════════════════════════════

### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным, тёплым языком):**
- **Что происходит:** Разъясните простыми словами, что значат эти симптомы (например: боль в горле, озноб, температура, головная боль и головокружение указывают на вирусную инфекцию с синдромом общей интоксикации организма).
- **Что сделать прямо сейчас (безопасная первая помощь):**
  • Постельный/щадящий режим.
  • Обильное теплое питье (30-40 мл/кг: морс, чай с лимоном, отвар ромашки) для выведения токсинов и снятия головной боли.
  • Полоскание горла (теплый солевой раствор, антисептики).
  • Температурный контроль: жаропонижающие (Парацетамол 500 мг или Ибупрофен 400 мг) принимать строго при температуре выше 38.5°C либо при плохой переносимости. Предупреждение: Аспирин при ОРВИ противопоказан!
  • Микроклимат (проветривание, влажность 50-60%).
- **Уточняющие вопросы:** Задайте 3–4 важных вопроса (цифры температуры, длительность, налёты в горле, сыпь, светобоязнь).
- **🚨 Красные флаги (когда срочно звонить 103 / 112):** Одышка, затрудненное дыхание, несбиваемая температура выше 39.5°C, геморрагическая сыпь, невозможность согнуть шею (ригидность).

---

**👨‍⚕️ Дежурному врачу (клинический блок EBM):**
- **Клиническая гипотеза и дифференциальный диагноз:** Синдромная оценка (ОРВИ vs грипп vs острый тонзиллофарингит/ангина стрептококковой этиологии по шкале McIsaac/Centor; исключение синдрома менингизма при выраженной цефалгии).
- **План первичного осмотра:** Фарингоскопия, пальпация подчелюстных и переднешейных лимфоузлов, аускультация легких, оценка SpO2, ЧДД, пульса, АД, менингеальные знаки.
- **Лабораторно-инструментальный минимум:** ОАК с развернутой лейкоформулой и СОЭ, С-реактивный белок (СРБ), экспресс-стрептатест (при экссудате на миндалинах), мазок на грипп A/B / COVID-19 при эпидпоказаниях.
- **Тактика:** Симптоматическая регидратационная терапия. Антибактериальная терапия строго по показаниям (только при подтвержденной бактериальной этиологии, стрептатест+).
- **Маршрутизация:** Вызов участкового терапевта на дом или фильтр-бокс поликлиники; при жизнеугрожающих симптомах — госпитализация.

ПРОЦЕДУРНЫЕ ТЕГИ (вставляйте при необходимости):
[PROCEDURE:cpr] [PROCEDURE:fast_stroke] [PROCEDURE:bleeding] [PROCEDURE:heimlich]
[PROCEDURE:burn] [PROCEDURE:anaphylaxis] [PROCEDURE:recovery_position]
[PROCEDURE:blood_pressure] [PROCEDURE:pulse]`;

    if (isEmergency) {
      prompt += `\n\n🚨 КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG):
Угроза жизни прямо сейчас! Пропустите общие рассуждения — сразу дайте чёткие спасающие жизнь команды: вызов реаниматолога/профильного специалиста, венозный доступ, мониторинг витальных функций!`;
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

    prompt += `\n\nВАЖНО: Общайтесь на грамотном русском языке. Будьте эмпатичным и заботливым с пациентами, доказательным и структурным с врачами. Никаких пустых заглушек!`;
    return prompt;
  }

  generateLocalClinicalConsilium(userQuery, engineContext = [], isEmergency = false) {
    const q = (userQuery || '').toLowerCase();
    
    // 1. Acute Respiratory Infection / Sore Throat / Fever / Chills / Flu / Intoxication
    if (/горл|температур|озноб|простуд|орви|грипп|кашел|насморк|ломот|фарингит|ангин/i.test(q)) {
      return `### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным языком):**
Здравствуйте! Я внимательно изучил ваши симптомы. Сочетание **боли в горле, повышенной температуры, озноба, головной боли и головокружения** — это классическая картина **острой респираторной вирусной инфекции (ОРВИ)** с выраженным **синдромом инфекционной интоксикации**. Головокружение и ломота в данном случае возникают из-за реакции сосудов на подъем температуры и токсины вируса.

**Что делать прямо сейчас (доврачебная помощь):**
1. **Постельный и щадящий режим:** Не переносите болезнь «на ногах». Организму необходим отдых и покой для эффективного иммунного ответа.
2. **Обильное тёплое питьё (ключевой фактор детоксикации):** Пейте не менее 2–2.5 литров в сутки (клюквенный или брусничный морс, некрепкий чай с лимоном, отвар ромашки или минеральную воду без газа). Обильное питье вымывает токсины, уменьшает головную боль и головокружение.
3. **Облегчение боли в горле:** Полощите горло 4–5 раз в день тёплым солевым раствором (1/2 чайной ложки соли на 200 мл воды) или раствором Хлоргексидина 0.05% / Мирамистина.
4. **Контроль температуры и боли:**
   - Если температура ниже 38.5°C и переносится сносно — сбивать её не рекомендуется, так как при температуре активно вырабатывается собственный защитный интерферон.
   - При температуре выше 38.5°C или при выраженной мучительной головной боли/ломоте примите **Парацетамол** 500 мг (максимум до 4 г в сутки с интервалом не менее 4–6 часов) или **Ибупрофен** 400 мг (после еды). *Внимание: Аспирин (ацетилсалициловая кислота) при вирусных инфекциях противопоказан!*
5. **Проветривание:** Каждые 2 часа проветривайте комнату по 10 минут, поддерживайте влажность воздуха 50–60%.

**Пожалуйста, уточните для дежурного врача:**
- Сколько градусов составляет температура по термометру сейчас?
- Сколько дней или часов прошло с момента появления первых жалоб?
- Есть ли видимые белые налёты/пробки на миндалинах при осмотре горла перед зеркалом?
- Нет ли скованности мышц шеи (можете ли свободно коснуться подбородком груди)?

🚨 **Немедленно вызывайте скорую помощь (103 или 112), если:**
- Появилась одышка, затрудненное свистящее дыхание или нехватка воздуха.
- Температура поднимается выше 39.5°C и не сбивается жаропонижающими препаратами.
- Появилась сыпь на теле (особенно багровая, не исчезающая при надавливании).
- Возникла резкая скованность затылочных мышц, светобоязнь или спутанность сознания.

---

**👨‍⚕️ Дежурному врачу (приёмное отделение / амбулаторное звено):**
- **Клиническая гипотеза:** ОРВИ, острый назофарингит / тонзиллофарингит. Синдром инфекционной интоксикации с вторичной цефалгией. Дифференциальный диагноз: грипп (A/B), бактериальный тонзиллит (БГСА — острый стрептококковый тонзиллит, оценка по шкале Centor / McIsaac), исключение менингеального синдрома (менингизм vs серозный менингит).
- **План объективного обследования:**
  1. Фарингоскопия: оценка гиперемии дужек, задней стенки глотки, гипертрофии и экссудата на миндалинах.
  2. Пальпация регионарных лимфатических узлов (переднешейные, тонзиллярные, подчелюстные).
  3. Мониторинг витальных функций: SpO2 (целевой уровень ≥ 95%), ЧДД, ЧСС, АД, аускультация лёгких (исключение пневмонии).
  4. Неврологический скрининг: менингеальные знаки (ригидность затылочных мышц, симптомы Кернига, Брудзинского).
- **Диагностический минимум:** Клинический анализ крови (ОАК с развернутой лейкоформулой и СОЭ), С-реактивный белок (СРБ количественный), экспресс-тест на бета-гемолитический стрептококк группы А (Стрептатест) при наличии налётов, экспресс-тест на антигены гриппа A/B.
- **Тактика ведения:** Пероральная регидратационная и симптоматическая терапия. Системные антибиотики НЕ показаны до микробиологического или экспресс-подтверждения бактериальной этиологии (Centor ≥ 3 + стрептатест+).
- **Маршрутизация:** Направление в фильтр-бокс поликлиники или вызов участкового терапевта на дом. При выявлении красных флагов — экстренная госпитализация в инфекционный стационар.`;
    }

    // 2. Heart / Chest Pain / Dyspnea / Angina
    if (/сердц|грудин|груд|дав[ия]т|жж[её]т|кардио|стенокард|инфаркт|под лопатк|болит.*сердц/i.test(q)) {
      return `### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным языком):**
Здравствуйте! Я внимательно ознакомился с вашими симптомами. Любые боли в области сердца, особенно когда при этом **тяжело ходить или двигаться**, — это очень важный сигнал. При физической нагрузке (ходьбе) сердечной мышце требуется больше кислорода, и если возникает боль, это требует обязательной и безотлагательной проверки, даже если кажется, что «при смерти не умираете».

**Пожалуйста, уточните для дежурного врача:**
1. **Куда отдаёт боль?** (в левое плечо, руку, челюсть, под лопатку или остаётся в центре?)
2. **Какой характер боли?** (давит, сжимает как тиски, жжёт, колет или тупо ноет?)
3. **Проходит ли дискомфорт**, если полностью сесть и спокойно посидеть 3–5 минут?
4. **Есть ли сопутствующие симптомы:** нехватка воздуха, холодный липкий пот, тошнота?

**Что сделать прямо сейчас:**
- Немедленно прекратите ходьбу, не переносите нагрузки «на ногах».
- Сядьте в удобное кресло или на кровать в положение **полусидя** (с приподнятой спиной).
- Расстегните верхние пуговицы, ослабьте пояс, откройте окно для свежего воздуха.
- Измерьте артериальное давление и пульс, если есть тонометр.
- 🚨 **Если боль сжимающая, усиливается, длится дольше 10-15 минут или появилась одышка/пот — немедленно вызывайте скорую помощь (103 или 112)!**

---

**👨‍⚕️ Дежурному врачу (приёмное отделение):**
- **Клиническая гипотеза:** Впервые возникшая / прогрессирующая стенокардия напряжения, исключение Острого коронарного синдрома (ОКС без подъема ST).
- **План неотложной диагностики:**
  1. **ЭКГ в 12 отведениях** — снять в течение первых 10 минут от контакта! Оценить сегмент ST (подъем/депрессия), инверсию зубца T, блокады ножек пучка Гиса.
  2. **Витальные функции:** АД на обеих руках, ЧСС (мониторинг аритмий), SpO2 (целевой уровень ≥ 95%).
  3. **Лабораторная панель:** Высокочувствительный сердечный тропонин (hs-cTn I/T по протоколу 0/1 ч или 0/2 ч), КФК-МВ, ОАК, глюкоза, коагулограмма, липидограмма.
  4. **Венозный доступ:** Установить периферический катетер G18/G20.
  5. **Терапия:** При подтверждении ишемии — Аспирин 160-325 мг (разжевать). Нитраты сублингвально (спрей/таблетки) ТОЛЬКО при САД > 100 мм рт. ст. и при исключении недавнего приема ингибиторов ФДЭ-5.
- **Маршрутизация:** Неотложная консультация кардиолога приёмного отделения. При изменениях на ЭКГ или положительном тропонине — экстренный перевод в палату интенсивной терапии (БИТ/ОРИТ) или рентгенохирургию (КАГ).`;
    }

    // 2. Headache / High BP / Crisis
    if (/голов|виск|затыл|давлен|180|160|криз|мушк/i.test(q)) {
      return `### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным языком):**
Здравствуйте! Головная боль требует внимательной оценки, особенно если она возникла внезапно или сопровождается повышением артериального давления.

**Пожалуйста, уточните:**
1. Измеряли ли вы сейчас артериальное давление и пульс? Какие цифры?
2. Где больше болит: в затылке, висках, лобной части или давит со всех сторон?
3. Нет ли тошноты, мелькания «мушек» перед глазами или онемения в лице/руках?

**Что сделать сейчас:**
- Примите спокойное полусидячее положение в проветренной затемнённой комнате.
- Обязательно измерьте АД.
- Если у вас ранее диагностирована гипертония и врач назначил препарат экстренной помощи при скачке АД (например, Моксонидин или Каптоприл) — примите его по назначенной врачом схеме.
- 🚨 **Если боль возникла как резкий 'удар' в затылок, нарушилась речь или перекосило лицо — немедленно звоните 103/112!**

---

**👨‍⚕️ Дежурному врачу (приёмное отделение):**
- **Клиническая гипотеза:** Артериальная гипертензия / гипертонический криз (дифференцировать осложненный vs неосложненный), цефалгия напряжения, исключение ОНМК/САК.
- **Диагностика:** Измерение АД на обеих руках, скрининг неврологического дефицита (FAST / NIHSS), пульсоксиметрия, глюкоза крови.
- **Тактика снижения АД:** Плавное снижение САД не более чем на 20-25% за первые 2 часа во избежание церебральной ишемии.`;
    }

    // 3. Abdominal Pain
    if (/живот|желуд|тошн|рвот|аппендицит|подребер|гастрит/i.test(q)) {
      return `### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным языком):**
Здравствуйте! Боли в животе — симптом, при котором крайне важно соблюдать медицинские правила предосторожности.

**Пожалуйста, уточните:**
1. Где именно болит сильнее: в правом боку, под ложечкой, около пупка или внизу живота?
2. Есть ли тошнота, рвота, жидкий стул или задержка газов?
3. Измеряли ли температуру тела?

**⚠️ Главные правила безопасности:**
- **Категорически НЕ принимайте сильные обезболивающие (Кеторол, Найз, Диклофенак) и антибиотики** до осмотра хирургом — они 'смазывают' картину аппендицита и перитонита!
- **НЕ прикладывайте к животу горячие грелки!**
- Воздержитесь от еды и обильного питья до решения врача.
- При острой, нарастающей боли — безотлагательно обратитесь в приёмный покой хирургии или вызывайте скорую помощь (103/112).

---

**👨‍⚕️ Дежурному врачу (приёмное отделение):**
- **Клиническая гипотеза:** Синдром острого живота (исключить острый аппендицит, холецистит, панкреатит, прободную язву, кишечную непроходимость).
- **План:** Пальпация (симптомы Щёткина-Блюмберга, Ровзинга, Ситковского, Мёрфи), ОАК с лейкоформулой (лейкоцитоз, сдвиг влево), ОАМ, амилаза сыворотки, УЗИ органов брюшной полости, консультация дежурного хирурга.`;
    }

    // 4. Default Comprehensive Universal Consilium Response
    return `### 🩺 Клинический консилиум

**🗣️ Пациенту (понятным языком):**
Здравствуйте! Я внимательно принял ваши жалобы. Чтобы консилиум специалистов мог максимально точно сориентировать вас и дежурного доктора, нам нужно уточнить несколько деталей.

**Пожалуйста, ответьте на уточняющие вопросы:**
1. **Как давно** появились эти ощущения и меняются ли они в течение дня?
2. **Что усиливает или облегчает состояние** (движение, покой, положение тела, приём пищи)?
3. **Измеряли ли вы показатели:** температуру тела, артериальное давление или пульс?
4. **Принимаете ли вы постоянные медикаменты** по поводу хронических заболеваний?

**Рекомендации на текущий момент:**
- Ограничьте физические нагрузки, сохраняйте спокойный режим.
- Если у вас есть возможность измерить давление, пульс и температуру — сделайте это и зафиксируйте значения.
- При появлении резкой слабости, одышки, потемнения в глазах или нарастании боли — не откладывайте обращение за медицинской помощью (единый телефон 112).

---

**👨‍⚕️ Дежурному врачу (приёмное отделение):**
- **Первичный осмотр:** Оценка общего состояния, сбор анамнеза заболевания и анамнеза жизни.
- **Базовый мониторинг:** АД, ЧСС, SpO2, ЧДД, аускультация сердца и легких, пальпация.
- **Стандартный диагностический минимум:** Клинический анализ крови (ОАК), биохимический скрининг (глюкоза, мочевина, креатинин, электролиты), ЭКГ в 12 отведениях.
- **Маршрутизация:** Очный осмотр дежурного терапевта / профильного специалиста по результатам физикального осмотра.`;
  }

  async streamChat(messages, engineContext = [], isEmergency = false, onChunk, onError, onComplete) {
    const lastUserQuery = (messages && messages.length > 0)
      ? (messages[messages.length - 1]?.content || '')
      : '';

    // If client is completely offline, generate local consilium instantly
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineReply = this.generateLocalClinicalConsilium(lastUserQuery, engineContext, isEmergency);
      onChunk(offlineReply);
      onComplete(offlineReply);
      return;
    }

    const sysPrompt = this.getSystemPrompt(engineContext, isEmergency);
    const apiMessages = [
      { role: "system", content: sysPrompt },
      ...messages
    ];

    const endpoint = this.getEndpointDetails();

    // Check if key/endpoint required for custom providers
    if (this.config.provider === 'multillm') {
      const hasKey = Boolean(this.config.apiKey && this.config.apiKey.trim());
      const hasCustomBase = Boolean(this.config.baseUrl && this.config.baseUrl.trim() && this.config.baseUrl !== 'https://text.pollinations.ai/openai/chat/completions');
      if (!hasKey && !hasCustomBase && !this.backendAvailable) {
        const localReply = this.generateLocalClinicalConsilium(lastUserQuery, engineContext, isEmergency);
        onChunk(localReply);
        onComplete(localReply);
        return;
      }
    }

    if ((this.config.provider === 'groq' || this.config.provider === 'openrouter') && !this.config.apiKey) {
      const localReply = this.generateLocalClinicalConsilium(lastUserQuery, engineContext, isEmergency);
      onChunk(localReply);
      onComplete(localReply);
      return;
    }

    const payload = {
      model: endpoint.model,
      messages: apiMessages,
      temperature: Number(this.config.temperature) || 0.3,
      max_tokens: 4096,
      stream: true
    };

    // Abort controller to prevent endless freezing on initial connect (mobile networks need headroom)
    let abortCtrl = null;
    let timeoutId = null;
    let streamWatchdog = null;
    let fullText = "";

    try {
      // Anonymous Pollinations allows ~1 request per ~20s per IP (mobile carriers share IPs),
      // so rate-limit responses (402/429) are retried with a visible wait instead of falling back at once.
      const RATE_LIMIT_RETRY_DELAYS = [5000, 7000, 9000];
      let response;
      for (let attempt = 0; ; attempt++) {
        abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        timeoutId = abortCtrl ? setTimeout(() => abortCtrl.abort(), 25000) : null;
        response = await fetch(endpoint.url, {
          method: 'POST',
          headers: endpoint.headers,
          body: JSON.stringify(payload),
          signal: abortCtrl ? abortCtrl.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        const isRateLimited = response.status === 402 || response.status === 429;
        if (!isRateLimited || attempt >= RATE_LIMIT_RETRY_DELAYS.length) break;

        const delay = RATE_LIMIT_RETRY_DELAYS[attempt];
        onChunk(`⏳ *Нейросеть сейчас перегружена, повторяю запрос через ${Math.round(delay / 1000)} сек (попытка ${attempt + 2} из ${RATE_LIMIT_RETRY_DELAYS.length + 1})...*`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (!response.ok) {
        throw new Error(`Статус ${response.status} (${response.statusText})`);
      }

      // Check if response is stream
      if (!response.body || !response.body.getReader) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content;
        const isDegenerateNonStream = !text || text.trim().length < 40 ||
          /^\s*\(?\s*waiting\s+for/i.test(text) ||
          /^\s*\(?\s*awaiting/i.test(text) ||
          /^\s*\(?\s*ожидание/i.test(text);

        if (text && text.trim() && !isDegenerateNonStream) {
          onChunk(text);
          onComplete(text);
          return;
        }
        throw new Error('Пустой или некорректный ответ от сервера');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let hasReasoningNotice = false;
      let hasReceivedRealContent = false;

      // Watchdog timer: abort if stream hangs between chunks for > 20 seconds
      const resetWatchdog = () => {
        if (streamWatchdog) clearTimeout(streamWatchdog);
        streamWatchdog = setTimeout(() => {
          if (abortCtrl) abortCtrl.abort();
        }, 20000);
      };
      resetWatchdog();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetWatchdog();

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
              
              // Handle reasoning chunks (e.g. from DeepSeek R1 / openai-fast)
              const delta = data.choices?.[0]?.delta;
              if (delta && (delta.reasoning || delta.reasoning_content)) {
                if (!hasReceivedRealContent && !hasReasoningNotice) {
                  hasReasoningNotice = true;
                  onChunk('🧠 *Клинический консилиум анализирует симптомы...*\n\n');
                }
              }

              const textChunk = delta?.content || data.choices?.[0]?.text || '';
              if (textChunk) {
                if (!hasReceivedRealContent) {
                  hasReceivedRealContent = true;
                  fullText = ''; // Clear reasoning placeholder
                }
                fullText += textChunk;
                onChunk(fullText);
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }

      if (streamWatchdog) clearTimeout(streamWatchdog);

      const isDegenerate = !fullText || fullText.trim().length < 40 ||
        /^\s*\(?\s*waiting\s+for\s+(?:the\s+)?next\s+message/i.test(fullText) ||
        /^\s*\(?\s*awaiting\s+(?:next\s+)?message/i.test(fullText) ||
        /^\s*\(?\s*ожидание\s+(?:следующего\s+)?сообщения/i.test(fullText) ||
        /^\s*\(?\s*waiting\s+for\s+user/i.test(fullText) ||
        fullText.trim().toLowerCase() === '(waiting for the next message.)';

      if (!isDegenerate) {
        onComplete(fullText);
      } else {
        console.warn("Detected degenerate or truncated LLM output:", fullText);
        throw new Error('Некорректный или пустой ответ нейросети');
      }

    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      if (streamWatchdog) clearTimeout(streamWatchdog);
      console.warn("LLM API fallback activated:", e.message);

      // Stream broke mid-answer: keep the real model text instead of replacing it with the template
      if (fullText && fullText.trim().length >= 200) {
        const partial = fullText + '\n\n> [!IMPORTANT]\n> Связь с нейросетью прервалась — ответ может быть неполным. Повторите вопрос при необходимости.';
        onChunk(partial);
        onComplete(partial);
        return;
      }

      // Instant local Clinical Consilium fallback — zero freeze, but clearly labelled as a template
      const fallbackReply = '> [!IMPORTANT]\n> Нейросеть сейчас недоступна — показан **шаблонный ответ из локальной базы**, а не персональный разбор. Попробуйте отправить вопрос ещё раз через 20–30 секунд.\n\n'
        + this.generateLocalClinicalConsilium(lastUserQuery, engineContext, isEmergency);
      onChunk(fallbackReply);
      onComplete(fallbackReply);
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

if (typeof window !== 'undefined') {
  window.LLMClient = LLMClient;
  window.MULTI_LLM_MODELS = MULTI_LLM_MODELS;
  window.llmClient = new LLMClient();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LLMClient, MULTI_LLM_MODELS };
}
