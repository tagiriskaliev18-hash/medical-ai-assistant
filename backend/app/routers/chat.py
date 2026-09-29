from fastapi import APIRouter, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import json
from ..services.llm_service import llm_service

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    history: Optional[List[ChatMessage]] = []
    model: Optional[str] = None
    temperature: Optional[float] = 0.3

@router.post("/stream")
async def chat_stream(req: ChatRequest, x_custom_api_key: Optional[str] = Header(None, alias="X-Custom-API-Key")):
    # Extract last message and history from either format
    user_message = ""
    history_dicts = []

    if req.messages and len(req.messages) > 0:
        # OpenAI format
        user_msgs = [m for m in req.messages if m.role == "user"]
        user_message = user_msgs[-1].content if user_msgs else req.messages[-1].content
        history_dicts = [{"role": m.role, "content": m.content} for m in req.messages[:-1] if m.role != "system"]
    elif req.message:
        user_message = req.message
        history_dicts = [{"role": m.role, "content": m.content} for m in req.history] if req.history else []
    else:
        user_message = "Помощь"

    async def event_generator():
        async for token in llm_service.stream_chat(user_message, history_dicts, custom_api_key=x_custom_api_key):
            chunk = {
                "choices": [{
                    "delta": {"content": token}
                }]
            }
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
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
    """Return safe public configuration status without exposing sensitive server credentials."""
    return {
        "model": llm_service.model,
        "is_configured": bool(llm_service.api_key)
    }
