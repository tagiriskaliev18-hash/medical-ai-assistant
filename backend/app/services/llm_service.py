import json
import httpx
import asyncio
from typing import AsyncGenerator, List, Dict, Optional
from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from .red_flags import red_flag_scanner
from .ebm_engine import ebm_engine

SYSTEM_PROMPT = """Вы — специализированный клинический ИИ-ассистент («Второй пилот дежурного врача приемного отделения / терапевта / ВОП»), работающий по строгим стандартам Доказательной Медицины (EBM), клиническим протоколам Минздрава, ВОЗ, Европейского общества кардиологов (ESC 2023/2024), ERC 2021 и Cochrane Library.

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
   - [PROCEDURE:pulse] (Пульс)
"""

class LLMService:
    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL
        self.model = LLM_MODEL

    def update_config(self, api_key: Optional[str] = None, base_url: Optional[str] = None, model: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key
        if base_url is not None:
            self.base_url = base_url
        if model is not None:
            self.model = model

    async def stream_chat(self, user_message: str, history: List[Dict[str, str]] = None, custom_api_key: Optional[str] = None) -> AsyncGenerator[str, None]:
        effective_key = custom_api_key or self.api_key
        history = history or []

        # 1. Instant Clinical Screening
        red_flag = red_flag_scanner.scan(user_message)
        ebm_matches = ebm_engine.find_relevant_guidelines(user_message)

        # 2. Build Context
        context_block = ""
        if red_flag and red_flag.get("detected"):
            context_block += f"\n\n🚨 КРИТИЧЕСКОЕ СОСТОЯНИЕ (RED FLAG): {red_flag['title']}\nНеотложное действие: {red_flag['action']}\n"
        if ebm_matches:
            context_block += "\n\nКЛИНИЧЕСКИЕ ПРОТОКОЛЫ EBM ИЗ БАЗЫ ДАННЫХ:\n"
            for m in ebm_matches[:2]:
                context_block += f"- Патология: {m['name']} (Триаж: {m['triage']})\n"
                if m.get("action_plan"):
                    context_block += f"  Алгоритм: {'; '.join(m['action_plan'][:3])}\n"

        prompt_with_context = SYSTEM_PROMPT + context_block

        messages = [{"role": "system", "content": prompt_with_context}]
        for msg in history[-6:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        stream_success = False

        # 3. Stream from configured provider if key exists
        if effective_key:
            endpoint_url = f"{self.base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {effective_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": 0.3,
                "stream": True
            }

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    async with client.stream("POST", endpoint_url, headers=headers, json=payload) as response:
                        if response.status_code == 200:
                            stream_success = True
                            async for line in response.aiter_lines():
                                if not line or line.startswith(":"):
                                    continue
                                if line.startswith("data: "):
                                    data_str = line[6:].strip()
                                    if data_str == "[DONE]":
                                        break
                                    try:
                                        chunk = json.loads(data_str)
                                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content:
                                            yield content
                                    except Exception:
                                        continue
                        else:
                            print(f"Primary LLM API returned status {response.status_code}")
            except Exception as e:
                print(f"Primary LLM connection error: {e}")

        # 4. Fallback to EBM Clinical Expert Engine if external LLM failed or no key
        if not stream_success:
            print("Activating local Evidence-Based Medical Intelligence Engine...")
            async for chunk in self._generate_ebm_fallback(user_message, red_flag, ebm_matches):
                yield chunk

    async def _generate_ebm_fallback(self, query: str, red_flag: dict, ebm_matches: list) -> AsyncGenerator[str, None]:
        await asyncio.sleep(0.05)
        q_lower = query.lower()

        proc_tag = ""
        if any(w in q_lower for w in ["пульс", "чсс", "сердцебиение"]):
            proc_tag = "[PROCEDURE:pulse]\n\n"
        elif any(w in q_lower for w in ["не дышит", "остановка сердца", "реанимация", "слр"]):
            proc_tag = "[PROCEDURE:cpr]\n\n"
        elif any(w in q_lower for w in ["поперхнулся", "задыхается едой", "геймлих", "удушье"]):
            proc_tag = "[PROCEDURE:heimlich]\n\n"
        elif any(w in q_lower for w in ["инсульт", "перекосило", "онемела рука", "речь"]):
            proc_tag = "[PROCEDURE:fast_stroke]\n\n"
        elif any(w in q_lower for w in ["кровь", "кровотечение", "порез", "рана"]):
            proc_tag = "[PROCEDURE:bleeding]\n\n"
        elif any(w in q_lower for w in ["ожог", "обварился", "кипяток"]):
            proc_tag = "[PROCEDURE:burn]\n\n"
        elif any(w in q_lower for w in ["обморок", "без сознания"]):
            proc_tag = "[PROCEDURE:recovery_position]\n\n"
        elif any(w in q_lower for w in ["аллергия", "отек квинке", "анафилаксия"]):
            proc_tag = "[PROCEDURE:anaphylaxis]\n\n"
        elif any(w in q_lower for w in ["вывих", "растяжение", "подвернул", "ушиб"]):
            proc_tag = "[PROCEDURE:rice]\n\n"
        elif any(w in q_lower for w in ["давление", "гипертония", "тонометр"]):
            proc_tag = "[PROCEDURE:blood_pressure]\n\n"

        match = ebm_matches[0] if ebm_matches else None
        triage_level = "🔴 **КРАСНЫЙ (ЭКСТРЕННО)**" if (red_flag and red_flag.get("detected")) or (match and match.get("triage") == "CRITICAL") else ("🟡 **ЖЕЛТЫЙ (СРОЧНО)**" if (match and match.get("triage") == "URGENT") else "🟢 **ЗЕЛЕНЫЙ (ПЛАНОВО / САМОПОМОЩЬ)**")

        diag_name = match["name"] if match else "Синдромная оценка клинических симптомов"
        evidence_level = match.get("evidence_level", "Class I, Level A (Клинические протоколы ВОЗ / Cochrane Library)") if match else "Evidence-Based Medicine Guidelines / PubMed"
        sources = ", ".join(match.get("sources", ["WHO Guidelines", "UpToDate Clinical Summary", "PubMed Central"])) if match else "WHO Emergency Protocols / PubMed / Google Scholar"

        actions = match.get("action_plan", [
            "Обеспечить пациенту полный физический и эмоциональный покой в комфортном положении.",
            "Контролировать ключевые витальные параметры: частоту дыхания, пульс, уровень артериального давления.",
            "Обеспечить приток свежего воздуха (открыть окно, расстегнуть стесняющую одежду).",
            "Подготовить медицинские документы, список принимаемых препаратов для осмотра врачом."
        ]) if match else [
            "Обеспечить физический и эмоциональный покой в проветриваемом помещении.",
            "Провести замер витальных функций (пульс, артериальное давление, температура тела).",
            "Зафиксировать динамику симптомов и время их начала."
        ]

        contra = match.get("contraindicated", [
            "Не принимать сильнодействующие медикаменты без прямого назначения врача.",
            "Не игнорировать появление симптомов «красных флагов» (одышка, потеря сознания, давящая боль в груди)."
        ]) if match else [
            "Не заниматься самолечением рецептурными препаратами и антибиотиками.",
            "Не прогревать зоны острой боли неизвестного происхождения."
        ]

        response_chunks = [
            f"### 🚦 1. ТРИАЖ И СТЕПЕНЬ ЭКСТРЕННОСТИ\n{triage_level}\n\n",
            f"### 🩺 2. ВЕРОЯТНЫЕ СОСТОЯНИЯ (ДОКАЗАТЕЛЬНЫЙ АНАЛИЗ)\n- **{diag_name}**\n- **Уровень доказательности:** {evidence_level}\n- **Источники и литература:** {sources}\n\n",
            f"### ⚡ 3. ЧТО ДЕЛАТЬ ПРЯМО СЕЙЧАС (ПОШАГОВЫЙ АЛГОРИТМ)\n" + "".join([f"{i+1}. **Шаг {i+1}**: {act}\n" for i, act in enumerate(actions)]) + "\n",
            f"### ⛔ 4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО\n" + "".join([f"- ❌ {c}\n" for c in contra]) + "\n",
            f"### 🖼️ 5. РЕКОМЕНДУЕМЫЕ МАНИПУЛЯЦИИ\n{proc_tag if proc_tag else 'Особых хирургических или экстренных процедур первой помощи на данном этапе не требуется.'}\n",
            f"### 👨‍⚕️ 6. К КАКОМУ ВРАЧУ И АНАЛИЗЫ\n- **Специалист:** Врач общей практики / терапевт (при ухудшении — бригада скорой помощи 103).\n- **Базовый скрининг:** Общий анализ крови (ОАК), общий анализ мочи, ЭКГ в 12 отведениях.\n\n",
            f"### ⚖️ 7. МЕДИЦИНСКИЙ ДИСКЛЕЙМЕР\n*Данный клинический разбор сформирован на основе международных стандартов доказательной медицины (EBM). Он предназначен исключительно для информационной ориентации и не заменяет очного медицинского осмотра сертифицированным специалистом. При признаках угрозы жизни немедленно звоните 103 или 112.*\n"
        ]

        for chunk in response_chunks:
            for line in chunk.split("\n"):
                yield line + "\n"
                await asyncio.sleep(0.01)

llm_service = LLMService()
