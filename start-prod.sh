#!/bin/bash

echo "=== 轴承销售系统生产环境启动脚本 ==="

cd "$(dirname "$0")"

if ! command -v pm2 &> /dev/null; then
  echo "错误: PM2 未安装"
  echo "请运行: npm install -g pm2"
  exit 1
fi

if [ ! -f "backend/.env" ]; then
  echo "错误: backend/.env 文件不存在"
  exit 1
fi

echo "检查后端依赖..."
cd backend
if [ ! -d "node_modules" ]; then
  echo "安装后端依赖..."
  npm install --production
fi

if [ ! -f "bearings.db" ]; then
  echo "初始化数据库..."
  npm run init-db
fi

cd ..

echo "构建前端..."
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build

echo "复制前端构建文件到后端..."
rm -rf backend/public
cp -r build backend/public

echo "使用PM2启动后端服务..."
pm2 start ecosystem.config.json

echo "设置PM2开机自启..."
pm2 save
pm2 startup

echo ""
echo "=== 生产环境启动成功 ==="
echo "服务地址: http://localhost:3001"
echo ""
echo "常用命令:"
echo "  pm2 status          - 查看服务状态"
echo "  pm2 logs            - 查看日志"
echo "  pm2 restart all     - 重启服务"
echo "  pm2 stop all        - 停止服务"
