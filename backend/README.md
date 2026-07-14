# 轴承销售系统 - 后端 API

## 数据库结构

### bearings 表（轴承产品）
- id: 主键
- name: 产品名称
- model: 型号
- price: 价格
- image: 图片URL
- category: 分类
- inner_diameter: 内径
- outer_diameter: 外径
- width: 宽度
- stock: 库存
- description: 描述

### orders 表（订单）
- id: 主键
- customer_name: 客户姓名
- customer_phone: 客户电话
- province / city / district / address_detail: 订单收货地址快照
- total_price: 总价
- status: 订单状态
- created_at: 创建时间

### order_items 表（订单项）
- id: 主键
- order_id: 订单ID
- bearing_id: 轴承ID
- quantity: 数量
- price: 单价

## API 接口

### 获取所有轴承
GET /api/bearings
查询参数: category (可选)

### 获取单个轴承
GET /api/bearings/:id

### 获取分类列表
GET /api/categories

### 创建订单
POST /api/orders
请求体: `{ customerName, customerPhone, province, city, district, addressDetail, items }`。后端根据商品当前价格计算总价。

### 收货地址簿（顾客 JWT）
- `GET /api/customer/addresses`
- `POST /api/customer/addresses`
- `PUT /api/customer/addresses/:id`
- `DELETE /api/customer/addresses/:id`

地址仅可由所属顾客读取或修改；首个地址自动设为默认地址，任意时刻每位顾客最多一个默认地址。

## 使用方法

1. 安装依赖: `npm ci`
2. 初始化数据库: `npm run init-db`
3. 启动服务器: `npm start`

服务器将运行在 http://localhost:3001
