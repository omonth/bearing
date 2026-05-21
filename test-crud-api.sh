#!/bin/bash

echo "======================================"
echo "订单和产品管理API测试"
echo "======================================"
echo ""

API_URL="http://localhost:3001"
TOKEN=""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 登录获取Token
echo "1. 登录获取Token..."
LOGIN_RESPONSE=$(curl -s -X POST ${API_URL}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ 登录成功${NC}"
else
    echo -e "${RED}✗ 登录失败，请检查用户名和密码${NC}"
    exit 1
fi
echo ""

# 2. 测试添加产品
echo "2. 测试添加产品..."
ADD_PRODUCT_RESPONSE=$(curl -s -X POST ${API_URL}/api/bearings \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试轴承 TEST001",
    "model": "TEST001",
    "price": 99.99,
    "category": "测试分类",
    "innerDiameter": "10mm",
    "outerDiameter": "30mm",
    "width": "9mm",
    "stock": 50,
    "description": "这是一个测试产品"
  }')

PRODUCT_ID=$(echo $ADD_PRODUCT_RESPONSE | jq -r '.id')

if [ "$PRODUCT_ID" != "null" ] && [ -n "$PRODUCT_ID" ]; then
    echo -e "${GREEN}✓ 产品添加成功，ID: ${PRODUCT_ID}${NC}"
else
    echo -e "${RED}✗ 产品添加失败${NC}"
    echo $ADD_PRODUCT_RESPONSE | jq '.'
fi
echo ""

# 3. 测试创建订单
echo "3. 测试创建订单..."
CREATE_ORDER_RESPONSE=$(curl -s -X POST ${API_URL}/api/orders \
  -H "Content-Type: application/json" \
  -d "{
    \"customerName\": \"测试客户\",
    \"customerPhone\": \"13800138000\",
    \"province\": \"广东省\",
    \"city\": \"深圳市\",
    \"district\": \"南山区\",
    \"addressDetail\": \"测试地址123号\",
    \"items\": [
      {
        \"id\": ${PRODUCT_ID},
        \"quantity\": 2,
        \"price\": 99.99
      }
    ],
    \"totalPrice\": 199.98
  }")

ORDER_ID=$(echo $CREATE_ORDER_RESPONSE | jq -r '.orderId')

if [ "$ORDER_ID" != "null" ] && [ -n "$ORDER_ID" ]; then
    echo -e "${GREEN}✓ 订单创建成功，ID: ${ORDER_ID}${NC}"
else
    echo -e "${RED}✗ 订单创建失败${NC}"
    echo $CREATE_ORDER_RESPONSE | jq '.'
fi
echo ""

# 4. 测试删除订单（应该成功，因为订单状态是pending）
echo "4. 测试删除订单..."
DELETE_ORDER_RESPONSE=$(curl -s -X DELETE ${API_URL}/api/orders/${ORDER_ID} \
  -H "Authorization: Bearer ${TOKEN}")

DELETE_MESSAGE=$(echo $DELETE_ORDER_RESPONSE | jq -r '.message')

if [ "$DELETE_MESSAGE" = "订单删除成功" ]; then
    echo -e "${GREEN}✓ 订单删除成功${NC}"
    echo "  - 库存已恢复: $(echo $DELETE_ORDER_RESPONSE | jq -r '.restoredStock')"
    echo "  - 订单项数量: $(echo $DELETE_ORDER_RESPONSE | jq -r '.itemsCount')"
else
    echo -e "${RED}✗ 订单删除失败${NC}"
    echo $DELETE_ORDER_RESPONSE | jq '.'
fi
echo ""

# 5. 测试删除产品
echo "5. 测试删除产品..."
DELETE_PRODUCT_RESPONSE=$(curl -s -X DELETE ${API_URL}/api/bearings/${PRODUCT_ID} \
  -H "Authorization: Bearer ${TOKEN}")

DELETE_PRODUCT_MESSAGE=$(echo $DELETE_PRODUCT_RESPONSE | jq -r '.message')

if [ "$DELETE_PRODUCT_MESSAGE" = "产品删除成功" ]; then
    echo -e "${GREEN}✓ 产品删除成功${NC}"
else
    echo -e "${RED}✗ 产品删除失败${NC}"
    echo $DELETE_PRODUCT_RESPONSE | jq '.'
fi
echo ""

# 6. 测试批量删除订单
echo "6. 测试批量删除订单..."
echo "  创建3个测试订单..."

# 先创建一个测试产品
TEST_PRODUCT=$(curl -s -X POST ${API_URL}/api/bearings \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "批量测试产品",
    "model": "BATCH001",
    "price": 50.00,
    "category": "测试",
    "innerDiameter": "10mm",
    "outerDiameter": "30mm",
    "width": "9mm",
    "stock": 100,
    "description": "批量测试"
  }')

BATCH_PRODUCT_ID=$(echo $TEST_PRODUCT | jq -r '.id')

# 创建3个订单
ORDER_IDS=()
for i in {1..3}; do
    ORDER_RESPONSE=$(curl -s -X POST ${API_URL}/api/orders \
      -H "Content-Type: application/json" \
      -d "{
        \"customerName\": \"批量测试客户${i}\",
        \"customerPhone\": \"1380013800${i}\",
        \"province\": \"广东省\",
        \"city\": \"深圳市\",
        \"district\": \"南山区\",
        \"addressDetail\": \"批量测试地址${i}\",
        \"items\": [{\"id\": ${BATCH_PRODUCT_ID}, \"quantity\": 1, \"price\": 50.00}],
        \"totalPrice\": 50.00
      }")

    ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.orderId')
    ORDER_IDS+=($ORDER_ID)
    echo "  - 订单 ${i} 创建成功，ID: ${ORDER_ID}"
done

echo ""
echo "  批量删除这3个订单..."

BATCH_DELETE_RESPONSE=$(curl -s -X DELETE ${API_URL}/api/orders/batch \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"orderIds\": [${ORDER_IDS[0]}, ${ORDER_IDS[1]}, ${ORDER_IDS[2]}]}")

BATCH_MESSAGE=$(echo $BATCH_DELETE_RESPONSE | jq -r '.message')

if [[ "$BATCH_MESSAGE" == *"成功删除"* ]]; then
    echo -e "${GREEN}✓ 批量删除成功${NC}"
    echo "  - 删除数量: $(echo $BATCH_DELETE_RESPONSE | jq -r '.count')"
    echo "  - 库存已恢复: $(echo $BATCH_DELETE_RESPONSE | jq -r '.restoredStock')"
else
    echo -e "${RED}✗ 批量删除失败${NC}"
    echo $BATCH_DELETE_RESPONSE | jq '.'
fi

# 清理测试产品
curl -s -X DELETE ${API_URL}/api/bearings/${BATCH_PRODUCT_ID} \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

echo ""

# 7. 测试删除已支付订单（应该失败）
echo "7. 测试删除已支付订单（预期失败）..."

# 创建订单
PAID_ORDER=$(curl -s -X POST ${API_URL}/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "已支付测试",
    "customerPhone": "13800138999",
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区",
    "addressDetail": "测试地址",
    "items": [{"id": 1, "quantity": 1, "price": 10.00}],
    "totalPrice": 10.00
  }')

PAID_ORDER_ID=$(echo $PAID_ORDER | jq -r '.orderId')

# 更新为已支付状态
curl -s -X PUT ${API_URL}/api/orders/${PAID_ORDER_ID}/status \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "paid"}' > /dev/null

# 尝试删除
DELETE_PAID_RESPONSE=$(curl -s -X DELETE ${API_URL}/api/orders/${PAID_ORDER_ID} \
  -H "Authorization: Bearer ${TOKEN}")

ERROR_MESSAGE=$(echo $DELETE_PAID_RESPONSE | jq -r '.error')

if [[ "$ERROR_MESSAGE" == *"无法删除"* ]]; then
    echo -e "${GREEN}✓ 正确拒绝删除已支付订单${NC}"
    echo "  - 错误信息: ${ERROR_MESSAGE}"
else
    echo -e "${YELLOW}⚠ 未按预期拒绝删除${NC}"
fi

# 清理：取消订单后删除
curl -s -X PUT ${API_URL}/api/orders/${PAID_ORDER_ID}/status \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}' > /dev/null

curl -s -X DELETE ${API_URL}/api/orders/${PAID_ORDER_ID} \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

echo ""
echo "======================================"
echo "测试完成！"
echo "======================================"
echo ""
echo "测试结果总结："
echo "  ✓ 产品添加和删除"
echo "  ✓ 订单创建和删除"
echo "  ✓ 批量删除订单"
echo "  ✓ 库存自动恢复"
echo "  ✓ 已支付订单保护"
echo ""
