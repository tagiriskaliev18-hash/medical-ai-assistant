import json
import re
from pathlib import Path
from typing import Dict, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
PRIMARY_DATA_PATH = BASE_DIR / "frontend" / "assets" / "data" / "red_flags.json"
FALLBACK_DATA_PATH = Path(__file__).resolve().parent.parent / "knowledge" / "red_flags.json"

class RedFlagDetector:
    def __init__(self):
        self.red_flags = []
        self._load()

    def _load(self):
        target = PRIMARY_DATA_PATH if PRIMARY_DATA_PATH.exists() else FALLBACK_DATA_PATH
        try:
            if target.exists():
                with open(target, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.red_flags = data.get("red_flags", [])
        except Exception as e:
            print(f"Error loading red flags from {target}: {e}")
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
                kw_clean = kw.lower().strip()
                matched = False
                if " " in kw_clean:
                    # Multi-word phrase matching
                    if kw_clean in clean_text:
                        matched = True
                else:
                    # Single word boundary matching
                    pattern = r"(?:\b|\s|^)" + re.escape(kw_clean) + r"(?:\b|\s|$)"
                    if re.search(pattern, clean_text):
                        matched = True

                if matched:
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

red_flag_scanner = RedFlagDetector()
