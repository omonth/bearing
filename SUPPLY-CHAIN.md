# 供应链管理模块文档

## 概述

供应链管理模块提供完整的采购、入库、出库和成本核算功能，帮助企业高效管理供应链流程。

---

## 功能特性

### ✅ 供应商管理
- 供应商信息管理
- 供应商评级
- 供应商状态管理
- 供应商产品关联

### ✅ 采购订单管理
- 创建采购订单
- 订单状态跟踪
- 订单明细管理
- 到货管理

### ✅ 入库管理
- 入库记录
- 批次管理
- 库位管理
- 自动更新库存

### ✅ 出库管理
- 出库记录
- 订单关联
- 成本核算（FIFO）
- 自动扣减库存

### ✅ 成本核算
- FIFO成本计算
- 库存成本追踪
- 利润分析
- 成本报表

---

## 数据库表结构

### 1. 供应商表 (suppliers)

```sql
CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    name VARCHAR(255),           -- 供应商名称
    contact_person VARCHAR(100), -- 联系人
    phone VARCHAR(20),           -- 电话
    email VARCHAR(255),          -- 邮箱
    address TEXT,                -- 地址
    bank_account VARCHAR(100),   -- 银行账号
    tax_id VARCHAR(50),          -- 税号
    rating INTEGER,              -- 评级 (1-5)
    status VARCHAR(20),          -- 状态 (active/inactive)
    notes TEXT,                  -- 备注
    created_at DATETIME,
    updated_at DATETIME
);
```

### 2. 采购订单表 (purchase_orders)

```sql
CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY,
    order_number VARCHAR(50),    -- 订单号
    supplier_id INTEGER,         -- 供应商ID
    total_amount DECIMAL(10,2),  -- 总金额
    status VARCHAR(20),          -- 状态 (pending/confirmed/received/cancelled)
    order_date DATETIME,         -- 下单日期
    expected_date DATETIME,      -- 预计到货日期
    received_date DATETIME,      -- 实际到货日期
    notes TEXT,
    created_by INTEGER,          -- 创建人
    created_at DATETIME
);
```

### 3. 采购订单明细表 (purchase_order_items)

```sql
CREATE TABLE purchase_order_items (
    id INTEGER PRIMARY KEY,
    purchase_order_id INTEGER,   -- 采购订单ID
    bearing_id INTEGER,          -- 产品ID
    quantity INTEGER,            -- 数量
    unit_price DECIMAL(10,2),    -- 单价
    received_quantity INTEGER    -- 已收货数量
);
```

### 4. 入库记录表 (stock_in_records)

```sql
CREATE TABLE stock_in_records (
    id INTEGER PRIMARY KEY,
    purchase_order_id INTEGER,   -- 采购订单ID（可选）
    bearing_id INTEGER,          -- 产品ID
    quantity INTEGER,            -- 数量
    unit_cost DECIMAL(10,2),     -- 单位成本
    batch_number VARCHAR(50),    -- 批次号
    warehouse_location VARCHAR(100), -- 库位
    operator VARCHAR(100),       -- 操作员
    notes TEXT,
    created_at DATETIME
);
```

### 5. 出库记录表 (stock_out_records)

```sql
CREATE TABLE stock_out_records (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,            -- 销售订单ID（可选）
    bearing_id INTEGER,          -- 产品ID
    quantity INTEGER,            -- 数量
    unit_cost DECIMAL(10,2),     -- 单位成本
    batch_number VARCHAR(50),    -- 批次号
    operator VARCHAR(100),       -- 操作员
    notes TEXT,
    created_at DATETIME
);
```

### 6. 库存成本表 (inventory_costs)

```sql
CREATE TABLE inventory_costs (
    id INTEGER PRIMARY KEY,
    bearing_id INTEGER,          -- 产品ID
    batch_number VARCHAR(50),    -- 批次号
    quantity INTEGER,            -- 采购数量
    unit_cost DECIMAL(10,2),     -- 单位成本
    remaining_quantity INTEGER,  -- 剩余数量
    purchase_date DATETIME,      -- 采购日期
    created_at DATETIME
);
```

---

## API 接口

### 供应商管理

#### 获取供应商列表
```http
GET /api/supply-chain/suppliers?status=active
Authorization: Bearer <token>
```

#### 创建供应商
```http
POST /api/supply-chain/suppliers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "深圳轴承供应商",
  "contactPerson": "张经理",
  "phone": "13800138001",
  "email": "zhang@supplier.com",
  "address": "深圳市南山区",
  "bankAccount": "6222021234567890",
  "taxId": "91440300XXXXXXXXXX",
  "rating": 5,
  "notes": "优质供应商"
}
```

#### 更新供应商
```http
PUT /api/supply-chain/suppliers/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 4,
  "status": "inactive"
}
```

---

### 采购订单管理

#### 获取采购订单列表
```http
GET /api/supply-chain/purchase-orders?status=pending
Authorization: Bearer <token>
```

#### 创建采购订单
```http
POST /api/supply-chain/purchase-orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderNumber": "PO202605020001",
  "supplierId": 1,
  "expectedDate": "2026-05-10",
  "notes": "紧急采购",
  "items": [
    {
      "bearingId": 1,
      "quantity": 100,
      "unitPrice": 20.00
    },
    {
      "bearingId": 2,
      "quantity": 50,
      "unitPrice": 30.00
    }
  ]
}
```

#### 获取采购订单详情
```http
GET /api/supply-chain/purchase-orders/:id
Authorization: Bearer <token>
```

#### 更新采购订单状态
```http
PUT /api/supply-chain/purchase-orders/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "received",
  "receivedDate": "2026-05-08"
}
```

**订单状态**:
- `pending` - 待确认
- `confirmed` - 已确认
- `received` - 已收货
- `cancelled` - 已取消

---

### 入库管理

#### 获取入库记录
```http
GET /api/supply-chain/stock-in?startDate=2026-05-01&endDate=2026-05-31
Authorization: Bearer <token>
```

#### 创建入库记录
```http
POST /api/supply-chain/stock-in
Authorization: Bearer <token>
Content-Type: application/json

{
  "purchaseOrderId": 1,
  "bearingId": 1,
  "quantity": 100,
  "unitCost": 20.00,
  "batchNumber": "BATCH20260502001",
  "warehouseLocation": "A-01-01",
  "notes": "质检合格"
}
```

---

### 出库管理

#### 获取出库记录
```http
GET /api/supply-chain/stock-out?startDate=2026-05-01&endDate=2026-05-31
Authorization: Bearer <token>
```

#### 创建出库记录
```http
POST /api/supply-chain/stock-out
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": 123,
  "bearingId": 1,
  "quantity": 10,
  "batchNumber": "BATCH20260502001",
  "notes": "订单发货"
}
```

---

### 成本核算

#### 获取产品成本
```http
GET /api/supply-chain/costs/:bearingId
Authorization: Bearer <token>
```

**响应示例**:
```json
{
  "bearingId": 1,
  "totalQuantity": 90,
  "totalCost": 1800.00,
  "avgCost": 20.00,
  "batches": [
    {
      "id": 1,
      "batch_number": "BATCH20260502001",
      "quantity": 100,
      "unit_cost": 20.00,
      "remaining_quantity": 90,
      "purchase_date": "2026-05-02"
    }
  ]
}
```

#### 获取利润分析
```http
GET /api/supply-chain/profit-analysis?startDate=2026-05-01&endDate=2026-05-31
Authorization: Bearer <token>
```

**响应示例**:
```json
[
  {
    "bearing_id": 1,
    "name": "深沟球轴承",
    "model": "6205",
    "total_sold": 50,
    "total_cost": 1000.00,
    "total_revenue": 1275.00,
    "total_profit": 275.00
  }
]
```

---

## 业务流程

### 1. 采购流程

```
创建采购订单 → 供应商确认 → 发货 → 到货入库 → 更新库存
```

**步骤**:
1. 创建采购订单，指定供应商和产品
2. 供应商确认订单（状态: pending → confirmed）
3. 供应商发货
4. 货物到达，创建入库记录
5. 系统自动更新库存和成本

### 2. 入库流程

```
收货 → 质检 → 创建入库记录 → 更新库存 → 记录成本
```

**步骤**:
1. 收到货物，进行质检
2. 创建入库记录，填写批次号和库位
3. 系统自动增加库存
4. 记录库存成本（用于后续成本核算）

### 3. 出库流程

```
销售订单 → 拣货 → 创建出库记录 → 扣减库存 → 核算成本
```

**步骤**:
1. 接收销售订单
2. 根据订单拣货
3. 创建出库记录
4. 系统自动扣减库存
5. 使用FIFO方法核算成本

### 4. 成本核算（FIFO）

**先进先出（FIFO）原则**:
- 先采购的产品先出库
- 出库时使用最早批次的成本
- 自动追踪每个批次的剩余数量

**示例**:
```
批次1: 100个 @ ¥20 = ¥2000
批次2: 50个 @ ¥22 = ¥1100

出库30个:
- 从批次1扣除30个
- 成本 = 30 × ¥20 = ¥600

出库80个:
- 从批次1扣除70个 (剩余70个)
- 从批次2扣除10个
- 成本 = 70 × ¥20 + 10 × ¥22 = ¥1620
```

---

## 使用示例

### 完整采购流程示例

```javascript
// 1. 创建采购订单
const createPO = async () => {
  const response = await fetch('/api/supply-chain/purchase-orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderNumber: 'PO202605020001',
      supplierId: 1,
      expectedDate: '2026-05-10',
      items: [
        { bearingId: 1, quantity: 100, unitPrice: 20.00 }
      ]
    })
  });
  const data = await response.json();
  console.log('采购订单已创建:', data.id);
};

// 2. 货物到达，创建入库记录
const stockIn = async () => {
  const response = await fetch('/api/supply-chain/stock-in', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      purchaseOrderId: 1,
      bearingId: 1,
      quantity: 100,
      unitCost: 20.00,
      batchNumber: 'BATCH20260502001',
      warehouseLocation: 'A-01-01'
    })
  });
  const data = await response.json();
  console.log('入库成功:', data.id);
};

// 3. 销售出库
const stockOut = async () => {
  const response = await fetch('/api/supply-chain/stock-out', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderId: 123,
      bearingId: 1,
      quantity: 10
    })
  });
  const data = await response.json();
  console.log('出库成功，成本:', data.unitCost);
};

// 4. 查看利润分析
const viewProfit = async () => {
  const response = await fetch(
    '/api/supply-chain/profit-analysis?startDate=2026-05-01&endDate=2026-05-31',
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  const data = await response.json();
  console.log('利润分析:', data);
};
```

---

## 报表功能

### 1. 采购报表
- 采购订单统计
- 供应商采购金额排行
- 采购成本趋势

### 2. 库存报表
- 库存余额表
- 库存周转率
- 呆滞库存分析

### 3. 成本报表
- 产品成本明细
- 成本变动分析
- 毛利率分析

### 4. 利润报表
- 产品利润排行
- 利润趋势分析
- 利润率统计

---

## 最佳实践

### 1. 批次管理
- 使用统一的批次号格式：`BATCH + 日期 + 序号`
- 记录每个批次的质检信息
- 追踪批次的保质期（如适用）

### 2. 库位管理
- 使用标准化的库位编码：`区域-货架-层-位`
- 定期盘点库存
- 优化库位布局

### 3. 供应商管理
- 定期评估供应商表现
- 维护多个供应商以分散风险
- 建立供应商评级体系

### 4. 成本控制
- 定期分析采购成本
- 比较不同供应商的价格
- 优化采购批量

---

## 扩展功能

### 计划中的功能
- [ ] 自动补货建议
- [ ] 供应商对账
- [ ] 质检管理
- [ ] 退货管理
- [ ] 库存盘点
- [ ] 条码管理
- [ ] 移动端扫码入库/出库

---

## 总结

供应链管理模块提供了完整的采购、入库、出库和成本核算功能，帮助企业：

- ✅ 规范采购流程
- ✅ 精确追踪库存
- ✅ 准确核算成本
- ✅ 分析利润情况
- ✅ 优化供应链管理

系统采用FIFO成本核算方法，确保成本计算的准确性。
