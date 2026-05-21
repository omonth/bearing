#!/bin/bash

echo "========================================="
echo "  轴承销售系统 - 快速安装脚本"
echo "========================================="
echo ""

cd "$(dirname "$0")"

echo "[1/6] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js 版本: $NODE_VERSION"

echo ""
echo "[2/6] 安装后端依赖..."
cd backend
if [ ! -f "package.json" ]; then
    echo "错误: backend/package.json 不存在"
    exit 1
fi
npm install
if [ $? -ne 0 ]; then
    echo "错误: 后端依赖安装失败"
    exit 1
fi
echo "✓ 后端依赖安装完成"

echo ""
echo "[3/6] 配置后端环境..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✓ 已创建 backend/.env 配置文件"
else
    echo "✓ backend/.env 已存在"
fi

echo ""
echo "[4/6] 初始化数据库..."
npm run init-db
if [ $? -ne 0 ]; then
    echo "错误: 数据库初始化失败"
    exit 1
fi
echo "✓ 数据库初始化完成"

cd ..

echo ""
echo "[5/6] 安装前端依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "错误: 前端依赖安装失败"
    exit 1
fi
echo "✓ 前端依赖安装完成"

echo ""
echo "[6/6] 配置前端环境..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✓ 已创建 .env 配置文件"
else
    echo "✓ .env 已存在"
fi

echo ""
echo "========================================="
echo "  安装完成！"
echo "========================================="
echo ""
echo "开发环境启动命令:"
echo "  Linux/macOS: ./start.sh"
echo "  Windows:     start.bat"
echo ""
echo "生产环境部署:"
echo "  1. 安装 PM2: npm install -g pm2"
echo "  2. 运行: ./start-prod.sh"
echo ""
echo "访问地址:"
echo "  前端商城: http://localhost:3000"
echo "  后端API:  http://localhost:3001"
echo "  管理后台: http://localhost:3001/admin.html"
echo ""
echo "详细文档请查看:"
echo "  README.md - 项目说明"
echo "  DEPLOYMENT.md - 部署文档"
echo ""
