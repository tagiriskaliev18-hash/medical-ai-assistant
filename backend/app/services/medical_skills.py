import json
from pathlib import Path
from typing import Dict, Any, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = BASE_DIR / "frontend" / "assets" / "data"

class BackendSkillsEngine:
    def __init__(self):
        self.calculators = []
        self.emergency_drugs = []
        self.lab_categories = []
        self.lab_syndromes = []
        self.interactions = []
        self.icd10_codes = []
        self._load()

    def _load(self):
        try:
            with open(DATA_DIR / "calculators.json", "r", encoding="utf-8") as f:
                self.calculators = json.load(f).get("calculators", [])
            with open(DATA_DIR / "emergency_drugs.json", "r", encoding="utf-8") as f:
                self.emergency_drugs = json.load(f).get("drugs", [])
            with open(DATA_DIR / "lab_reference.json", "r", encoding="utf-8") as f:
                lab = json.load(f)
                self.lab_categories = lab.get("lab_categories", [])
                self.lab_syndromes = lab.get("syndromes", [])
            with open(DATA_DIR / "drug_interactions.json", "r", encoding="utf-8") as f:
                self.interactions = json.load(f).get("interactions", [])
            with open(DATA_DIR / "icd10.json", "r", encoding="utf-8") as f:
                self.icd10_codes = json.load(f).get("codes", [])
        except Exception as e:
            print(f"Error loading backend skills data: {e}")

    # 1. CKD-EPI 2021 Race-Free
    def calculate_ckd_epi(self, gender: str, age: float, creatinine_umol: float) -> Dict[str, Any]:
        cr_mg = creatinine_umol / 88.4
        if gender.lower() == "female":
            k = 0.7
            alpha = -0.241
            min_val = min(cr_mg / k, 1.0)
            max_val = max(cr_mg / k, 1.0)
            egfr = 142 * (min_val ** alpha) * (max_val ** -1.200) * (0.9938 ** age) * 1.012
        else:
            k = 0.9
            alpha = -0.302
            min_val = min(cr_mg / k, 1.0)
            max_val = max(cr_mg / k, 1.0)
            egfr = 142 * (min_val ** alpha) * (max_val ** -1.200) * (0.9938 ** age)

        egfr_val = round(egfr)
        if egfr_val >= 90:
            stage = "G1"
            cat = "Нормальная или высокая СКФ"
            rec = "Коррекция доз препаратов не требуется."
        elif egfr_val >= 60:
            stage = "G2"
            cat = "Незначительное снижение СКФ"
            rec = "Стандартные дозировки большинства ЛС. Ограничить длительный прием НПВП."
        elif egfr_val >= 45:
            stage = "G3a"
            cat = "Умеренное снижение СКФ"
            rec = "Требуется коррекция доз антибиотиков и ПОАК по клиренсу креатинина."
        elif egfr_val >= 30:
            stage = "G3b"
            cat = "Существенное снижение СКФ"
            rec = "Высокий риск токсичности. Тщательный перерасчет доз всех нефротоксичных средств."
        elif egfr_val >= 15:
            stage = "G4"
            cat = "Резкое снижение СКФ (тяжелая почечная недостаточность)"
            rec = "Подготовка к ЗПТ. Противопоказан метформин."
        else:
            stage = "G5"
            cat = "Терминальная почечная недостаточность (ТХБП)"
            rec = "Показан программный гемодиализ или трансплантация почки."

        return {
            "egfr": egfr_val,
            "stage": stage,
            "category": cat,
            "recommendation": rec,
            "guideline": "KDIGO 2021/2024 Clinical Practice Guideline"
        }

    # 2. CURB-65
    def calculate_curb65(self, confusion: bool = False, urea: bool = False, rr: bool = False, bp: bool = False, age65: bool = False) -> Dict[str, Any]:
        score = sum([bool(confusion), bool(urea), bool(rr), bool(bp), bool(age65)])
        if score <= 1:
            grp = "Низкий риск (Группа 1)"
            mort = "< 1.5%"
            routing = "Амбулаторное лечение."
        elif score == 2:
            grp = "Умеренный риск (Группа 2)"
            mort = "~9.2%"
            routing = "Госпитализация в терапевтическое отделение."
        else:
            grp = "Высокий риск летальности (Тяжелая пневмония, Группа 3)"
            mort = "22% – 30%"
            routing = "Неотложная госпитализация! Рассмотреть госпитализацию в ОРИТ."

        return {
            "score": score,
            "risk_group": grp,
            "mortality": mort,
            "routing": routing,
            "guideline": "British Thoracic Society (BTS) / Клинические протоколы МЗ"
        }

    # 3. CHA2DS2-VASc
    def calculate_cha2ds2_vasc(self, chf: bool = False, htn: bool = False, age75: bool = False,
                               dm: bool = False, stroke: bool = False, vasc: bool = False,
                               age65_74: bool = False, female: bool = False) -> Dict[str, Any]:
        score = (
            (1 if chf else 0) +
            (1 if htn else 0) +
            (2 if age75 else 0) +
            (1 if dm else 0) +
            (2 if stroke else 0) +
            (1 if vasc else 0) +
            (1 if age65_74 else 0) +
            (1 if female else 0)
        )

        adjusted_for_decision = score - (1 if female else 0)
        if adjusted_for_decision >= 2:
            rec = "Антикоагулянты показаны (Класс IA). Рекомендуются ПОАК (Апиксабан / Ривароксабан / Дабигатран)."
        elif adjusted_for_decision == 1:
            rec = "Антикоагулянты следует рассмотреть (Класс IIa) с учетом баланса пользы и риска кровотечений (HAS-BLED)."
        else:
            rec = "Низкий риск. Антикоагулянтная и антиагрегантная терапия не показана (Класс III)."

        return {
            "score": score,
            "recommendation": rec,
            "guideline": "ESC Guidelines on Atrial Fibrillation 2024"
        }

    # 4. GCS (Glasgow Coma Scale)
    def calculate_gcs(self, eye: int, verbal: int, motor: int) -> Dict[str, Any]:
        e = max(1, min(4, int(eye)))
        v = max(1, min(5, int(verbal)))
        m = max(1, min(6, int(motor)))
        score = e + v + m

        if score >= 15:
            status = "Ясное сознание (15 баллов)"
            action = "Ориентирован, контактен. Специфических реанимационных мер по защите ДП не требуется."
        elif score >= 13:
            status = "Оглушение умеренное / легкое (13–14 баллов)"
            action = "Динамический неврологический контроль. Мониторинг SpO2 и гемодинамики."
        elif score >= 9:
            status = "Сопор / глубокое оглушение (9–12 баллов)"
            action = "Высокий риск аспирации. Консультация реаниматолога. Подготовка воздуховода."
        else:
            status = "Кома (≤ 8 баллов)"
            action = "🚨 GCS ≤ 8 — прямое показание к экстренной интубации трахеи и переводу на ИВЛ! Вызов реанимационной бригады."

        return {
            "score": score,
            "details": f"E{e}V{v}M{m}",
            "status": status,
            "action": action,
            "guideline": "Advanced Trauma Life Support (ATLS) / Brain Trauma Foundation"
        }

    # 5. DDI Checker
    def check_drug_interactions(self, drug_list: List[str]) -> List[Dict[str, Any]]:
        lower_list = [d.lower().strip() for d in drug_list if d.strip()]
        alerts = []
        for rule in self.interactions:
            aliases_group1 = rule.get("aliases", [[], []])[0]
            aliases_group2 = rule.get("aliases", [[], []])[1]
            g1_matched = any(any(alias in d for alias in aliases_group1) for d in lower_list)
            g2_matched = any(any(alias in d for alias in aliases_group2) for d in lower_list)
            if g1_matched and g2_matched:
                alerts.append(rule)
        return alerts

    # 6. Labs Evaluator
    def evaluate_labs(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        findings = []
        syndromes = []

        def get_val(key):
            try:
                v = inputs.get(key)
                return float(v) if v is not None and str(v).strip() != "" else None
            except:
                return None

        wbc = get_val("wbc")
        band = get_val("band")
        crp = get_val("crp")
        amylase = get_val("amylase")
        troponin = get_val("troponin")
        ddimer = get_val("ddimer")
        glucose = get_val("glucose")
        potassium = get_val("potassium")
        creatinine = get_val("creatinine")
        hb = get_val("hb")

        if wbc is not None:
            if wbc > 9.0:
                findings.append(f"Лейкоцитоз {wbc} ×10⁹/л")
            elif wbc < 4.0:
                findings.append(f"Лейкопения {wbc} ×10⁹/л")

        if band is not None and band > 6.0:
            findings.append(f"Палочкоядерный сдвиг влево ({band}%)")

        if crp is not None and crp > 5.0:
            findings.append(f"Повышение СРБ ({crp} мг/л)")

        if amylase is not None and amylase > 100.0:
            findings.append(f"Гиперамилаземия ({amylase} Ед/л)")

        if troponin is not None and troponin >= 0.04:
            findings.append(f"Положительный тропонин ({troponin} нг/мл)")

        if ddimer is not None and ddimer > 0.50:
            findings.append(f"Повышение Д-димера ({ddimer} мкг/мл FEU)")

        if glucose is not None:
            if glucose < 3.5:
                findings.append(f"Опасная гипогликемия ({glucose} ммоль/л)")
            elif glucose > 6.1:
                if glucose > 11.1:
                    findings.append(f"Выраженная гипергликемия ({glucose} ммоль/л) — риск ДКА/ГГС")
                else:
                    findings.append(f"Гипергликемия ({glucose} ммоль/л)")

        if potassium is not None:
            if potassium > 5.1:
                if potassium > 5.5:
                    findings.append(f"Тяжелая гиперкалиемия ({potassium} ммоль/л) — угроза асистолии")
                else:
                    findings.append(f"Гиперкалиемия ({potassium} ммоль/л)")
            elif potassium < 3.5:
                findings.append(f"Гипокалиемия ({potassium} ммоль/л)")

        if creatinine is not None and creatinine > 115:
            findings.append(f"Азотемия / гиперкреатининемия ({creatinine} мкмоль/л)")

        if hb is not None and hb < 120:
            if hb < 70:
                findings.append(f"Тяжелая анемия ({hb} г/л) — показания к гемотрансфузии")
            else:
                findings.append(f"Анемический синдром (Hb {hb} г/л)")

        # Syndrome matching
        if (wbc and wbc > 10.0) or (band and band > 6.0) or (crp and crp > 10.0):
            syndromes.append({
                "id": "bacterial_infection",
                "title": "Острое системное бактериальное воспаление / СВР",
                "severity": "URGENT",
                "comment": "Лейкоцитоз со сдвигом влево и/или высокий СРБ. Поиск очага инфекции (легкие, мочевые пути, брюшная полость)."
            })

        if amylase and amylase > 150.0:
            syndromes.append({
                "id": "acute_pancreatitis",
                "title": "Острый панкреатит",
                "severity": "CRITICAL",
                "comment": "Повышение амилазы более чем в 1.5–3 раза. Экстренный осмотр дежурного хирурга, УЗИ/КТ, голод, спазмолитики."
            })

        if troponin and troponin >= 0.04:
            syndromes.append({
                "id": "myocardial_injury",
                "title": "Острое повреждение миокарда (ОКС / Инфаркт)",
                "severity": "CRITICAL",
                "comment": "Положительный тропонин указывает на некроз кардиомиоцитов. Немедленно ЭКГ в 12 отведениях, ДАТТ, перевод в кардиореанимацию."
            })

        if ddimer and ddimer > 0.50:
            syndromes.append({
                "id": "thrombosis_risk",
                "title": "Тромбоэмболический синдром (ТЭЛА / ТГВ)",
                "severity": "URGENT",
                "comment": "Повышение D-димера требует исключения ТЭЛА (шкала Wells/Geneva, КТ-ангиография легких) и ТГВ (УЗДГ вен ног)."
            })

        if glucose and glucose < 3.5:
            syndromes.append({
                "id": "hypoglycemia",
                "title": "Гипогликемическое состояние",
                "severity": "CRITICAL",
                "comment": "Глюкоза < 3.5 ммоль/л. Срочно: 40–60 мл 40% глюкозы В/В болюсно, контроль сознания."
            })

        if potassium and potassium > 5.5:
            syndromes.append({
                "id": "hyperkalemia",
                "title": "Тяжелая гиперкалиемия",
                "severity": "CRITICAL",
                "comment": "Калий > 5.5 ммоль/л. Риск фатальной асистолии/фибрилляции. Экстренно ЭКГ, 10% Кальция глюконат 10 мл В/В медленно."
            })

        return {
            "findings": findings,
            "syndromes": syndromes
        }

    # 7. SOAP Note Generator
    def generate_soap_note(self, patient_data: Dict[str, Any]) -> str:
        age = patient_data.get("patient_age") or patient_data.get("age") or "не указан"
        gender = patient_data.get("patient_gender") or patient_data.get("gender") or "не указан"
        complaints = patient_data.get("complaints", "Жалобы не детализированы")
        anamnesis = patient_data.get("anamnesis", "Анамнез со слов пациента")
        v = patient_data.get("vitals", {})
        d = patient_data.get("diagnosis", {})
        p = patient_data.get("plan", {})
        routing = patient_data.get("routing", "Наблюдение в приемном отделении")

        diag_name = d.get("name", "Острое терапевтическое состояние")
        diag_code = d.get("code", "I10")

        return f"""ПРОТОКОЛ ПЕРВИЧНОГО ОСМОТРА ВРАЧА ПРИЕМНОГО ПОКОЯ (SOAP)
============================================================
Пациент: {age} лет, пол: {gender}

[S] СУБЪЕКТИВНЫЙ СТАТУС (Жалобы и анамнез):
• Жалобы при поступлении: {complaints}
• Анамнез заболевания и жизни: {anamnesis}

[O] ОБЪЕКТИВНЫЙ СТАТУС (Витальные функции и осмотр):
• Общее состояние: удовлетворительное / средней тяжести
• АД: {v.get('bp', '120/80')} мм рт. ст. | ЧСС: {v.get('pulse', '76')} уд/мин | SpO2: {v.get('spo2', '98')}%
• ЧДД: {v.get('rr', '16')} в мин
• Аускультация легких: {v.get('lungs', 'Везикулярное дыхание, хрипов нет')}
• Пальпация живота: {v.get('abdomen', 'Мягкий, безболезненный во всех отделах, симптомы раздражения брюшины отрицательные')}

[A] КЛИНИЧЕСКАЯ ОЦЕНКА И ПРЕДВАРИТЕЛЬНЫЙ ДИАГНОЗ:
• Основной диагноз: {diag_name}
• Код по МКБ-10: {diag_code}

[P] ПЛАН ВЕДЕНИЯ И МАРШРУТИЗАЦИЯ:
• Экстренная диагностика: {p.get('diagnostics', 'ОАК, ОАМ, биохимия крови, ЭКГ в 12 отведениях')}
• Неотложная терапия в приемном отделении: {p.get('medications', 'По клиническому протоколу')}
• Маршрутизация: {routing}
============================================================
Врач приемного отделения: _____________________ (Подпись / Личная печать)
"""

backend_skills = BackendSkillsEngine()
medical_skills_engine = backend_skills
