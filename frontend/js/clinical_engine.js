// Clinical Engine (EBM & Red Flags) - 100% Client-Side
class ClinicalEngine {
  constructor() {
    this.redFlags = [];
    this.protocols = [];
    this.procedures = [];
    this.proceduresMap = {};
    this.loaded = false;
  }

  async loadData() {
    if (this.loaded) return;
    try {
      const [rfRes, pRes, procRes] = await Promise.all([
        fetch('/assets/data/red_flags.json'),
        fetch('/assets/data/clinical_protocols.json'),
        fetch('/assets/data/procedures.json')
      ]);
      
      const rfData = await rfRes.json();
      this.redFlags = rfData.red_flags || [];
      
      const pData = await pRes.json();
      this.protocols = pData.categories || [];
      
      const procData = await procRes.json();
      this.procedures = procData.procedures || [];
      this.procedures.forEach(p => this.proceduresMap[p.id] = p);
      
      this.loaded = true;
      console.log('Клиническая база успешно загружена.');
    } catch (e) {
      console.error('Ошибка загрузки клинической базы', e);
    }
  }

  scanRedFlags(query) {
    if (!query) return null;
    const cleanQuery = query.toLowerCase();
    
    for (const flag of this.redFlags) {
      for (const kw of flag.keywords) {
        // simple word boundary match
        const regex = new RegExp(`(?:\\b|\\s|^)${kw.toLowerCase()}(?:\\b|\\s|$)`, 'i');
        if (regex.test(cleanQuery) || cleanQuery.includes(kw.toLowerCase())) {
          return {
            detected: true,
            id: flag.id,
            title: flag.title,
            action: flag.action,
            procedure_id: flag.procedure_id,
            severity: flag.severity || 'CRITICAL',
            guideline: flag.guideline
          };
        }
      }
    }
    return null;
  }

  findGuidelines(query) {
    const qLower = query.toLowerCase();
    let matches = [];
    
    for (const cat of this.protocols) {
      for (const cond of cat.conditions) {
        const hasMatch = cond.symptoms.some(s => 
          qLower.includes(s.toLowerCase()) || 
          s.toLowerCase().split(' ').some(word => word.length > 3 && qLower.includes(word))
        );
        if (hasMatch || qLower.includes(cond.name.toLowerCase())) {
          matches.push(cond);
        }
      }
    }
    return matches;
  }
}

window.clinicalEngine = new ClinicalEngine();
