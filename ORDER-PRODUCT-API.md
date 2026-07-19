# 订单和产品管理API文档

## 概述

本文档介绍订单和产品的增删改查（CRUD）操作API。

---

## 🛍️ 产品管理API

### 1. 添加产品

**接口**: `POST /api/bearings`  
**权限**: 需要管理员认证  
**描述**: 添加新产品到系统

#### 请求示例

```bash
curl -X POST http://localhost:3001/api/bearings \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "深沟球轴承 6205",
    "model": "6205",
    "price": 25.80,
    "category": "深沟球轴承",
    "innerDiameter": "25mm",
    "outerDiameter": "52mm",
    "width": "15mm",
    "stock": 100,
    "image": "https://example.com/image.jpg",
    "description": "高品质深沟球轴承"
  }'
```

#### 响应示例

```json
{
  "id": 123,
  "message": "产品添加成功"
}
```

---

### 2. 删除产品

**接口**: `DELETE /api/bearings/:id`  
**权限**: 需要管理员认证  
**描述**: 删除指定产品

#### 请求示例

```bash
curl -X DELETE http://localhost:3001/api/bearings/123 \
  -H "Authorization: Bearer <access-token>"
```

#### 响应示例

```json
{
  "message": "产品删除成功"
}
```

#### 注意事项

- ⚠️ 删除产品会永久删除，无法恢复
- ⚠️ 如果产品在订单中被引用，可能会影响历史订单数据
- ✅ 删除后会自动清除相关缓存

---

### 3. 更新产品库存

**接口**: `PUT /api/bearings/:id/stock`  
**权限**: 需要管理员认证  
**描述**: 更新产品库存数量

#### 请求示例

```bash
curl -X PUT http://localhost:3001/api/bearings/123/stock \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "stock": 200
  }'
```

#### 响应示例

```json
{
  "message": "库存更新成功"
}
```

---

## 📦 订单管理API

### 1. 创建订单

**接口**: `POST /api/orders`  
**权限**: 公开（有限流）  
**描述**: 创建新订单

#### 请求示例

```bash
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "张三",
    "customerPhone": "13800138000",
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区",
    "addressDetail": "科技园南区某某大厦A座1001室",
    "items": [
      {
        "id": 1,
        "quantity": 2,
        "price": 25.80
      },
      {
        "id": 2,
        "quantity": 1,
        "price": 35.60
      }
    ],
    "totalPrice": 87.20
  }'
```

#### 响应示例

```json
{
  "orderId": 456,
  "message": "订单创建成功"
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| customerName | string | ✅ | 客户姓名 |
| customerPhone | string | ✅ | 手机号（格式：1开头的11位数字） |
| province | string | ✅ | 省份 |
| city | string | ✅ | 城市 |
| district | string | ✅ | 区/县 |
| addressDetail | string | ✅ | 详细地址 |
| items | array | ✅ | 订单项列表（至少1项） |
| items[].id | number | ✅ | 产品ID |
| items[].quantity | number | ✅ | 数量（>0） |
| items[].price | number | ✅ | 单价 |
| totalPrice | number | ✅ | 订单总金额 |

---

### 2. 删除订单

**接口**: `DELETE /api/orders/:id`  
**权限**: 需要管理员认证  
**描述**: 删除指定订单

#### 请求示例

```bash
curl -X DELETE http://localhost:3001/api/orders/456 \
  -H "Authorization: Bearer <access-token>"
```

#### 响应示例

```json
{
  "message": "订单删除成功",
  "restoredStock": true,
  "itemsCount": 2
}
```

#### 删除规则

✅ **可以删除的订单**:
- 状态为 `pending`（待付款）的订单
- 状态为 `cancelled`（已取消）的订单

❌ **不能删除的订单**:
- 状态为 `paid`（已付款）的订单
- 状态为 `shipped`（已发货）的订单
- 状态为 `completed`（已完成）的订单

#### 删除效果

- ✅ 删除订单记录
- ✅ 删除订单项
- ✅ 删除订单状态历史
- ✅ **自动恢复库存**（将订单中的产品数量加回库存）
- ✅ 清除相关缓存

#### 错误响应

```json
{
  "error": "无法删除已支付或已发货的订单",
  "suggestion": "请先取消订单，然后再删除"
}
```

---

### 3. 批量删除订单

**接口**: `DELETE /api/orders/batch`  
**权限**: 需要管理员认证  
**描述**: 批量删除多个订单

#### 请求示例

```bash
curl -X DELETE http://localhost:3001/api/orders/batch \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "orderIds": [456, 457, 458]
  }'
```

#### 响应示例

```json
{
  "message": "成功删除3个订单",
  "count": 3,
  "restoredStock": true
}
```

#### 错误响应（部分订单无法删除）

```json
{
  "error": "部分订单无法删除",
  "invalidOrders": [457],
  "message": "已支付或已发货的订单无法删除"
}
```

#### 注意事项

- ⚠️ 批量删除是原子操作，要么全部成功，要么全部失败
- ⚠️ 如果任何一个订单无法删除，整个操作会回滚
- ✅ 成功删除后会自动恢复所有订单的库存

---

### 4. 更新订单状态

**接口**: `PUT /api/orders/:id/status`  
**权限**: 需要管理员认证  
**描述**: 更新订单状态

#### 请求示例

```bash
curl -X PUT http://localhost:3001/api/orders/456/status \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "shipped",
    "trackingNumber": "SF1234567890",
    "note": "已通过顺丰发货"
  }'
```

#### 订单状态

| 状态 | 说明 | 可转换到 |
|------|------|----------|
| pending | 待付款 | paid, cancelled |
| paid | 已付款 | shipped, cancelled |
| shipped | 已发货 | completed |
| completed | 已完成 | - |
| cancelled | 已取消 | - |

---

### 5. 获取订单状态历史

**接口**: `GET /api/orders/:id/history`  
**权限**: 需要管理员认证  
**描述**: 获取订单的状态变更历史

#### 请求示例

```bash
curl http://localhost:3001/api/orders/456/history \
  -H "Authorization: Bearer <access-token>"
```

#### 响应示例

```json
[
  {
    "id": 1,
    "order_id": 456,
    "old_status": "paid",
    "new_status": "shipped",
    "note": "已通过顺丰发货",
    "created_at": "2026-05-02 14:30:00"
  },
  {
    "id": 2,
    "order_id": 456,
    "old_status": "pending",
    "new_status": "paid",
    "note": "支付成功",
    "created_at": "2026-05-02 10:15:00"
  }
]
```

---

## 🔐 认证说明

### 获取Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

### 使用Token

在所有需要认证的请求中添加 `Authorization` 头：

```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## ⚠️ 错误处理

### 常见错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证或Token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "错误描述",
  "details": [
    {
      "field": "customerPhone",
      "message": "手机号格式不正确"
    }
  ]
}
```

---

## 💡 最佳实践

### 1. 删除订单前的检查

```javascript
// 先获取订单详情
const order = await fetch(`/api/orders/${orderId}/items`);

// 检查订单状态
if (['paid', 'shipped', 'completed'].includes(order.status)) {
  // 先取消订单
  await fetch(`/api/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' })
  });
}

// 然后删除订单
await fetch(`/api/orders/${orderId}`, {
  method: 'DELETE'
});
```

### 2. 批量操作的错误处理

```javascript
try {
  const response = await fetch('/api/orders/batch', {
    method: 'DELETE',
    body: JSON.stringify({ orderIds: [1, 2, 3] })
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (error.invalidOrders) {
      console.log('无法删除的订单:', error.invalidOrders);
    }
  }
} catch (error) {
  console.error('批量删除失败:', error);
}
```

### 3. 库存恢复确认

删除订单后，系统会自动恢复库存。可以通过响应确认：

```javascript
const response = await fetch(`/api/orders/${orderId}`, {
  method: 'DELETE'
});

const result = await response.json();
if (result.restoredStock) {
  console.log(`已恢复 ${result.itemsCount} 个产品的库存`);
}
```

---

## 📊 使用示例

### 完整的订单管理流程

```javascript
// 1. 创建订单
const createOrder = async () => {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: '张三',
      customerPhone: '13800138000',
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      addressDetail: '科技园南区某某大厦A座1001室',
      items: [
        { id: 1, quantity: 2, price: 25.80 }
      ],
      totalPrice: 51.60
    })
  });
  
  const result = await response.json();
  console.log('订单创建成功:', result.orderId);
  return result.orderId;
};

// 2. 更新订单状态
const updateOrderStatus = async (orderId) => {
  await fetch(`/api/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'paid',
      note: '支付成功'
    })
  });
};

// 3. 取消订单
const cancelOrder = async (orderId) => {
  await fetch(`/api/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'cancelled',
      note: '客户取消'
    })
  });
};

// 4. 删除订单
const deleteOrder = async (orderId) => {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  console.log(result.message);
};
```

---

## 🔄 数据流程

### 订单删除流程

```
1. 验证管理员权限
   ↓
2. 检查订单是否存在
   ↓
3. 检查订单状态（是否可删除）
   ↓
4. 获取订单项
   ↓
5. 恢复产品库存
   ↓
6. 删除订单项
   ↓
7. 删除订单状态历史
   ↓
8. 删除订单
   ↓
9. 清除缓存
   ↓
10. 返回成功响应
```

---

**版本**: v5.1.0  
**更新时间**: 2026-05-02  
**状态**: ✅ 已完成

订单和产品的完整CRUD功能已实现！
