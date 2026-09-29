from fastapi import APIRouter, HTTPException
from ..services.ebm_engine import ebm_engine

router = APIRouter(prefix="/api/procedures", tags=["procedures"])

@router.get("")
async def list_procedures():
    """List all available medical manipulation procedures"""
    return ebm_engine.get_all_procedures()

@router.get("/{proc_id}")
async def get_procedure(proc_id: str):
    """Get detailed step-by-step procedure by ID"""
    proc = ebm_engine.get_procedure(proc_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Процедура не найдена")
    return proc
