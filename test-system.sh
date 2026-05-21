#!/bin/bash

echo "========================================="
echo "  轴承销售系统 - 系统测试"
echo "========================================="
echo ""

cd "$(dirname "$0")"

echo "[1/5] 检查配置文件..."
if [ ! -f "backend/.env" ]; then
    echo "✗ backend/.env 不存在"
    echo "  请运行: cp backend/.env.example backend/.env"
    exit 1
fi
echo "✓ backend/.env 存在"

if [ ! -f ".env" ]; then
    echo "✗ .env 不存在"
    echo "  请运行: cp .env.example .env"
    exit 1
fi
echo "✓ .env 存在"

echo ""
echo "[2/5] 检查数据库..."
if [ ! -f "backend/bearings.db" ]; then
    echo "✗ 数据库不存在"
    echo "  请运行: cd backend && npm run init-db"
    exit 1
fi
echo "✓ 数据库存在"

echo ""
echo "[3/5] 检查后端依赖..."
if [ ! -d "backend/node_modules" ]; then
    echo "✗ 后端依赖未安装"
    echo "  请运行: cd backend && npm install"
    exit 1
fi
echo "✓ 后端依赖已安装"

echo ""
echo "[4/5] 检查前端依赖..."
if [ ! -d "node_modules" ]; then
    echo "✗ 前端依赖未安装"
    echo "  请运行: npm install"
    exit 1
fi
echo "✓ 前端依赖已安装"

echo ""
echo "[5/5] 测试后端API..."
cd backend
node server.js &
SERVER_PID=$!
sleep 3

API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/bearings)

kill $SERVER_PID 2>/dev/null

if [ "$API_RESPONSE" = "200" ]; then
    echo "✓ 后端API正常"
else
    echo "✗ 后端API异常 (HTTP $API_RESPONSE)"
    exit 1
fi

cd ..

echo ""
echo "========================================="
echo "  所有测试通过！"
echo "========================================="
echo ""
echo "系统已准备就绪，可以启动服务:"
echo "  开发环境: ./start.sh"
echo "  生产环境: ./start-prod.sh"
echo ""
