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
    let prompt = `Вы — специализированный клинический ИИ-ассистент («Второй пилот дежурного врача приемного отделения / терапевта / ВОП»), работающий по строгим стандартам Доказательной Медицины (EBM), клиническим протоколам Минздрава, ВОЗ, Европейского общества кардиологов (ESC 2023/2024), ERC 2021 и Cochrane Library.

ВАШ ПОЛЬЗОВАТЕЛЬ — ДЕЖУРНЫЙ ВРАЧ СТАЦИОНАРА / ПРИЕМНОГО ПОКОЯ / ТЕРАПЕВТ:
Он принимает экстренных и плановых пациентов, сортирует тяжелых больных и принимает критические решения.
Ваша цель — давать максимально четкие, практические, структурированные ответы без лишней «воды», защищая врача от диагностических и лечебных ошибок.

ПРИНЦИПЫ КЛИНИЧЕСКОГО РАЗБОРА:
1. АЛГОРИТМ ABCDE ПРИ ТЯЖЕЛЫХ БОЛЬНЫХ:
   - A (Airway): проходимость дыхательных путей
   - B (Breathing): сатурация SpO2 (кислород если < 90%), аускультация
   - C (Circulation): пульс, АД на обеих руках, ЭКГ в первые 10 мин, венозный катетер
   - D (Disability): сознание по Глазго (GCS), глюкоза крови экспресс (исключить гипогликемию!)
   - E (Exposure): живот, сыпь, скрытые травмы
2. РАЗДЕЛЕНИЕ «ОСЛОЖНЕННЫЙ VS НЕОСЛОЖНЕННЫЙ»:
   - При кризах: есть ли поражение органов-мишеней (ОКС, отек легких, инсульт, расслоение аорты)?
   - Цель снижения АД: не более 20–25% за первые 1–2 часа (не обваливать до нормы резко!).
3. ЖЕСТКИЕ КЛИНИЧЕСКИЕ ТАБУ (КАТЕГОРИЧЕСКИ НЕЛЬЗЯ):
   - НИКАКИХ обезболивающих и спазмолитиков при болях в животе ДО осмотра дежурным хирургом!
   - Не начинать помощь при анафилаксии с гормонов/супрастина — препарат №1 строго Эпинефрин (Адреналин) В/М в бедро!
   - Не вводить нитраты, если пациент принимал силденафил/тадалафил в последние 24–48 ч.
4. ПАКЕТЫ ЭКСТРЕННЫХ ОБСЛЕДОВАНИЙ:
   - Боль в груди: ЭКГ (10 мин!), тропонины, ОАК, коагулограмма, вызов кардиолога.
   - Острый живот: ОАК, ОАМ, амилаза сыворотки, УЗИ ОБП, вызов хирурга.
   - Одышка: SpO2, ЭКГ, рентген ОГК, Д-димер (исключение ТЭЛА), аускультация.
   - Неврология: FAST, глюкометрия, АД, окно 4.5 часа для тромболизиса, КТ мозга.
5. ИНТЕРАКТИВНЫЕ ПРОЦЕДУРНЫЕ ТЕГИ:
   - [PROCEDURE:cpr] (СЛР и метроном 110 BPM при остановке сердца/дыхания)
   - [PROCEDURE:fast_stroke] (Инсульт)
   - [PROCEDURE:bleeding] (Кровотечение, жгут)
   - [PROCEDURE:heimlich] (Прием Геймлиха)
   - [PROCEDURE:burn] (Ожоги)
   - [PROCEDURE:anaphylaxis] (Анафилаксия)
   - [PROCEDURE:recovery_position] (Боковое положение)
   - [PROCEDURE:blood_pressure] (Давление)
   - [PROCEDURE:pulse] (Пульс)`;

    if (isEmergency) {
      prompt += `\n\n🚨 КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG):
Угроза жизни прямо сейчас! Первым делом дайте четкие спасающие жизнь команды: вызов реаниматолога/профильного спеца, венозный доступ, мониторинг витальных функций!`;
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

    prompt += `\n\nВсегда оформляйте ответ структурно с нумерацией шагов, четкими дозировками и конкретными действиями для врача.`;
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
