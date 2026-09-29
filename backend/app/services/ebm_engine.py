import json
from pathlib import Path
from typing import List, Dict, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
PRIMARY_DATA_DIR = BASE_DIR / "frontend" / "assets" / "data"
FALLBACK_DATA_DIR = Path(__file__).resolve().parent.parent / "knowledge"

class EBMEngine:
    def __init__(self):
        self.protocols = []
        self.procedures = []
        self.procedures_map = {}
        self._load()

    def _load(self):
        data_dir = PRIMARY_DATA_DIR if PRIMARY_DATA_DIR.exists() else FALLBACK_DATA_DIR
        try:
            p_file = data_dir / "clinical_protocols.json"
            if p_file.exists():
                with open(p_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.protocols = data.get("categories", [])

            proc_file = data_dir / "procedures.json"
            if proc_file.exists():
                with open(proc_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.procedures = data.get("procedures", [])
                    self.procedures_map = {p["id"]: p for p in self.procedures}
        except Exception as e:
            print(f"Error loading EBM knowledge from {data_dir}: {e}")

    def get_all_procedures(self) -> List[Dict[str, Any]]:
        return self.procedures

    def get_procedure(self, proc_id: str) -> Optional[Dict[str, Any]]:
        return self.procedures_map.get(proc_id)

    def find_relevant_guidelines(self, query: str) -> List[Dict[str, Any]]:
        """
        Finds matching evidence-based clinical protocols based on patient query keywords.
        """
        query_lower = query.lower()
        matches = []

        for category in self.protocols:
            for condition in category.get("conditions", []):
                matched_symptoms = [
                    s for s in condition.get("symptoms", []) 
                    if s.lower() in query_lower or any(word in query_lower for word in s.lower().split() if len(word) > 3)
                ]
                if matched_symptoms or condition["name"].lower() in query_lower:
                    matches.append({
                        "name": condition["name"],
                        "triage": condition.get("triage", "ROUTINE"),
                        "evidence_level": condition.get("evidence_level"),
                        "sources": condition.get("sources", []),
                        "action_plan": condition.get("action_plan", []),
                        "contraindicated": condition.get("contraindicated", [])
                    })

        return matches

ebm_engine = EBMEngine()
