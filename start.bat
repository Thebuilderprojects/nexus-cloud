cd /d "%~dp0"
:: This line forcefully assassinates any ghost servers before starting the new one!
taskkill /F /IM node.exe /T >nul 2>&1
start http://localhost:3000
node.exe server.js