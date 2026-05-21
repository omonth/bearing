# CRM客户管理系统文档

## 概述

完整的CRM（客户关系管理）系统，提供客户管理、等级制度、积分系统、优惠券管理等功能。

---

## 功能特性

### ✅ 客户管理
- 客户信息管理
- 客户等级制度（5个等级）
- 客户标签分类
- 客户互动记录
- 购买历史追踪

### ✅ 积分系统
- 购买积分（消费1元=1积分）
- 签到积分
- 活动积分
- 积分兑换
- 积分历史记录

### ✅ 优惠券系统
- 优惠券创建和管理
- 优惠券发放
- 优惠券使用
- 优惠券统计

### ✅ 客户等级
- 5个等级（青铜、白银、黄金、铂金、钻石）
- 自动升级
- 等级权益
- 等级折扣

### ✅ 客户分析
- RFM分析
- 客户价值分析
- 流失预警
- 复购率统计

---

## 客户等级体系

### 等级配置

| 等级 | 名称 | 所需积分 | 折扣率 | 权益 |
|------|------|----------|--------|------|
| bronze | 青铜会员 | 0 | 0% | 基础服务 |
| silver | 白银会员 | 1,000 | 5% | 5%折扣,优先发货 |
| gold | 黄金会员 | 5,000 | 10% | 10%折扣,专属客服 |
| platinum | 铂金会员 | 10,000 | 15% | 15%折扣,免运费 |
| diamond | 钻石会员 | 50,000 | 20% | 20%折扣,定制服务 |

### 积分规则

**获得积分**:
- 购买商品：消费1元 = 1积分
- 每日签到：+10积分
- 完成订单：+50积分
- 评价商品：+20积分
- 邀请好友：+100积分

**使用积分**:
- 100积分 = 1元
- 积分兑换优惠券
- 积分抽奖

---

## API 接口

### 客户管理

#### 获取客户列表
```http
GET /api/crm/customers?level=gold&status=active
Authorization: Bearer <token>
```

#### 获取客户详情
```http
GET /api/crm/customers/:id
Authorization: Bearer <token>
```

**响应示例**:
```json
{
  "id": 1,
  "name": "张三",
  "phone": "13800138000",
  "email": "zhang@example.com",
  "level": "gold",
  "points": 5280,
  "totalSpent": 12500.00,
  "totalOrders": 25,
  "tags": ["VIP", "活跃"],
  "status": "active",
  "createdAt": "2026-01-01"
}
```

#### 创建客户
```http
POST /api/crm/customers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "张三",
  "phone": "13800138000",
  "email": "zhang@example.com",
  "company": "ABC公司",
  "address": "北京市朝阳区"
}
```

#### 更新客户信息
```http
PUT /api/crm/customers/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "tags": ["VIP", "高价值"],
  "notes": "重要客户，优先处理"
}
```

---

### 积分管理

#### 获取积分记录
```http
GET /api/crm/customers/:id/points
Authorization: Bearer <token>
```

#### 添加积分
```http
POST /api/crm/customers/:id/points
Authorization: Bearer <token>
Content-Type: application/json

{
  "points": 100,
  "type": "purchase",
  "reason": "购买商品",
  "orderId": 123
}
```

#### 扣减积分
```http
POST /api/crm/customers/:id/points/deduct
Authorization: Bearer <token>
Content-Type: application/json

{
  "points": 100,
  "reason": "兑换优惠券"
}
```

---

### 优惠券管理

#### 获取优惠券列表
```http
GET /api/crm/coupons?status=active
Authorization: Bearer <token>
```

#### 创建优惠券
```http
POST /api/crm/coupons
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "SAVE20",
  "name": "满100减20",
  "type": "fixed",
  "discountValue": 20.00,
  "minOrderAmount": 100.00,
  "totalQuantity": 1000,
  "validFrom": "2026-05-01",
  "validUntil": "2026-05-31"
}
```

**优惠券类型**:
- `fixed` - 固定金额（满100减20）
- `percentage` - 百分比折扣（9折）
- `free_shipping` - 免运费

#### 发放优惠券
```http
POST /api/crm/coupons/:id/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerIds": [1, 2, 3]
}
```

#### 使用优惠券
```http
POST /api/crm/coupons/use
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "SAVE20",
  "customerId": 1,
  "orderId": 123
}
```

---

### 客户分析

#### RFM分析
```http
GET /api/crm/analytics/rfm
Authorization: Bearer <token>
```

**响应示例**:
```json
[
  {
    "customerId": 1,
    "name": "张三",
    "recency": 5,
    "frequency": 25,
    "monetary": 12500.00,
    "rfmScore": "555",
    "segment": "重要价值客户"
  }
]
```

**RFM分段**:
- 555: 重要价值客户
- 554-545: 重要保持客户
- 455-445: 重要发展客户
- 355-345: 重要挽留客户
- 其他: 一般客户

#### 客户价值分析
```http
GET /api/crm/analytics/customer-value
Authorization: Bearer <token>
```

#### 流失预警
```http
GET /api/crm/analytics/churn-risk
Authorization: Bearer <token>
```

---

## 业务流程

### 1. 客户注册流程

```
注册 → 创建客户记录 → 赠送新人积分 → 发放新人优惠券
```

### 2. 购买流程

```
下单 → 使用优惠券 → 支付 → 获得积分 → 升级等级
```

### 3. 积分流程

```
消费 → 计算积分 → 累加积分 → 检查等级 → 自动升级
```

### 4. 优惠券流程

```
创建优惠券 → 发放给客户 → 客户使用 → 订单优惠 → 标记已使用
```

---

## 使用示例

### 完整客户管理流程

```javascript
// 1. 创建客户
const createCustomer = async () => {
  const response = await fetch('/api/crm/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: '张三',
      phone: '13800138000',
      email: 'zhang@example.com'
    })
  });
  const data = await response.json();
  console.log('客户已创建:', data.id);
};

// 2. 添加积分
const addPoints = async (customerId) => {
  await fetch(`/api/crm/customers/${customerId}/points`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      points: 100,
      type: 'purchase',
      reason: '购买商品'
    })
  });
};

// 3. 发放优惠券
const issueCoupon = async (couponId, customerIds) => {
  await fetch(`/api/crm/coupons/${couponId}/issue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ customerIds })
  });
};

// 4. 使用优惠券
const useCoupon = async (code, customerId, orderId) => {
  const response = await fetch('/api/crm/coupons/use', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code, customerId, orderId })
  });
  const data = await response.json();
  console.log('优惠金额:', data.discountAmount);
};
```

---

## 自动化功能

### 1. 自动升级等级

```javascript
// 购买后自动检查并升级等级
async function checkAndUpgradeLevel(customerId) {
  const customer = await getCustomer(customerId);
  const levels = await getCustomerLevels();
  
  // 找到符合的最高等级
  const newLevel = levels
    .filter(l => customer.points >= l.min_points)
    .sort((a, b) => b.min_points - a.min_points)[0];
  
  if (newLevel.level !== customer.level) {
    await updateCustomerLevel(customerId, newLevel.level);
    // 发送升级通知
    await sendLevelUpNotification(customerId, newLevel);
  }
}
```

### 2. 自动发放生日优惠券

```javascript
// 每天检查生日客户并发放优惠券
cron.schedule('0 9 * * *', async () => {
  const birthdayCustomers = await getBirthdayCustomers();
  const birthdayCoupon = await getCouponByCode('BIRTHDAY');
  
  for (const customer of birthdayCustomers) {
    await issueCoupon(birthdayCoupon.id, [customer.id]);
    await sendBirthdayEmail(customer);
  }
});
```

### 3. 流失客户挽回

```javascript
// 每周检查流失风险客户
cron.schedule('0 9 * * 1', async () => {
  const churnRiskCustomers = await getChurnRiskCustomers();
  const winbackCoupon = await getCouponByCode('WINBACK');
  
  for (const customer of churnRiskCustomers) {
    await issueCoupon(winbackCoupon.id, [customer.id]);
    await sendWinbackEmail(customer);
  }
});
```

---

## 报表功能

### 1. 客户统计报表
- 客户总数
- 各等级客户数量
- 新增客户趋势
- 活跃客户统计

### 2. 积分报表
- 积分发放统计
- 积分使用统计
- 积分余额分布

### 3. 优惠券报表
- 优惠券发放量
- 优惠券使用率
- 优惠券优惠金额

### 4. 客户价值报表
- 客户生命周期价值（LTV）
- 客户获取成本（CAC）
- 客户留存率
- 复购率

---

## 最佳实践

### 1. 客户分层管理
- 根据RFM模型分层
- 针对不同层级制定策略
- 定期评估和调整

### 2. 积分激励
- 设置合理的积分规则
- 提供多样的积分获取方式
- 定期举办积分活动

### 3. 优惠券策略
- 新客户优惠券
- 复购优惠券
- 生日优惠券
- 流失挽回优惠券

### 4. 客户维护
- 定期回访
- 节日问候
- 生日祝福
- 满意度调查

---

## 扩展功能

### 计划中的功能
- [ ] 会员卡系统
- [ ] 推荐奖励
- [ ] 客户分组营销
- [ ] 自动化营销
- [ ] 客户画像
- [ ] 预测分析
- [ ] 社交媒体集成

---

## 总结

CRM客户管理系统提供：

- ✅ 完整的客户管理
- ✅ 5级会员体系
- ✅ 积分系统
- ✅ 优惠券系统
- ✅ 客户分析
- ✅ 自动化营销

帮助企业提升客户满意度和忠诚度。
