#!/bin/bash

echo "=== 轴承销售系统启动脚本 ==="

cd "$(dirname "$0")"

if [ ! -f "backend/.env" ]; then
  echo "错误: backend/.env 文件不存在"
  echo "请复制 backend/.env.example 为 backend/.env 并配置"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "错误: .env 文件不存在"
  echo "请复制 .env.example 为 .env 并配置"
  exit 1
fi

echo "检查后端依赖..."
cd backend
if [ ! -d "node_modules" ]; then
  echo "安装后端依赖..."
  npm install
fi

if [ ! -f "bearings.db" ]; then
  echo "初始化数据库..."
  npm run init-db
fi

echo "启动后端服务..."
npm start &
BACKEND_PID=$!

cd ..

echo "检查前端依赖..."
if [ ! -d "node_modules" ]; then
  echo "安装前端依赖..."
  npm install
fi

echo "启动前端服务..."
npm start &
FRONTEND_PID=$!

echo ""
echo "=== 服务启动成功 ==="
echo "后端服务: http://localhost:3001"
echo "前端服务: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务"

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

wait
