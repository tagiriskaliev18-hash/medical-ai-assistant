import uvicorn
import sys
import os

if __name__ == "__main__":
    import io
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    url = f"http://{host}:{port}"

    print("=" * 68)
    print("  [MED] ПОДРУЧНЫЙ ДОКТОР | Evidence-Based Medical AI")
    print(f"  [RUN] Сервер запущен по адресу: {url}")
    print("  [MIC] Web Speech API (распознавание русской речи в реальном времени)")
    print("  [EBM] Движок доказательной медицины (ВОЗ, ERC 2021, AHA)")
    print("  [PWA] Офлайн-режим и памятка для бригад скорой помощи (103 / 112)")
    print("=" * 68)

    try:
        uvicorn.run("backend.app.main:app", host=host, port=port, reload=False)
    except KeyboardInterrupt:
        print("\nОстановка сервера.")
