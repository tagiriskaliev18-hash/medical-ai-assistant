# Перенос конфигурации Antigravity + Claude Bridge на новое устройство

Этот репозиторий содержит не только исходный код проекта, но и полную конфигурацию мультиагентной связки **Antigravity ↔ Claude Code Bridge** со всеми оптимизациями скорости:
- **Параллельная оркестрация** (`define_subagent` + `invoke_subagent`)
- **Ленивое ревью** (`claude_review` срабатывает только при изменении >3 файлов или >150 строк)
- **Лимит итераций** (`max_iterations = 8`)
- **Сжатие контекста** (до 8,000 токенов на субагента)
- **Навык `context_booster`** (быстрое извлечение зависимостей без долгого сканирования)

---

## Вариант 1: Быстрая автоматическая установка (PowerShell)

1. Склонируйте репозиторий на новом устройстве:
   ```bash
   git clone https://github.com/tagiriskaliev18-hash/medical-ai-assistant.git
   cd medical-ai-assistant
   ```

2. Запустите скрипт установки от имени пользователя:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install_agent_config.ps1
   ```

Скрипт автоматически:
- Создаст нужные папки в `~/.gemini/config/`
- Развернет `GEMINI.md` и правила `claude_bridge.md`
- Установит глобальный навык `context_booster`
- Скопирует мост `tools/claude_bridge.py` в `C:\projects\tools\` и зарегистрирует его в `mcp_config.json`

---

## Вариант 2: Ручная настройка

Если нужно настроить пути вручную:

1. **Правила Antigravity:**
   - Скопируйте `.gemini-config/GEMINI.md` → `~/.gemini/config/GEMINI.md`
   - Скопируйте `.gemini-config/rules/claude_bridge.md` → `~/.gemini/config/rules/claude_bridge.md`
   - Скопируйте `.gemini-config/skills/context_booster/SKILL.md` → `~/.gemini/config/skills/context_booster/SKILL.md`

2. **Мост Claude Code (`claude-bridge`):**
   - Убедитесь, что установлен Claude Code CLI (`npm i -g @anthropic-ai/claude-code`) и выполнена авторизация (`claude`).
   - Поместите `tools/claude_bridge.py` в удобную папку (например, `C:\projects\tools\claude_bridge.py`).
   - Зарегистрируйте сервер в `~/.gemini/config/mcp_config.json`:
     ```json
     {
       "mcpServers": {
         "claude-bridge": {
           "command": "python",
           "args": [
             "C:\\projects\\tools\\claude_bridge.py"
           ]
         }
       }
     }
     ```

3. **Локальный воркспейс:**
   Внутри репозитория уже находятся папки `.agents/rules/` и `.agents/skills/`, поэтому при открытии этой папки в Antigravity локальные правила и навык `context_booster` активируются автоматически без дополнительных действий.
