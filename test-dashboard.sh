#!/bin/bash

echo "======================================"
echo "后端可视化仪表板测试"
echo "======================================"
echo ""

# 检查后端服务是否运行
echo "1. 检查后端服务..."
if curl -s http://localhost:3001/ > /dev/null; then
    echo "✓ 后端服务正在运行"
else
    echo "✗ 后端服务未运行，请先启动："
    echo "  cd backend && npm start"
    exit 1
fi
echo ""

# 测试仪表板API
echo "2. 测试仪表板API..."
echo ""

echo "  - 测试综合仪表板数据..."
curl -s http://localhost:3001/api/analytics/dashboard | jq '.revenue' > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 综合仪表板API正常"
else
    echo "    ✗ 综合仪表板API异常"
fi

echo "  - 测试销售趋势..."
curl -s http://localhost:3001/api/analytics/sales-trend > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 销售趋势API正常"
else
    echo "    ✗ 销售趋势API异常"
fi

echo "  - 测试热销产品..."
curl -s http://localhost:3001/api/analytics/top-products > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 热销产品API正常"
else
    echo "    ✗ 热销产品API异常"
fi

echo "  - 测试分类销售..."
curl -s http://localhost:3001/api/analytics/category-sales > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 分类销售API正常"
else
    echo "    ✗ 分类销售API异常"
fi

echo "  - 测试客户地区分布..."
curl -s http://localhost:3001/api/analytics/customer-distribution > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 客户地区分布API正常"
else
    echo "    ✗ 客户地区分布API异常"
fi

echo "  - 测试实时销售..."
curl -s http://localhost:3001/api/analytics/realtime-sales > /dev/null
if [ $? -eq 0 ]; then
    echo "    ✓ 实时销售API正常"
else
    echo "    ✗ 实时销售API异常"
fi

echo ""
echo "======================================"
echo "测试完成！"
echo "======================================"
echo ""
echo "访问仪表板："
echo "  http://localhost:3001/dashboard.html"
echo ""
echo "API端点："
echo "  http://localhost:3001/api/analytics/dashboard"
echo ""
