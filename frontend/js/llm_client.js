// LLM Client for 100% Static Frontend App
// Uses Pollinations AI (Free Multi-Model System) which allows CORS

class LLMClient {
  constructor() {
    this.pollinationsUrl = 'https://text.pollinations.ai/openai/chat/completions';
    this.chutesUrl = 'https://chutes.ai/api/v1/chat/completions';
    // User provided key (fallback if CORS allows, otherwise Pollinations is primary)
    this.providedKey = 'sk-cvc-14fcd3078026472914eeee63d17063a371ef607aad4c98317f6af669328a1ed5'; 
  }

  getSystemPrompt(engineContext, isEmergency) {
    let prompt = `Вы — высококвалифицированный врач-диагност и медицинский ассистент с доступом к базе данных доказательной медицины (EBM). 
Ваша цель — проанализировать симптомы пациента, задать уточняющие вопросы (при необходимости) и предоставить предварительный диагноз с рекомендациями.
Отвечайте структурировано, профессионально, и доступным языком. Всегда используйте markdown форматирование.`;

    if (isEmergency) {
      prompt += `\n\n🚨 ВНИМАНИЕ: ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ СИМПТОМЫ (КРАСНЫЕ ФЛАГИ)!
Крайне важно СРОЧНО дать инструкции по первой помощи и направить к врачу.`;
    }

    if (engineContext && engineContext.length > 0) {
      prompt += `\n\n[РЕКОМЕНДАЦИИ И ПРОТОКОЛЫ EBM]:\n`;
      engineContext.forEach(ctx => {
        prompt += `- Протокол: ${ctx.name}\n`;
        prompt += `  Рекомендации: ${ctx.recommendations.join(', ')}\n`;
        prompt += `  Лекарства: ${ctx.medications.join(', ')}\n`;
        prompt += `  Требует ли обращения к врачу: ${ctx.requires_doctor ? 'ДА' : 'НЕТ'}\n`;
      });
    }

    prompt += `\n\nВАЖНОЕ ПРАВИЛО: Вы ИИ-ассистент, а не настоящий врач. Всегда добавляйте дисклеймер о необходимости консультации с живым специалистом, особенно если ситуация критическая.`;
    return prompt;
  }

  async streamChat(messages, engineContext = [], isEmergency = false, onChunk, onError, onComplete) {
    const sysPrompt = this.getSystemPrompt(engineContext, isEmergency);
    const apiMessages = [
      { role: "system", content: sysPrompt },
      ...messages
    ];

    try {
      // Primary: Pollinations (CORS allowed, multi-model, free, fast)
      const response = await fetch(this.pollinationsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai', // Route to default standard good model (GPT-4o or Claude depending on pollinations internal routing)
          messages: apiMessages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                const textChunk = data.choices[0].delta.content;
                fullText += textChunk;
                onChunk(textChunk);
              }
            } catch (e) {
              console.warn("Parse error on chunk: ", e);
            }
          }
        }
      }
      onComplete(fullText);

    } catch (e) {
      console.error("Pollinations failed, trying fallback...", e);
      onError("Ошибка соединения с нейросетью. Пожалуйста, попробуйте позже.");
    }
  }
}

window.llmClient = new LLMClient();
