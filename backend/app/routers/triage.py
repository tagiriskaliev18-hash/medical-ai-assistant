from fastapi import APIRouter
from pydantic import BaseModel
from ..services.red_flags import red_flag_scanner
from ..services.ebm_engine import ebm_engine

router = APIRouter(prefix="/api/triage", tags=["triage"])

class TriageRequest(BaseModel):
    query: str

@router.post("/instant")
async def instant_triage(req: TriageRequest):
    """
    Sub-millisecond emergency pre-triage scan for red-flags.
    """
    red_flag = red_flag_scanner.scan(req.query)
    relevant_guidelines = ebm_engine.find_relevant_guidelines(req.query)

    is_emergency = bool(red_flag and red_flag.get("detected"))
    severity = "CRITICAL" if is_emergency else ("URGENT" if relevant_guidelines and relevant_guidelines[0].get("triage") == "URGENT" else "ROUTINE")

    return {
        "emergency": is_emergency,
        "severity": severity,
        "red_flag": red_flag,
        "guidelines": relevant_guidelines[:3]
    }
