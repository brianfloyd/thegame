@echo off
REM Startup script to launch development tools
REM Focus will be on Cursor after all applications launch

REM Launch Cursor
start "" "C:\Program Files\cursor\Cursor.exe"

REM Launch Chrome
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe"

REM Launch ChatGPT
start "" "C:\Users\SfdcB\AppData\Local\Microsoft\WindowsApps\chatgpt.exe"

REM Launch DBeaver
REM NOTE: If DBeaver is not found at this path, update the path below
start "" "C:\Users\SfdcB\AppData\Local\DBeaver\dbeaver.exe"

REM Wait 3 seconds for windows to open
timeout /t 3 /nobreak >nul

REM Bring Cursor to the front (focus on Cursor)
REM Using PowerShell to activate the Cursor window
powershell -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('Cursor')"



