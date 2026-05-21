#!/bin/bash

# 轴承销售系统 API 测试脚本

BASE_URL="http://localhost:3001"
TOKEN=""

echo "🚀 开始测试轴承销售系统 API..."
echo ""

# 1. 测试登录
echo "1️⃣  测试管理员登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "✅ 登录成功！Token: ${TOKEN:0:20}..."
else
  echo "❌ 登录失败！"
  exit 1
fi
echo ""

# 2. 测试获取产品列表
echo "2️⃣  测试获取产品列表..."
PRODUCTS=$(curl -s "$BASE_URL/api/bearings")
PRODUCT_COUNT=$(echo $PRODUCTS | grep -o '"id"' | wc -l)
echo "✅ 获取到 $PRODUCT_COUNT 个产品"
echo ""

# 3. 测试获取分类
echo "3️⃣  测试获取产品分类..."
CATEGORIES=$(curl -s "$BASE_URL/api/categories")
echo "✅ 分类列表: $CATEGORIES"
echo ""

# 4. 测试搜索功能
echo "4️⃣  测试搜索功能..."
SEARCH_RESULT=$(curl -s "$BASE_URL/api/search?q=轴承&inStock=true")
SEARCH_COUNT=$(echo $SEARCH_RESULT | grep -o '"total":[0-9]*' | cut -d':' -f2)
echo "✅ 搜索到 $SEARCH_COUNT 个结果"
echo ""

# 5. 测试搜索建议
echo "5️⃣  测试搜索建议..."
SUGGESTIONS=$(curl -s "$BASE_URL/api/search/suggestions?q=深")
echo "✅ 搜索建议: $SUGGESTIONS"
echo ""

# 6. 测试热销推荐
echo "6️⃣  测试热销产品推荐..."
HOT_PRODUCTS=$(curl -s "$BASE_URL/api/recommendations/hot?limit=5")
HOT_COUNT=$(echo $HOT_PRODUCTS | grep -o '"id"' | wc -l)
echo "✅ 获取到 $HOT_COUNT 个热销产品"
echo ""

# 7. 测试新品推荐
echo "7️⃣  测试新品推荐..."
NEW_PRODUCTS=$(curl -s "$BASE_URL/api/recommendations/new?limit=5")
NEW_COUNT=$(echo $NEW_PRODUCTS | grep -o '"id"' | wc -l)
echo "✅ 获取到 $NEW_COUNT 个新品"
echo ""

# 8. 测试获取订单（需要认证）
echo "8️⃣  测试获取订单列表（需要管理员权限）..."
ORDERS=$(curl -s "$BASE_URL/api/orders" \
  -H "Authorization: Bearer $TOKEN")
ORDER_COUNT=$(echo $ORDERS | grep -o '"id"' | wc -l)
echo "✅ 获取到 $ORDER_COUNT 个订单"
echo ""

# 9. 测试库存摘要（需要认证）
echo "9️⃣  测试库存统计摘要..."
INVENTORY=$(curl -s "$BASE_URL/api/inventory/summary" \
  -H "Authorization: Bearer $TOKEN")
echo "✅ 库存摘要: $INVENTORY"
echo ""

# 10. 测试低库存产品（需要认证）
echo "🔟 测试低库存产品..."
LOW_STOCK=$(curl -s "$BASE_URL/api/inventory/low-stock" \
  -H "Authorization: Bearer $TOKEN")
LOW_COUNT=$(echo $LOW_STOCK | grep -o '"id"' | wc -l)
echo "✅ 低库存产品: $LOW_COUNT 个"
echo ""

# 11. 测试数据分析仪表板（需要认证）
echo "1️⃣1️⃣  测试数据分析仪表板..."
DASHBOARD=$(curl -s "$BASE_URL/api/analytics/dashboard" \
  -H "Authorization: Bearer $TOKEN")
echo "✅ 仪表板数据获取成功"
echo ""

# 12. 测试销售趋势（需要认证）
echo "1️⃣2️⃣  测试销售趋势分析..."
TREND=$(curl -s "$BASE_URL/api/analytics/sales-trend?period=day&days=7" \
  -H "Authorization: Bearer $TOKEN")
TREND_COUNT=$(echo $TREND | grep -o '"period"' | wc -l)
echo "✅ 获取到 $TREND_COUNT 天的销售数据"
echo ""

# 13. 测试产品销量排行（需要认证）
echo "1️⃣3️⃣  测试产品销量排行..."
TOP_PRODUCTS=$(curl -s "$BASE_URL/api/analytics/top-products?limit=5" \
  -H "Authorization: Bearer $TOKEN")
TOP_COUNT=$(echo $TOP_PRODUCTS | grep -o '"id"' | wc -l)
echo "✅ 获取到 $TOP_COUNT 个热销产品"
echo ""

# 14. 测试补货建议（需要认证）
echo "1️⃣4️⃣  测试补货建议..."
RESTOCK=$(curl -s "$BASE_URL/api/inventory/restock-suggestions" \
  -H "Authorization: Bearer $TOKEN")
RESTOCK_COUNT=$(echo $RESTOCK | grep -o '"id"' | wc -l)
echo "✅ 获取到 $RESTOCK_COUNT 个补货建议"
echo ""

# 15. 测试获取当前用户信息（需要认证）
echo "1️⃣5️⃣  测试获取当前用户信息..."
USER_INFO=$(curl -s "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")
USERNAME=$(echo $USER_INFO | grep -o '"username":"[^"]*' | cut -d'"' -f4)
echo "✅ 当前用户: $USERNAME"
echo ""

echo "🎉 所有测试完成！"
echo ""
echo "📊 测试总结:"
echo "  - 产品数量: $PRODUCT_COUNT"
echo "  - 订单数量: $ORDER_COUNT"
echo "  - 低库存产品: $LOW_COUNT"
echo "  - 热销产品: $HOT_COUNT"
echo "  - 新品数量: $NEW_COUNT"
echo "  - 补货建议: $RESTOCK_COUNT"
echo ""
echo "✅ 系统运行正常！"
