@echo off
chcp 65001 >nul
echo =========================================
echo   轴承销售系统 - 快速安装脚本
echo =========================================
echo.

cd /d "%~dp0"

echo [1/6] 检查 Node.js 环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo √ Node.js 版本: %NODE_VERSION%

echo.
echo [2/6] 安装后端依赖...
cd backend
if not exist "package.json" (
    echo 错误: backend\package.json 不存在
    pause
    exit /b 1
)
call npm install
if %errorlevel% neq 0 (
    echo 错误: 后端依赖安装失败
    pause
    exit /b 1
)
echo √ 后端依赖安装完成

echo.
echo [3/6] 配置后端环境...
if not exist ".env" (
    copy .env.example .env >nul
    echo √ 已创建 backend\.env 配置文件
) else (
    echo √ backend\.env 已存在
)

echo.
echo [4/6] 初始化数据库...
call npm run init-db
if %errorlevel% neq 0 (
    echo 错误: 数据库初始化失败
    pause
    exit /b 1
)
echo √ 数据库初始化完成

cd ..

echo.
echo [5/6] 安装前端依赖...
call npm install
if %errorlevel% neq 0 (
    echo 错误: 前端依赖安装失败
    pause
    exit /b 1
)
echo √ 前端依赖安装完成

echo.
echo [6/6] 配置前端环境...
if not exist ".env" (
    copy .env.example .env >nul
    echo √ 已创建 .env 配置文件
) else (
    echo √ .env 已存在
)

echo.
echo =========================================
echo   安装完成！
echo =========================================
echo.
echo 开发环境启动命令:
echo   start.bat
echo.
echo 访问地址:
echo   前端商城: http://localhost:3000
echo   后端API:  http://localhost:3001
echo   管理后台: http://localhost:3001/admin.html
echo.
echo 详细文档请查看:
echo   README.md - 项目说明
echo   DEPLOYMENT.md - 部署文档
echo.
pause
