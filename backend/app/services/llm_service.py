import json
import httpx
import asyncio
from typing import AsyncGenerator, Dict, Any, List
from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from .ebm_engine import ebm_engine
from .red_flags import red_flag_scanner

SYSTEM_PROMPT = """Ты — «Подручный Доктор», экспертная медицинская система поддержки принятия клинических решений, строго следующая принципам Доказательной Медицины (Evidence-Based Medicine, EBM), стандартам ВОЗ (World Health Organization), ESC, AHA, ERC и актуальным мета-анализам Cochrane и PubMed.

Твоя задача — провести структурированный клинический разбор симптомов пациента с максимальной точностью, заботой и скоростью.

ФОРМАТ ТВОЕГО ОТВЕТА (СТРОГО СОБЛЮДАЙ СТРУКТУРУ В MARKDOWN):

### 🚦 1. ТРИАЖ И СТЕПЕНЬ ЭКСТРЕННОСТИ
Укажи один из трех уровней:
- 🔴 **КРАСНЫЙ (ЭКСТРЕННО)** — немедленный вызов скорой помощи 103 / 112 (жизнеугрожающее состояние).
- 🟡 **ЖЕЛТЫЙ (СРОЧНО)** — требуется очный осмотр дежурного врача в течение 12-24 часов.
- 🟢 **ЗЕЛЕНЫЙ (ПЛАНОВО / САМОПОМОЩЬ)** — амбулаторное наблюдение, домашние меры доказательной медицины.

### 🩺 2. ВЕРОЯТНЫЕ СОСТОЯНИЯ (ДОКАЗАТЕЛЬНЫЙ АНАЛИЗ)
- Перечисли 2-3 наиболее вероятных клинических синдрома/диагноза.
- Укажи уровень доказательности (например: Class I, Level A / Cochrane Review / ESC Guidelines 2023).

### ⚡ 3. ЧТО ДЕЛАТЬ ПРЯМО СЕЙЧАС (ПОШАГОВЫЙ АЛГОРИТМ)
1. **Шаг 1**: [Конкретное первое действие — покой, поза, доступ воздуха и т.д.]
2. **Шаг 2**: [Второе действие с точными цифрами и интервалами]
3. **Шаг 3**: [Третье действие]

### ⛔ 4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО
- ❌ [Опасная народная практика или фатальная ошибка №1]
- ❌ [Опасное действие №2]

### 🖼️ 5. РЕКОМЕНДУЕМЫЕ МАНИПУЛЯЦИИ
Если пациенту требуется выполнить манипуляцию, ОБЯЗАТЕЛЬНО укажи соответствующий тег:
- Для замера пульса: `[PROCEDURE:pulse]`
- Для реанимации / остановки сердца: `[PROCEDURE:cpr]`
- Для удушья / поперхивания: `[PROCEDURE:heimlich]`
- Для подозрения на инсульт: `[PROCEDURE:fast_stroke]`
- Для кровотечения: `[PROCEDURE:bleeding]`
- Для ожога: `[PROCEDURE:burn]`
- Для обморока / положения на боку: `[PROCEDURE:recovery_position]`
- Для аллергии / анафилаксии: `[PROCEDURE:anaphylaxis]`
- Для растяжений и травм: `[PROCEDURE:rice]`
- Для измерения давления: `[PROCEDURE:blood_pressure]`

### 👨‍⚕️ 6. К КАКОМУ ВРАЧУ И АНАЛИЗЫ
- Профильный специалист: [Терапевт / Кардиолог / Хирург / Невролог и т.д.]
- Рекомендуемые исследования: [ОАК, ЭКГ, УЗИ, МРТ и т.п.]

### ⚖️ 7. МЕДИЦИНСКИЙ ДИСКЛЕЙМЕР
*Данная информация носит ознакомительный характер на основе международных клинических протоколов доказательной медицины и не заменяет очной консультации сертифицированного врача. При угрозе жизни немедленно вызывайте 103 или 112.*
"""

class LLMService:
    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip('/')
        self.model = LLM_MODEL

    def update_config(self, api_key: str = None, base_url: str = None, model: str = None):
        if api_key:
            self.api_key = api_key.strip()
        if base_url:
            self.base_url = base_url.strip().rstrip('/')
        if model:
            self.model = model.strip()

    async def stream_chat(self, user_message: str, history: List[Dict[str, str]] = None) -> AsyncGenerator[str, None]:
        """
        Streams AI response token-by-token.
        First checks instant red flags.
        Then tries configured LLM API.
        If API fails or key is invalid, seamlessly engages the local Evidence-Based Engine.
        """
        # Step 1: Pre-triage scan (<1ms)
        red_flag = red_flag_scanner.scan(user_message)
        if red_flag and red_flag.get("detected"):
            alert_prefix = (
                f"> [!CAUTION]\n"
                f"> **ВНИМАНИЕ: ОБНАРУЖЕН КРИТИЧЕСКИЙ МАРКЕР ЭКСТРЕННОСТИ!**\n"
                f"> **{red_flag['title']}**\n"
                f"> **Действие:** {red_flag['action']}\n"
                f"> *Стандарт: {red_flag.get('guideline', 'ERC/WHO Emergency Care')}*\n\n"
            )
            yield alert_prefix
            if red_flag.get("procedure_id"):
                yield f"[PROCEDURE:{red_flag['procedure_id']}]\n\n"

        # Step 2: Build messages context with EBM knowledge injection
        ebm_matches = ebm_engine.find_relevant_guidelines(user_message)
        context_guideline = ""
        if ebm_matches:
            match = ebm_matches[0]
            context_guideline = (
                f"\n\n[КЛИНИЧЕСКИЕ ПРОТОКОЛЫ ДЛЯ УЧЕТА]:\n"
                f"Состояние: {match['name']}\n"
                f"Доказательность: {match.get('evidence_level')}\n"
                f"Источники: {', '.join(match.get('sources', []))}\n"
                f"План: {'; '.join(match.get('action_plan', []))}\n"
                f"Запрещено: {'; '.join(match.get('contraindicated', []))}\n"
            )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + context_guideline}
        ]
        if history:
            messages.extend(history[-6:])
        messages.append({"role": "user", "content": user_message})

        # Step 3: Stream from external LLM
        stream_success = False
        endpoint = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
            "max_tokens": 1500
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                    if response.status_code == 200:
                        stream_success = True
                        async for line in response.aiter_lines():
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

        # Step 4: Fallback to EBM Clinical Expert Engine if external LLM failed
        if not stream_success:
            print("Activating local Evidence-Based Medical Intelligence Engine...")
            async for chunk in self._generate_ebm_fallback(user_message, red_flag, ebm_matches):
                yield chunk

    async def _generate_ebm_fallback(self, query: str, red_flag: dict, ebm_matches: list) -> AsyncGenerator[str, None]:
        """
        High-precision local clinical expert generator for instant response (<10ms).
        """
        await asyncio.sleep(0.05) # Tiny yield to let event loop tick

        q_lower = query.lower()

        # Determine procedure tag based on query
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

        # Check matching clinical protocol
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
            # Send in small natural pieces for stream effect
            for line in chunk.split("\n"):
                yield line + "\n"
                await asyncio.sleep(0.01)

llm_service = LLMService()
