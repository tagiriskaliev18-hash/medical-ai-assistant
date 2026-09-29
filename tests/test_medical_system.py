import unittest
import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class TestMedicalAI(unittest.TestCase):

    def setUp(self):
        self.frontend_dir = BASE_DIR / "frontend"
        self.data_dir = self.frontend_dir / "assets" / "data"
        self.svg_dir = self.frontend_dir / "assets" / "svg"

    def test_frontend_structure(self):
        """Verify all critical frontend files exist"""
        required_files = [
            "index.html",
            "manifest.webmanifest",
            "sw.js",
            "css/styles.css",
            "js/clinical_engine.js",
            "js/llm_client.js",
            "js/metronome.js",
            "js/procedures.js",
            "js/speech.js",
            "js/tts.js",
            "js/medical_skills.js",
            "js/app.js"
        ]
        for rel_path in required_files:
            file_path = self.frontend_dir / rel_path
            self.assertTrue(file_path.exists(), f"Missing file: {rel_path}")
            self.assertGreater(file_path.stat().st_size, 0, f"Empty file: {rel_path}")

    def test_no_null_bytes_or_encoding_corruption(self):
        """Check all JS files for null bytes (corruption)"""
        js_dir = self.frontend_dir / "js"
        for js_file in js_dir.glob("*.js"):
            data = js_file.read_bytes()
            self.assertNotIn(b"\x00", data, f"Found null bytes in {js_file.name}")
            # Ensure file is valid UTF-8
            text = data.decode("utf-8")
            self.assertNotIn("w i n d o w", text, f"Found spaced encoding artifact in {js_file.name}")

    def test_json_knowledge_integrity(self):
        """Verify clinical databases are valid JSON and contain expected keys"""
        rf_path = self.data_dir / "red_flags.json"
        p_path = self.data_dir / "clinical_protocols.json"
        proc_path = self.data_dir / "procedures.json"

        with open(rf_path, "r", encoding="utf-8") as f:
            rf_data = json.load(f)
            self.assertIn("red_flags", rf_data)
            self.assertGreater(len(rf_data["red_flags"]), 0)

        with open(p_path, "r", encoding="utf-8") as f:
            p_data = json.load(f)
            self.assertIn("categories", p_data)
            self.assertGreater(len(p_data["categories"]), 0)

        with open(proc_path, "r", encoding="utf-8") as f:
            proc_data = json.load(f)
            self.assertIn("procedures", proc_data)
            self.assertEqual(len(proc_data["procedures"]), 10)

    def test_all_procedure_svgs_exist(self):
        """Ensure every procedure references an existing non-empty SVG"""
        proc_path = self.data_dir / "procedures.json"
        with open(proc_path, "r", encoding="utf-8") as f:
            proc_data = json.load(f)

        for p in proc_data["procedures"]:
            svg_file = self.svg_dir / p["svg_icon"]
            self.assertTrue(svg_file.exists(), f"SVG missing: {p['svg_icon']} for procedure {p['id']}")
            self.assertGreater(svg_file.stat().st_size, 200, f"SVG file too small/empty: {p['svg_icon']}")

    def test_red_flag_scanner(self):
        """Test backend red flag scanner detects life threats"""
        from backend.app.services.red_flags import red_flag_scanner

        golden_cases = [
            ("Человек потерял сознание и не дышит", "cpr"),
            ("У мужчины перекосило лицо и пропала речь", "fast_stroke"),
            ("Обильное пульсирующее кровотечение из бедра", "bleeding"),
            ("Ребенок подавился конфетой и задыхается", "heimlich"),
            ("Жгучая боль за грудиной отдает в левую руку и под лопатку", None), # Heart attack
            ("Отекли губы и язык после укуса осы, тяжело дышать", "anaphylaxis"),
        ]

        for text, expected_proc in golden_cases:
            match = red_flag_scanner.scan(text)
            self.assertIsNotNone(match, f"Failed to detect red flag for: '{text}'")
            self.assertTrue(match["detected"])
            if expected_proc:
                self.assertEqual(match.get("procedure_id"), expected_proc, f"Wrong procedure for: '{text}'")

    def test_backend_endpoints(self):
        """Test FastAPI endpoints with TestClient"""
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)
        
        # 1. Health check
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "healthy")

        # 2. Procedures endpoint
        res = client.get("/api/procedures")
        self.assertEqual(res.status_code, 200)
        procedures = res.json()
        self.assertEqual(len(procedures), 10)

        # 3. Triage instant endpoint
        res = client.post("/api/triage/instant", json={"query": "Человек без сознания не дышит"})
        self.assertEqual(res.status_code, 200)
        triage_data = res.json()
        self.assertTrue(triage_data["emergency"])
        self.assertEqual(triage_data["severity"], "CRITICAL")

        # 4. Static frontend serves index
        res = client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("ИИ Доктор", res.text)

    def test_new_clinical_databases_integrity(self):
        """Verify all medical skills JSON databases are present and valid"""
        skill_files = [
            ("calculators.json", ["calculators"]),
            ("emergency_drugs.json", ["drugs"]),
            ("lab_reference.json", ["lab_categories", "syndromes"]),
            ("drug_interactions.json", ["interactions"]),
            ("icd10.json", ["codes"])
        ]
        for fname, expected_keys in skill_files:
            file_path = self.data_dir / fname
            self.assertTrue(file_path.exists(), f"Missing clinical DB: {fname}")
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for k in expected_keys:
                    self.assertIn(k, data, f"Key '{k}' missing from {fname}")

    def test_deterministic_clinical_calculators(self):
        """Verify deterministic mathematical calculation of KDIGO CKD-EPI, CURB-65, CHA2DS2-VASc, and GCS"""
        from backend.app.services.medical_skills import medical_skills_engine

        # 1. CKD-EPI 2021 Race-Free
        # Male 55yo, Cr 85 umol/L (0.96 mg/dL) -> Expected eGFR ~93 ml/min/1.73m²
        res_m55 = medical_skills_engine.calculate_ckd_epi("male", 55, 85)
        self.assertAlmostEqual(res_m55["egfr"], 93, delta=2)
        self.assertEqual(res_m55["stage"], "G1")

        # Female 65yo, Cr 150 umol/L (1.70 mg/dL) -> Expected eGFR ~34 ml/min/1.73m²
        res_f65 = medical_skills_engine.calculate_ckd_epi("female", 65, 150)
        self.assertAlmostEqual(res_f65["egfr"], 34, delta=2)
        self.assertEqual(res_f65["stage"], "G3b")

        # 2. CURB-65
        # C + R + Age65 = 3 points (Severe pneumonia, ICU consideration)
        res_curb = medical_skills_engine.calculate_curb65(confusion=True, urea=False, rr=True, bp=False, age65=True)
        self.assertEqual(res_curb["score"], 3)
        self.assertIn("Тяжелая", res_curb["risk_group"])

        # 3. CHA2DS2-VASc
        # CHF (1) + HTN (1) + Age75 (2) + Stroke (2) = 6 points
        res_cha = medical_skills_engine.calculate_cha2ds2_vasc(
            chf=True, htn=True, age75=True, dm=False, stroke=True, vasc=False, age65_74=False, female=False
        )
        self.assertEqual(res_cha["score"], 6)
        self.assertIn("Антикоагулянты показаны", res_cha["recommendation"])

        # 4. GCS (Glasgow Coma Scale)
        res_gcs_norm = medical_skills_engine.calculate_gcs(4, 5, 6)
        self.assertEqual(res_gcs_norm["score"], 15)
        self.assertIn("Ясное", res_gcs_norm["status"])

        res_gcs_coma = medical_skills_engine.calculate_gcs(2, 2, 3) # E2, V2, M3 = 7
        self.assertEqual(res_gcs_coma["score"], 7)
        self.assertIn("Кома", res_gcs_coma["status"])
        self.assertIn("интубаци", res_gcs_coma["action"].lower())

    def test_drug_interaction_screening(self):
        """Test DDI checker finds fatal combinations"""
        from backend.app.services.medical_skills import medical_skills_engine

        # Severe hyperkalemia: Captopril + Spironolactone
        ddi1 = medical_skills_engine.check_drug_interactions(["каптоприл", "верошпирон"])
        self.assertGreater(len(ddi1), 0)
        self.assertIn(ddi1[0]["severity"], ["WARNING", "CRITICAL"])
        self.assertIn("гиперкалием", ddi1[0]["risk"].lower())

        # Bleeding: Ketorolac + Xarelto
        ddi2 = medical_skills_engine.check_drug_interactions(["кеторолак", "ксарелто"])
        self.assertGreater(len(ddi2), 0)
        self.assertIn("кровотечен", ddi2[0]["risk"].lower())

        # Nitrate + PDE5i
        ddi3 = medical_skills_engine.check_drug_interactions(["нитроглицерин", "силденафил"])
        self.assertGreater(len(ddi3), 0)
        self.assertTrue(any(w in ddi3[0]["risk"].lower() for w in ["падение ад", "коллапс", "гипотензи"]))

        # Safe pair: Paracetamol + Omeprazole
        ddi_safe = medical_skills_engine.check_drug_interactions(["парацетамол", "омепразол"])
        self.assertEqual(len(ddi_safe), 0)

    def test_laboratory_syndrome_evaluator(self):
        """Test detection of acute syndromes based on emergency labs"""
        from backend.app.services.medical_skills import medical_skills_engine

        # Cardiac troponin elevation
        eval_cardiac = medical_skills_engine.evaluate_labs({"troponin": 0.85})
        syndrome_titles = [s["title"] for s in eval_cardiac["syndromes"]]
        self.assertTrue(any("коронарн" in t.lower() or "окс" in t.lower() or "некроз" in t.lower() for t in syndrome_titles))

        # D-dimer elevation
        eval_pe = medical_skills_engine.evaluate_labs({"ddimer": 3.2})
        syndrome_titles = [s["title"] for s in eval_pe["syndromes"]]
        self.assertTrue(any("тромбоэмбол" in t.lower() or "тэла" in t.lower() for t in syndrome_titles))

        # Amylase 500 (Pancreatitis)
        eval_panc = medical_skills_engine.evaluate_labs({"amylase": 500})
        syndrome_titles = [s["title"] for s in eval_panc["syndromes"]]
        self.assertTrue(any("панкреатит" in t.lower() for t in syndrome_titles))

    def test_fastapi_medical_skills_endpoints(self):
        """Test API endpoints for calculators and skills"""
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)

        # 1. CKD calculation endpoint
        res = client.post("/api/skills/calc/ckd-epi", json={"gender": "male", "age": 50, "creatinine_umol_l": 90})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("egfr", data)
        self.assertEqual(data["stage"], "G1")

        # Test validation error when creatinine is omitted
        res_err = client.post("/api/skills/calc/ckd-epi", json={"gender": "male", "age": 50})
        self.assertEqual(res_err.status_code, 422)

        # Test secured chat config endpoint (no sensitive key/base_url leakage)
        res_cfg = client.get("/api/chat/config")
        self.assertEqual(res_cfg.status_code, 200)
        self.assertNotIn("api_key", res_cfg.json())
        self.assertNotIn("base_url", res_cfg.json())

        # 2. CURB-65 endpoint
        res = client.post("/api/skills/calc/curb-65", json={"confusion": True, "urea_high": False, "rr_high": True, "bp_low": False, "age_65": False})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["score"], 2)

        # 3. DDI check endpoint
        res = client.post("/api/skills/drugs/ddi", json={"drugs": ["бисопролол", "верапамил"]})
        self.assertEqual(res.status_code, 200)
        self.assertGreater(len(res.json()["alerts"]), 0)

        # 4. Emergency drugs list endpoint
        res = client.get("/api/skills/drugs/emergency")
        self.assertEqual(res.status_code, 200)
        drugs = res.json()
        self.assertGreaterEqual(len(drugs), 8)

        # 5. SOAP generation endpoint
        soap_req = {
            "patient_age": 60,
            "patient_gender": "мужской",
            "complaints": "Давящая боль за грудиной",
            "anamnesis": "ИМ в анамнезе 2 года назад",
            "vitals": {"bp": "150/90", "pulse": "80", "spo2": "97"},
            "diagnosis": {"name": "ОКС без подъема ST", "code": "I20.0"},
            "plan": {"diagnostics": "ЭКГ, Тропонин", "medications": "Аспирин + Клопидогрел"},
            "routing": "ОРИТ"
        }
        res = client.post("/api/skills/notes/soap", json=soap_req)
        self.assertEqual(res.status_code, 200)
        self.assertIn("SOAP", res.json()["soap_text"])
        self.assertIn("I20.0", res.json()["soap_text"])

if __name__ == "__main__":
    unittest.main()

