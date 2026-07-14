# 后端上下文

## 领域

轴承销售系统后端 API 服务。

## 核心概念

- **Bearing（轴承）** — 产品实体，含型号、规格（内径/外径/宽度）、库存、价格
- **Order（订单）** — 客户订单，含收货地址、订单项、状态流转
- **OrderItem（订单项）** — 订单中的单个产品及数量
- **Customer（客户）** — CRM 中的客户信息，含积分、等级、标签
- **Customer self-service（客户自助）** — 前台顾客本人使用的身份、订单、优惠券能力集合，不包含后台 CRM 管理
- **Coupon（优惠券）** — 折扣券，含类型、金额、使用条件
- **Payment（支付）** — 支付订单，支持支付宝/微信/银联（沙箱模式）

## 技术栈

- Express.js + SQLite3
- JWT 认证
- Multer 文件上传

## API 路由

- `/api/bearings` — 产品 CRUD
- `/api/orders` — 订单管理
- `/api/payment` — 支付集成
- `/api/crm` — 客户关系管理
- `/api/ai` — AI 智能服务
- `/api/upload` — 图片上传
