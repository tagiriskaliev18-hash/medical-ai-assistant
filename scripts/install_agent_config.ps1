# Quick setup script for Antigravity + Claude Bridge on a new machine
param(
    [string]$ToolsDir = "C:\projects\tools"
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Antigravity + Claude Bridge Configuration Setup    " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$geminiConfigDir = Join-Path $env:USERPROFILE ".gemini\config"

Write-Host "[1/4] Preparing directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$geminiConfigDir\rules" -Force | Out-Null
New-Item -ItemType Directory -Path "$geminiConfigDir\skills\context_booster" -Force | Out-Null
New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null

Write-Host "[2/4] Deploying claude_bridge.py..." -ForegroundColor Yellow
$sourceBridge = Join-Path $repoRoot "tools\claude_bridge.py"
$targetBridge = Join-Path $ToolsDir "claude_bridge.py"
Copy-Item $sourceBridge -Destination $targetBridge -Force
Write-Host "  Copied to $targetBridge" -ForegroundColor Green

Write-Host "[3/4] Deploying global Antigravity rules and skills..." -ForegroundColor Yellow
Copy-Item (Join-Path $repoRoot ".gemini-config\GEMINI.md") -Destination "$geminiConfigDir\GEMINI.md" -Force
Copy-Item (Join-Path $repoRoot ".gemini-config\rules\claude_bridge.md") -Destination "$geminiConfigDir\rules\claude_bridge.md" -Force
Copy-Item (Join-Path $repoRoot ".gemini-config\skills\context_booster\SKILL.md") -Destination "$geminiConfigDir\skills\context_booster\SKILL.md" -Force

# Create mcp_config.json with correct escaped path
$escapedToolsPath = ($targetBridge -replace '\\', '\\')
$mcpConfigJson = @"
{
  "mcpServers": {
    "claude-bridge": {
      "command": "python",
      "args": [
        "$escapedToolsPath"
      ]
    }
  }
}
"@
Set-Content -Path "$geminiConfigDir\mcp_config.json" -Value $mcpConfigJson -Encoding utf8
Write-Host "  Updated $geminiConfigDir\mcp_config.json" -ForegroundColor Green

Write-Host "[4/4] Verifying prerequisites..." -ForegroundColor Yellow
$pythonCheck = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCheck) {
    Write-Host "  [OK] Python found: $($pythonCheck.Source)" -ForegroundColor Green
} else {
    Write-Host "  [!] Python not found in PATH. Please install Python and ensure it is in PATH." -ForegroundColor Red
}

$claudePath = "$env:USERPROFILE\.local\bin\claude.exe"
if (Test-Path $claudePath) {
    Write-Host "  [OK] Claude CLI found at $claudePath" -ForegroundColor Green
} else {
    $claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($claudeCmd) {
        Write-Host "  [OK] Claude CLI found in PATH: $($claudeCmd.Source)" -ForegroundColor Green
    } else {
        Write-Host "  [i] Claude CLI not found yet. Install Claude Code (npm i -g @anthropic-ai/claude-code) and run 'claude' once to authenticate." -ForegroundColor Yellow
    }
}

Write-Host "`nSetup completed successfully!" -ForegroundColor Green
Write-Host "Antigravity is configured with parallel decomposition, lazy review (>150 lines), and 8 iteration caps." -ForegroundColor Cyan
