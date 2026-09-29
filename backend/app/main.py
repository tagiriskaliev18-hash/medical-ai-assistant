from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .routers.chat import router as chat_router
from .routers.procedures import router as procedures_router
from .routers.triage import router as triage_router

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="Подручный Доктор | Evidence-Based Medical AI",
    description="Интеллектуальная система экстренной и клинической помощи на основе доказательной медицины",
    version="1.0.0"
)

# Enable CORS for local and cross-origin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(chat_router)
app.include_router(procedures_router)
app.include_router(triage_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "medical_assistant_ai"}

# Serve frontend static assets
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
