import uvicorn
import webbrowser
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

    print("=" * 65)
    print("  [MED] ПОДРУЧНЫЙ ДОКТОР | Evidence-Based Medical AI")
    print(f"  [RUN] Сервер запускается по адресу: {url}")
    print("  [MIC] Поддерживается голосовой ввод через микрофон")
    print("  [SSE] Быстрый стриминг ответа + протоколы доказательной медицины")
    print("=" * 65)

    try:
        uvicorn.run("backend.app.main:app", host=host, port=port, reload=True)
    except KeyboardInterrupt:
        print("\nОстановка сервера.")
