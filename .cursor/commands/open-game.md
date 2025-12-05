# Open Game

Opens the game in the browser at http://localhost:3434/game with the Fliz player popup window.

Run this PowerShell command to open the game:

```powershell
powershell -Command "Start-Process 'http://localhost:3434/game?popup=true&playerName=%40Fliz%40&windowId=window_1764897074771_a3rhwu0jx'"
```

Or use the script:
```bash
powershell -ExecutionPolicy Bypass -File scripts/open-game.ps1
```

This will automatically open the game URL in your default browser.

