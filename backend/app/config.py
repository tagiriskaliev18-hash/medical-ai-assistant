import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

# LLM Configuration
DEFAULT_KEY = "sk-cvc-14fcd3078026472914eeee63d17063a371ef607aad4c98317f6af669328a1ed5"
LLM_API_KEY = os.getenv("LLM_API_KEY", DEFAULT_KEY)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

# Fallback & Fast providers
FALLBACK_OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")
ENABLE_FAST_FALLBACK = True

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1")
