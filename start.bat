@echo off
cd /d "%~dp0"

:: Kill only our previously saved server PID, not ALL node processes
if exist server.pid (
    set /p OLD_PID=<server.pid
    taskkill /F /PID %OLD_PID% >nul 2>&1
    del server.pid
)

:: Start the server and save its PID
start /B node.exe server.js
:: Small wait so the server can bind to the port before the browser opens
timeout /t 2 /nobreak >nul

:: Save the PID of the node process we just started
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr "PID:"') do (
    echo %%i > server.pid
    goto :done
)
:done

start http://localhost:3000
