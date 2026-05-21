@echo off
echo === 轴承销售系统启动脚本 ===

cd /d "%~dp0"

if not exist "backend\.env" (
  echo 错误: backend\.env 文件不存在
  echo 请复制 backend\.env.example 为 backend\.env 并配置
  pause
  exit /b 1
)

if not exist ".env" (
  echo 错误: .env 文件不存在
  echo 请复制 .env.example 为 .env 并配置
  pause
  exit /b 1
)

echo 检查后端依赖...
cd backend
if not exist "node_modules" (
  echo 安装后端依赖...
  call npm install
)

if not exist "bearings.db" (
  echo 初始化数据库...
  call npm run init-db
)

echo 启动后端服务...
start "轴承销售后端" cmd /k npm start

cd ..

echo 检查前端依赖...
if not exist "node_modules" (
  echo 安装前端依赖...
  call npm install
)

echo 启动前端服务...
start "轴承销售前端" cmd /k npm start

echo.
echo === 服务启动成功 ===
echo 后端服务: http://localhost:3001
echo 前端服务: http://localhost:3000
echo.
pause
