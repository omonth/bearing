# API 文档

## 基础信息

- **Base URL**: `http://localhost:3001`
- **版本**: v2.0
- **认证方式**: JWT Bearer Token

## 认证

### 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@bearing-sales.com",
    "role": "admin"
  }
}
```

### 修改密码

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "oldPassword": "admin123",
  "newPassword": "newpassword123"
}
```

### 获取当前用户信息

```http
GET /api/auth/me
Authorization: Bearer <token>
```

## 产品管理

### 获取所有产品

```http
GET /api/bearings?category=深沟球轴承
```

**查询参数**:
- `category` (可选): 产品分类

### 获取单个产品

```http
GET /api/bearings/:id
```

### 添加产品（需管理员权限）

```http
POST /api/bearings
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "深沟球轴承",
  "model": "6205",
  "price": 25.50,
  "category": "深沟球轴承",
  "innerDiameter": 25,
  "outerDiameter": 52,
  "width": 15,
  "stock": 100,
  "image": "/images/6205.jpg",
  "description": "高品质深沟球轴承"
}
```

### 删除产品（需管理员权限）

```http
DELETE /api/bearings/:id
Authorization: Bearer <token>
```

### 更新库存（需管理员权限）

```http
PUT /api/bearings/:id/stock
Authorization: Bearer <token>
Content-Type: application/json

{
  "stock": 150
}
```

### 获取产品分类

```http
GET /api/categories
```

## 搜索功能

### 高级搜索

```http
GET /api/search?q=6205&category=深沟球轴承&minPrice=10&maxPrice=50&inStock=true&sortBy=price&order=asc
```

**查询参数**:
- `q`: 搜索关键词（匹配型号、名称、分类和描述，兼容 SQLite 与 PostgreSQL）
- `category`: 分类筛选
- `minPrice`: 最低价格
- `maxPrice`: 最高价格
- `minStock`: 最低库存
- `inStock`: 是否有货（true/false）
- `sortBy`: 排序字段（price, stock, name, created_at）
- `order`: 排序方向（asc, desc）

### 搜索建议（自动补全）

```http
GET /api/search/suggestions?q=620
```

## 订单管理

### 创建订单

```http
POST /api/orders
Content-Type: application/json

{
  "customerName": "张三",
  "customerPhone": "13800138000",
  "province": "北京市",
  "city": "北京市",
  "district": "朝阳区",
  "addressDetail": "xxx街道xxx号",
  "items": [
    {
      "id": 1,
      "quantity": 2,
      "price": 25.50
    }
  ],
  "totalPrice": 51.00
}
```

### 顾客收货地址簿（顾客 JWT）

```http
GET /api/customer/addresses
Authorization: Bearer <customer-token>
```

```http
POST /api/customer/addresses
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "recipientName": "张三",
  "recipientPhone": "13800138000",
  "province": "北京市",
  "city": "北京市",
  "district": "朝阳区",
  "addressDetail": "xxx街道xxx号",
  "isDefault": true
}
```

`PUT /api/customer/addresses/:id` 使用相同请求体更新；`DELETE /api/customer/addresses/:id` 删除本人地址。接口按 JWT 顾客 ID 过滤，不能跨顾客访问；系统维持每位顾客最多一个默认地址。

### 获取所有订单（需管理员权限）

```http
GET /api/orders
Authorization: Bearer <token>
```

### 获取订单详情（需管理员权限）

```http
GET /api/orders/:id/items
Authorization: Bearer <token>
```

### 更新订单状态（需管理员权限）

```http
PUT /api/orders/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "shipped",
  "trackingNumber": "SF1234567890",
  "note": "已发货"
}
```

**订单状态**:
- `pending`: 待付款
- `paid`: 已付款
- `shipped`: 已发货
- `completed`: 已完成
- `cancelled`: 已取消

### 批量更新订单状态（需管理员权限）

```http
PUT /api/orders/batch/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderIds": [1, 2, 3],
  "status": "shipped",
  "note": "批量发货"
}
```

### 获取订单状态历史（需管理员权限）

```http
GET /api/orders/:id/history
Authorization: Bearer <token>
```

### 导出订单为Excel（需管理员权限）

```http
GET /api/orders/export/excel
Authorization: Bearer <token>
```

### 导出单个订单为PDF（需管理员权限）

```http
GET /api/orders/:id/export/pdf
Authorization: Bearer <token>
```

## 库存预警

### 获取低库存产品（需管理员权限）

```http
GET /api/inventory/low-stock
Authorization: Bearer <token>
```

### 获取缺货产品（需管理员权限）

```http
GET /api/inventory/out-of-stock
Authorization: Bearer <token>
```

### 获取库存周转率（需管理员权限）

```http
GET /api/inventory/turnover
Authorization: Bearer <token>
```

### 获取销售趋势（需管理员权限）

```http
GET /api/inventory/sales-trend/:id?days=30
Authorization: Bearer <token>
```

### 获取补货建议（需管理员权限）

```http
GET /api/inventory/restock-suggestions
Authorization: Bearer <token>
```

### 获取库存统计摘要（需管理员权限）

```http
GET /api/inventory/summary
Authorization: Bearer <token>
```

## 数据分析

### 获取销售趋势（需管理员权限）

```http
GET /api/analytics/sales-trend?period=day&days=30
Authorization: Bearer <token>
```

**查询参数**:
- `period`: 时间周期（day, week, month）
- `days`: 天数

### 获取产品销量排行（需管理员权限）

```http
GET /api/analytics/top-products?limit=10&days=30
Authorization: Bearer <token>
```

### 获取分类销售统计（需管理员权限）

```http
GET /api/analytics/category-sales?days=30
Authorization: Bearer <token>
```

### 获取客户地区分布（需管理员权限）

```http
GET /api/analytics/customer-distribution
Authorization: Bearer <token>
```

### 获取收入统计（需管理员权限）

```http
GET /api/analytics/revenue-stats?days=30
Authorization: Bearer <token>
```

### 获取实时销售监控（需管理员权限）

```http
GET /api/analytics/realtime-sales
Authorization: Bearer <token>
```

### 获取综合仪表板数据（需管理员权限）

```http
GET /api/analytics/dashboard
Authorization: Bearer <token>
```

## 智能推荐

### 热销产品推荐

```http
GET /api/recommendations/hot?limit=10&days=30
```

### 新品推荐

```http
GET /api/recommendations/new?limit=10
```

### 相似产品推荐

```http
GET /api/recommendations/similar/:id?limit=5
```

### 协同过滤推荐

```http
GET /api/recommendations/collaborative/:id?limit=5
```

### 个性化推荐

```http
POST /api/recommendations/personalized
Content-Type: application/json

{
  "customerPhone": "13800138000",
  "limit": 10
}
```

### 综合推荐

```http
POST /api/recommendations/mixed
Content-Type: application/json

{
  "productId": 1,
  "customerPhone": "13800138000",
  "limit": 10
}
```

## 错误响应

所有错误响应遵循以下格式：

```json
{
  "error": "错误描述",
  "details": [] // 可选，详细错误信息
}
```

**HTTP 状态码**:
- `200`: 成功
- `400`: 请求参数错误
- `401`: 未授权（未登录或token无效）
- `403`: 禁止访问（权限不足）
- `404`: 资源不存在
- `429`: 请求过于频繁
- `500`: 服务器内部错误

## 限流规则

- 通用API: 15分钟内最多100次请求
- 登录接口: 15分钟内最多5次尝试
- 订单创建: 1分钟内最多10个订单

## 缓存策略

以下接口启用了缓存：

- `/api/bearings`: 10分钟
- `/api/categories`: 1小时
- `/api/search`: 5分钟
- `/api/recommendations/*`: 30分钟

## 测试示例

### 使用 curl

```bash
# 登录
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 获取产品列表
curl http://localhost:3001/api/bearings

# 使用token访问受保护的API
curl http://localhost:3001/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 使用 JavaScript (Fetch)

```javascript
// 登录
const login = async () => {
  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin123'
    })
  });
  const data = await response.json();
  return data.token;
};

// 获取订单
const getOrders = async (token) => {
  const response = await fetch('http://localhost:3001/api/orders', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
};
```

## 更新日志

### v2.0 (2026-05-02)
- ✅ 添加JWT认证系统
- ✅ 实现API限流
- ✅ 集成Redis缓存
- ✅ 添加全文搜索功能
- ✅ 订单状态流转和导出
- ✅ 库存预警系统
- ✅ 数据分析仪表板
- ✅ 智能推荐系统
- ✅ XSS防护和安全增强

### v1.0 (2026-05-01)
- 基础产品管理
- 订单创建
- 简单的库存管理
