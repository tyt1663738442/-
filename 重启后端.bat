@echo off
chcp 65001 >nul
echo ========================================
echo   A股监控平台 - 重启脚本
echo ========================================
echo.

:: 终止所有Python进程
echo [1/3] 正在终止现有Python进程...
taskkill /F /IM python.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

:: 等待端口释放
echo [2/3] 等待端口8000释放...
:wait_loop
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)
echo       端口8000已释放

:: 启动后端
echo [3/3] 启动后端服务 (端口8000)...
echo.
cd /d "%~dp0"
start "A股后端" cmd /k "cd backend && python main.py"

echo.
echo ========================================
echo   后端已在端口8000启动
echo   请刷新浏览器查看效果
echo ========================================
pause
