import uvicorn
import webbrowser
import sys
import os

if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    url = f"http://{host}:{port}"

    print("=" * 65)
    print("  🩺 ПОДРУЧНЫЙ ДОКТОР | Evidence-Based Medical AI")
    print(f"  🚀 Сервер запускается по адресу: {url}")
    print("  🎙️ Поддерживается голосовой ввод через микрофон")
    print("  ⚡ Быстрый стриминг ответа + протоколы доказательной медицины")
    print("=" * 65)

    try:
        uvicorn.run("backend.app.main:app", host=host, port=port, reload=True)
    except KeyboardInterrupt:
        print("\nОстановка сервера.")
