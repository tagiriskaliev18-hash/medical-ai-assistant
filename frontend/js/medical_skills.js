// Medical Skills Hub: Deterministic Clinical Calculators, Lab Evaluator, DDI Checker, ICD-10 & SOAP Generator

class MedicalSkillsEngine {
  constructor() {
    this.calculators = [];
    this.emergencyDrugs = [];
    this.labCategories = [];
    this.labSyndromes = [];
    this.interactions = [];
    this.icd10Codes = [];
    this.loaded = false;

    this.loadSkillsData();
  }

  async loadSkillsData() {
    if (this.loaded) return;
    try {
      const [calcRes, drugRes, labRes, ddiRes, icdRes] = await Promise.all([
        fetch('./assets/data/calculators.json'),
        fetch('./assets/data/emergency_drugs.json'),
        fetch('./assets/data/lab_reference.json'),
        fetch('./assets/data/drug_interactions.json'),
        fetch('./assets/data/icd10.json')
      ]);

      const calcData = await calcRes.json();
      this.calculators = calcData.calculators || [];

      const drugData = await drugRes.json();
      this.emergencyDrugs = drugData.drugs || [];

      const labData = await labRes.json();
      this.labCategories = labData.lab_categories || [];
      this.labSyndromes = labData.syndromes || [];

      const ddiData = await ddiRes.json();
      this.interactions = ddiData.interactions || [];

      const icdData = await icdRes.json();
      this.icd10Codes = icdData.codes || [];

      this.loaded = true;
      console.log('Клинические скиллы и базы данных успешно загружены.');
    } catch (e) {
      console.error('Ошибка загрузки клинических скиллов:', e);
    }
  }

  // --- 1. DETERMINISTIC CLINICAL CALCULATORS ---

  // CKD-EPI 2021 Race-Free Equation
  calculateCKDEPI(gender, age, creatinineUmol) {
    const ageNum = Number(age);
    const crUmol = Number(creatinineUmol);
    const crMg = crUmol / 88.4; // Convert umol/L to mg/dL

    let egfr = 0;
    if (gender === 'female') {
      const k = 0.7;
      const alpha = -0.241;
      const minVal = Math.min(crMg / k, 1);
      const maxVal = Math.max(crMg / k, 1);
      egfr = 142 * Math.pow(minVal, alpha) * Math.pow(maxVal, -1.200) * Math.pow(0.9938, ageNum) * 1.012;
    } else {
      const k = 0.9;
      const alpha = -0.302;
      const minVal = Math.min(crMg / k, 1);
      const maxVal = Math.max(crMg / k, 1);
      egfr = 142 * Math.pow(minVal, alpha) * Math.pow(maxVal, -1.200) * Math.pow(0.9938, ageNum);
    }

    egfr = Math.round(egfr);

    let stage = '';
    let category = '';
    let recommendation = '';

    if (egfr >= 90) {
      stage = 'С1';
      category = 'Нормальная или высокая СКФ';
      recommendation = 'Коррекция доз препаратов не требуется. Мониторинг альбуминурии при диабете/АГ.';
    } else if (egfr >= 60) {
      stage = 'С2';
      category = 'Незначительное снижение СКФ';
      recommendation = 'Стандартные дозировки большинства ЛС. Избегать частого бесконтрольного приема НПВП.';
    } else if (egfr >= 45) {
      stage = 'С3а';
      category = 'Умеренное снижение СКФ';
      recommendation = 'Требуется коррекция доз антибиотиков и ПОАК по клиренсу креатинина. Ограничить НПВП.';
    } else if (egfr >= 30) {
      stage = 'С3б';
      category = 'Существенное снижение СКФ';
      recommendation = 'Высокий риск токсичности. Тщательный перерасчет доз всех нефротоксичных средств, строгий запрет НПВП.';
    } else if (egfr >= 15) {
      stage = 'С4';
      category = 'Резкое снижение СКФ (тяжелая почечная недостаточность)';
      recommendation = 'Подготовка к заместительной почечной терапии. Противопоказан метформин, многие антибиотики требуют снижения дозы в 2-4 раза.';
    } else {
      stage = 'С5';
      category = 'Терминальная почечная недостаточность (ТХБП)';
      recommendation = 'Показан программный гемодиализ или трансплантация почки. Консультация нефролога.';
    }

    return {
      egfr,
      stage,
      category,
      recommendation,
      formula: 'CKD-EPI (2021 race-free equation)',
      guideline: 'KDIGO 2021/2024 Clinical Practice Guideline'
    };
  }

  // CURB-65 for Community-Acquired Pneumonia
  calculateCURB65(c, u, r, b, age65) {
    let score = 0;
    if (c) score += 1;
    if (u) score += 1;
    if (r) score += 1;
    if (b) score += 1;
    if (age65) score += 1;

    let riskGroup = '';
    let mortality = '';
    let routing = '';

    if (score <= 1) {
      riskGroup = 'Низкий риск (Группа 1)';
      mortality = '< 1.5%';
      routing = 'Амбулаторное лечение (на дому под наблюдением ВОП/терапевта).';
    } else if (score === 2) {
      riskGroup = 'Умеренный риск (Группа 2)';
      mortality = '~9.2%';
      routing = 'Показана госпитализация в терапевтическое / пульмонологическое отделение стационара.';
    } else {
      riskGroup = 'Высокий риск летальности (Группа 3)';
      mortality = '22% – 30%';
      routing = 'Неотложная госпитализация! Рассмотреть госпитализацию в Отделение реанимации и интенсивной терапии (ОРИТ).';
    }

    return {
      score,
      riskGroup,
      mortality,
      routing,
      guideline: 'British Thoracic Society (BTS) / Клинические протоколы МЗ РК/РФ'
    };
  }

  // CHA2DS2-VASc for Atrial Fibrillation Stroke Risk
  calculateCHA2DS2VASc(inputs) {
    let score = 0;
    if (inputs.chf) score += 1;
    if (inputs.htn) score += 1;
    if (inputs.age75) score += 2;
    else if (inputs.age65_74) score += 1;
    if (inputs.dm) score += 1;
    if (inputs.stroke) score += 2;
    if (inputs.vasc) score += 1;
    if (inputs.female) score += 1;

    let recommendation = '';
    const isFemale = !!inputs.female;
    const threshold = isFemale ? 2 : 1;

    if (score === 0 || (isFemale && score === 1)) {
      recommendation = 'Низкий риск инсульта. Антикоагулянтная терапия не рекомендуется (Class III).';
    } else if ((!isFemale && score === 1) || (isFemale && score === 2)) {
      recommendation = 'Промежуточный риск. Следует рассмотреть назначение ПОАК (Апиксабан 5 мг 2 р/д или Ривароксабан 20 мг 1 р/д) (Class IIa).';
    } else {
      recommendation = 'ВЫСОКИЙ риск инсульта! Настоятельно показана длительная терапия прямыми оральными антикоагулянтами (ПОАК: Эликвис, Ксарелто, Прадакса) (Class I, Level A).';
    }

    return {
      score,
      recommendation,
      guideline: 'ESC Guidelines for the management of Atrial Fibrillation 2024'
    };
  }

  // Glasgow Coma Scale (GCS)
  calculateGCS(eye, verbal, motor) {
    const e = Number(eye) || 4;
    const v = Number(verbal) || 5;
    const m = Number(motor) || 6;
    const score = e + v + m;

    let status = '';
    let action = '';

    if (score === 15) {
      status = 'Ясное сознание';
      action = 'Угнетения сознания нет.';
    } else if (score >= 13) {
      status = 'Умеренное оглушение';
      action = 'Динамический контроль неврологического статуса каждые 2 часа.';
    } else if (score >= 11) {
      status = 'Глубокое оглушение';
      action = 'Срочный осмотр невролога/нейрохирурга, КТ головного мозга.';
    } else if (score >= 9) {
      status = 'Сопор';
      action = 'Высокий риск утраты защитных рефлексов. Вызов реаниматолога, готовность к интубации трахеи.';
    } else {
      status = 'Кома (GCS ≤ 8)';
      action = '🚨 Немедленный перевод в ОРИТ! Критическое состояние, интубация трахеи и перевод на ИВЛ (правило: GCS ≤ 8 — интубируй!).';
    }

    return {
      score,
      status,
      action,
      details: `E${e}V${v}M${m}`,
      guideline: 'Teasdale G, Jennett B. Lancet / Advanced Trauma Life Support (ATLS)'
    };
  }

  // --- 2. LABORATORY EVALUATOR ---
  evaluateLabs(inputVals) {
    const findings = [];
    const triggeredSyndromes = [];

    // Helper checks
    const val = (id) => (inputVals[id] !== undefined && inputVals[id] !== '' ? Number(inputVals[id]) : null);

    const wbc = val('wbc');
    const band = val('band');
    const crp = val('crp');
    const amylase = val('amylase');
    const troponin = val('troponin');
    const ddimer = val('ddimer');
    const glucose = val('glucose');
    const potassium = val('potassium');
    const creatinine = val('creatinine');
    const hb = val('hb');

    if (wbc !== null && wbc > 9.0) findings.push(`Лейкоцитоз (${wbc} ×10⁹/л)`);
    if (wbc !== null && wbc < 4.0) findings.push(`Лейкопения (${wbc} ×10⁹/л)`);
    if (band !== null && band > 6) findings.push(`Палочкоядерный сдвиг влево (${band}%)`);
    if (crp !== null && crp > 5.0) findings.push(`Повышение СРБ (${crp} мг/л)`);
    if (amylase !== null && amylase > 100) findings.push(`Гиперамилаземия (${amylase} Ед/л)`);
    if (troponin !== null && troponin >= 0.04) findings.push(`Положительный высокочувствительный тропонин (${troponin} нг/мл)`);
    if (ddimer !== null && ddimer > 0.50) findings.push(`Повышенный Д-димер (${ddimer} мкг/мл FEU)`);
    if (glucose !== null && glucose < 3.5) findings.push(`Опасная гипогликемия (${glucose} ммоль/л)`);
    if (glucose !== null && glucose > 6.1) {
      findings.push(glucose > 11.1 ? `Выраженная гипергликемия (${glucose} ммоль/л) — риск ДКА/ГГС` : `Гипергликемия (${glucose} ммоль/л)`);
    }
    if (potassium !== null && potassium > 5.1) {
      findings.push(potassium > 5.5 ? `Тяжелая гиперкалиемия (${potassium} ммоль/л) — угроза асистолии` : `Гиперкалиемия (${potassium} ммоль/л)`);
    }
    if (potassium !== null && potassium < 3.5) findings.push(`Гипокалиемия (${potassium} ммоль/л)`);
    if (creatinine !== null && creatinine > 115) findings.push(`Азотемия / гиперкреатининемия (${creatinine} мкмоль/л)`);
    if (hb !== null && hb < 120) {
      findings.push(hb < 70 ? `Тяжелая анемия (${hb} г/л) — показания к гемотрансфузии` : `Анемический синдром (Hb ${hb} г/л)`);
    }

    // Check syndromes
    this.labSyndromes.forEach(s => {
      let match = false;
      if (s.id === 'bacterial_infection' && ((wbc && wbc > 10.0) || (band && band > 6) || (crp && crp > 10.0))) match = true;
      if (s.id === 'acute_pancreatitis' && (amylase && amylase > 150)) match = true;
      if (s.id === 'myocardial_injury' && (troponin && troponin >= 0.04)) match = true;
      if (s.id === 'thrombosis_risk' && (ddimer && ddimer > 0.50)) match = true;
      if (s.id === 'hypoglycemia' && (glucose && glucose < 3.5)) match = true;
      if (s.id === 'hyperkalemia' && (potassium && potassium > 5.5)) match = true;

      if (match) triggeredSyndromes.push(s);
    });

    return {
      findings,
      syndromes: triggeredSyndromes
    };
  }

  // --- 3. DRUG INTERACTIONS CHECKER ---
  checkDrugInteractions(drugList) {
    if (!Array.isArray(drugList) || drugList.length < 2) return [];

    const lowerList = drugList.map(d => d.toLowerCase().trim()).filter(Boolean);
    const alerts = [];

    for (const rule of this.interactions) {
      let group1Matched = false;
      let group2Matched = false;

      const g1Aliases = rule.aliases[0];
      const g2Aliases = rule.aliases[1];

      for (const userDrug of lowerList) {
        if (g1Aliases.some(a => userDrug.includes(a))) group1Matched = true;
        if (g2Aliases.some(a => userDrug.includes(a))) group2Matched = true;
      }

      if (group1Matched && group2Matched) {
        alerts.push(rule);
      }
    }

    return alerts;
  }

  // --- 4. ICD-10 SEARCH ---
  searchICD10(query) {
    if (!query) return this.icd10Codes.slice(0, 10);
    const q = query.toLowerCase().trim();
    return this.icd10Codes.filter(item => 
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.search && item.search.toLowerCase().includes(q))
    );
  }

  // --- 5. SOAP PROTOCOL GENERATOR FOR MIS / DAMUMED ---
  generateSOAPNote({ patientAge, patientGender, complaints, anamnesis, vitals, diagnosis, plan, routing }) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU');
    const timeStr = now.toLocaleTimeString('ru-RU');

    return `ПЕРВИЧНЫЙ ОСМОТР ВРАЧА ПРИЕМНОГО ОТДЕЛЕНИЯ / ТЕРАПЕВТА
Дата и время осмотра: ${dateStr} ${timeStr}
Пациент: ${patientAge ? `${patientAge} лет` : 'Возраст не указан'}, Пол: ${patientGender === 'female' ? 'Женский' : 'Мужской'}
─────────────────────────────────────────────────────────────
S (СУБЪЕКТИВНО / Жалобы):
${complaints || 'Жалобы активно не предъявляет / со слов сопровождающих.'}

Анамнез заболевания (Anamnesis morbi):
${anamnesis || 'Считает себя больным в течение последних часов/суток. Доставлен бригадой СМП / обратился самостоятельно.'}

O (ОБЪЕКТИВНЫЙ СТАТУС / Status Praesens):
- Общее состояние: ${vitals?.generalCondition || 'Удовлетворительное / средней степени тяжести'}
- Сознание: ${vitals?.gcs ? `Шкала Глазго ${vitals.gcs} баллов` : 'Ясное, контактен'}
- АД: ${vitals?.bp || '120/80'} мм рт.ст., ЧСС/Пульс: ${vitals?.pulse || '76'} уд/мин, ритмичный
- Сатурация SpO2: ${vitals?.spo2 || '98'}% на воздухе, ЧДД: ${vitals?.rr || '16'} в мин
- Аускультация легких: ${vitals?.lungs || 'Дыхание везикулярное, хрипов нет'}
- Тоны сердца: ${vitals?.heart || 'Тоны сердца ритмичные, шумов нет'}
- Живот: ${vitals?.abdomen || 'Мягкий, безболезненный при пальпации во всех отделах. Симптомы раздражения брюшины (Щеткина-Блюмберга) отрицательные.'}
- Диурез: ${vitals?.diuresis || 'Сохранен, безболезненный'}

A (ОЦЕНКА И ПРЕДВАРИТЕЛЬНЫЙ ДИАГНОЗ):
Основной диагноз: ${diagnosis?.name || 'Диагноз уточняется'}
Код по МКБ-10: ${diagnosis?.code || 'Не указан'}
Осложнения: ${diagnosis?.complications || 'Без острых осложнений на момент осмотра'}

P (ПЛАН ОБСЛЕДОВАНИЯ И НЕОТЛОЖНОЙ ТЕРАПИИ):
1. Диагностика: ${plan?.diagnostics || 'ОАК, ОАМ, биохимия крови, ЭКГ в 12 отведениях'}
2. Неотложные назначения: ${plan?.medications || 'Режим палатный, наблюдение'}
3. Маршрутизация: ${routing || 'Госпитализация в профильное отделение / амбулаторное лечение под наблюдением участкового ВОП'}

Врач приемного отделения: ____________________ (подпись)
─────────────────────────────────────────────────────────────
Сформировано в модуле клинического ассистента EBM для МИС / КМИС / Дамумед`;
  }
}

window.medicalSkillsEngine = new MedicalSkillsEngine();
