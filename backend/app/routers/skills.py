from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from ..services.medical_skills import backend_skills

router = APIRouter(prefix="/api/skills", tags=["skills"])

class CKDRequest(BaseModel):
    gender: str = Field(..., description="'male' or 'female'")
    age: float = Field(..., ge=18, le=110, description="Возраст пациента (лет)")
    creatinine_umol_l: Optional[float] = Field(None, ge=20, le=1500, description="Креатинин сыворотки в мкмоль/л")
    creatinine: Optional[float] = Field(None, ge=20, le=1500, description="Псевдоним для creatinine_umol_l")

class CURBRequest(BaseModel):
    confusion: bool = Field(False, description="C - Дезориентация / спутанность сознания")
    urea_high: bool = Field(False, description="U - Мочевина крови > 7 ммоль/л")
    rr_high: bool = Field(False, description="R - ЧДД >= 30 в мин")
    bp_low: bool = Field(False, description="B - САД < 90 или ДАД <= 60 мм рт. ст.")
    age_65: bool = Field(False, description="65 - Возраст >= 65 лет")
    # Compatibility aliases
    urea: Optional[bool] = None
    rr: Optional[bool] = None
    bp: Optional[bool] = None
    age65: Optional[bool] = None

class CHARequest(BaseModel):
    chf: bool = False
    htn: bool = False
    age75: bool = False
    dm: bool = False
    stroke: bool = False
    vasc: bool = False
    age65_74: bool = False
    female: bool = False

class GCSRequest(BaseModel):
    eye: int = Field(4, ge=1, le=4)
    verbal: int = Field(5, ge=1, le=5)
    motor: int = Field(6, ge=1, le=6)

class DDIRequest(BaseModel):
    drugs: List[str]

class LabsRequest(BaseModel):
    wbc: Optional[float] = None
    band: Optional[float] = None
    crp: Optional[float] = None
    amylase: Optional[float] = None
    troponin: Optional[float] = None
    ddimer: Optional[float] = None
    glucose: Optional[float] = None
    potassium: Optional[float] = None
    creatinine: Optional[float] = None
    hb: Optional[float] = None

class SOAPRequest(BaseModel):
    patient_age: Optional[Any] = "не указан"
    patient_gender: Optional[str] = "не указан"
    complaints: Optional[str] = ""
    anamnesis: Optional[str] = ""
    vitals: Optional[Dict[str, Any]] = {}
    diagnosis: Optional[Dict[str, Any]] = {}
    plan: Optional[Dict[str, Any]] = {}
    routing: Optional[str] = "Наблюдение"

@router.get("")
async def list_skills():
    return {
        "calculators": backend_skills.calculators,
        "emergency_drugs": backend_skills.emergency_drugs,
        "lab_categories": backend_skills.lab_categories,
        "icd10_sample": backend_skills.icd10_codes[:10]
    }

# CKD-EPI (supports both /calc/ckd-epi and /calculate/ckd-epi)
@router.post("/calc/ckd-epi")
@router.post("/calculate/ckd-epi")
async def calculate_ckd(req: CKDRequest):
    cr = req.creatinine_umol_l if req.creatinine_umol_l is not None else req.creatinine
    if cr is None:
        raise HTTPException(
            status_code=422,
            detail="Необходимо явно указать уровень креатинина сыворотки в мкмоль/л (поле 'creatinine_umol_l')."
        )
    return backend_skills.calculate_ckd_epi(req.gender, req.age, cr)

# CURB-65 (supports both /calc/curb-65 and /calculate/curb-65)
@router.post("/calc/curb-65")
@router.post("/calculate/curb-65")
async def calculate_curb(req: CURBRequest):
    u = req.urea_high or bool(req.urea)
    r = req.rr_high or bool(req.rr)
    b = req.bp_low or bool(req.bp)
    a = req.age_65 or bool(req.age65)
    return backend_skills.calculate_curb65(
        req.confusion,
        u,
        r,
        b,
        a
    )

# CHA2DS2-VASc
@router.post("/calc/cha2ds2-vasc")
async def calculate_cha(req: CHARequest):
    return backend_skills.calculate_cha2ds2_vasc(
        chf=req.chf,
        htn=req.htn,
        age75=req.age75,
        dm=req.dm,
        stroke=req.stroke,
        vasc=req.vasc,
        age65_74=req.age65_74,
        female=req.female
    )

# GCS
@router.post("/calc/gcs")
async def calculate_gcs(req: GCSRequest):
    return backend_skills.calculate_gcs(req.eye, req.verbal, req.motor)

# DDI Checker (supports both /drugs/ddi and /interactions)
@router.post("/drugs/ddi")
@router.post("/interactions")
async def check_interactions(req: DDIRequest):
    alerts = backend_skills.check_drug_interactions(req.drugs)
    return {"alerts": alerts, "count": len(alerts)}

# Emergency Drugs
@router.get("/drugs/emergency")
async def get_emergency_drugs():
    return backend_skills.emergency_drugs

# Labs Evaluation
@router.post("/labs/evaluate")
async def evaluate_labs(req: LabsRequest):
    return backend_skills.evaluate_labs(req.model_dump())

# SOAP Note Generation
@router.post("/notes/soap")
async def generate_soap(req: SOAPRequest):
    note_text = backend_skills.generate_soap_note(req.model_dump())
    return {"soap_text": note_text}
