from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import json
from ..services.llm_service import llm_service

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []

class ConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

@router.post("/stream")
async def chat_stream(req: ChatRequest):
    history_dicts = [{"role": m.role, "content": m.content} for m in req.history] if req.history else []
    
    async def event_generator():
        async for token in llm_service.stream_chat(req.message, history_dicts):
            # Format as Server-Sent Event
            data = json.dumps({"token": token}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/config")
async def get_config():
    masked_key = ""
    if llm_service.api_key:
        masked_key = llm_service.api_key[:6] + "..." + llm_service.api_key[-4:]
    return {
        "base_url": llm_service.base_url,
        "model": llm_service.model,
        "api_key_masked": masked_key
    }

@router.post("/config")
async def update_config(update: ConfigUpdate):
    llm_service.update_config(
        api_key=update.api_key,
        base_url=update.base_url,
        model=update.model
    )
    return {"status": "ok", "message": "Конфигурация модели обновлена"}
