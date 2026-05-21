#!/bin/bash

echo "======================================"
echo "订单地址字段升级测试"
echo "======================================"
echo ""

# 1. 备份数据库
echo "1. 备份数据库..."
cp backend/bearings.db backend/bearings.db.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ 备份完成"
echo ""

# 2. 运行升级脚本
echo "2. 运行升级脚本..."
cd backend
node scripts/upgradeOrderAddress.js
echo ""

# 3. 验证表结构
echo "3. 验证新表结构..."
sqlite3 bearings.db "PRAGMA table_info(orders);" | grep -E "(province|city|district|address_detail)"
echo ""

# 4. 查看订单数据
echo "4. 查看订单数据示例..."
sqlite3 bearings.db "SELECT id, customer_name, province, city, district, address_detail FROM orders LIMIT 3;"
echo ""

# 5. 测试创建订单API
echo "5. 测试创建订单API..."
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "测试用户",
    "customerPhone": "13800138000",
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区",
    "addressDetail": "科技园南区某某大厦A座1001室",
    "items": [
      {
        "id": 1,
        "quantity": 2,
        "price": 15.80
      }
    ],
    "totalPrice": 31.60
  }'
echo ""
echo ""

echo "======================================"
echo "升级测试完成！"
echo "======================================"
echo ""
echo "如果一切正常，您应该看到："
echo "  ✓ 新的地址字段（province, city, district, address_detail）"
echo "  ✓ 订单数据已迁移"
echo "  ✓ API测试成功"
echo ""
echo "如需回滚，运行："
echo "  cp backend/bearings.db.backup.* backend/bearings.db"
