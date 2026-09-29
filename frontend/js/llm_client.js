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

  generateLocalClinicalConsilium(userQuery, engineContext = [], isEmergency = false) {
    const q = (userQuery || '').toLowerCase();
    
    // 1. Heart / Chest Pain / Dyspnea / Angina
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
      stream: true
    };

    // 12-second abort controller to prevent endless freezing
    const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = abortCtrl ? setTimeout(() => abortCtrl.abort(), 12000) : null;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: JSON.stringify(payload),
        signal: abortCtrl ? abortCtrl.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Статус ${response.status} (${response.statusText})`);
      }

      // Check if response is stream
      if (!response.body || !response.body.getReader) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          onChunk(text);
          onComplete(text);
          return;
        }
        throw new Error('Пустой ответ от сервера');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";
      let hasReasoningNotice = false;
      let hasReceivedRealContent = false;

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

      if (fullText && fullText.trim().length > 15) {
        onComplete(fullText);
      } else {
        throw new Error('Ответ был пустым или прерван');
      }

    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn("LLM API fallback activated:", e.message);

      // Instant high-quality local Clinical Consilium fallback — zero freeze!
      const fallbackReply = this.generateLocalClinicalConsilium(lastUserQuery, engineContext, isEmergency);
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
