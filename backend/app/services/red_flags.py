import json
import re
from pathlib import Path
from typing import Dict, Any, Optional

KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent / "knowledge" / "red_flags.json"

class RedFlagDetector:
    def __init__(self):
        self.red_flags = []
        self._load()

    def _load(self):
        try:
            with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.red_flags = data.get("red_flags", [])
        except Exception as e:
            print(f"Error loading red flags: {e}")
            self.red_flags = []

    def scan(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Scans input patient query for life-threatening emergency keywords.
        Returns match metadata if critical red flag is detected, else None.
        Runs in < 2ms.
        """
        if not text:
            return None

        clean_text = text.lower()

        for flag in self.red_flags:
            for kw in flag.get("keywords", []):
                # Search for keyword boundary
                pattern = r"(?:\b|\s|^)" + re.escape(kw.lower()) + r"(?:\b|\s|$)"
                if re.search(pattern, clean_text) or kw.lower() in clean_text:
                    return {
                        "detected": True,
                        "id": flag["id"],
                        "title": flag["title"],
                        "action": flag["action"],
                        "procedure_id": flag.get("procedure_id"),
                        "severity": flag.get("severity", "CRITICAL"),
                        "guideline": flag.get("guideline")
                    }
        return None

# Singleton instance
red_flag_scanner = RedFlagDetector()
