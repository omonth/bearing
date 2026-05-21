# PRD: 顾客账户系统 —— 自注册、订单历史、积分、优惠券

**标签**: `ready-for-agent`

## 问题陈述

当前顾客下单只需填写姓名和手机号——每次购买都是"一次性"体验。CRM 系统已经完整构建了 CustomerService、CouponService、PointsService，但这些功能只对管理员开放。顾客无法：

- 查看自己的历史订单
- 使用积分或优惠券
- 注册账户或登录
- 跟踪订单物流状态

这导致复购率低、顾客粘性差，CRM 基础设施无法发挥价值。

## 解决方案

在现有 CRM 后端基础之上，为顾客端添加账户功能：

1. **顾客注册/登录**：通过手机号 + 验证码（或密码）注册和登录
2. **个人中心页面**：`/account` — 显示订单历史、积分余额、优惠券列表、等级信息
3. **下单关联账户**：已登录顾客下单自动关联账户，积分自动累积
4. **优惠券可见与使用**：结算时可选择可用优惠券

## 用户故事

1. 作为新客户，我想用手机号注册账户，以便我的购买记录被保存
2. 作为老客户，我想登录后查看我所有的历史订单，以便跟踪物流状态
3. 作为老客户，我想查看我的积分余额和会员等级，以便了解我的权益
4. 作为老客户，我想在结算时使用优惠券，以便获得折扣
5. 作为老客户，我想看到积分自动累积升级，以便享受更高的会员折扣
6. 作为顾客，我想追踪订单物流（待发货/已发货/已签收），以便我安排好收货

## 实现决策

### 模块修改

| 模块 | 变更 |
|------|------|
| `CustomerService` | 新增 `register(phone, password)`、`login(phone, password)`、`getByPhone` |
| `AuthService` | 新增顾客 JWT token 生成（与管理员 token 分离，role='customer'） |
| `middleware/auth.js` | `verifyToken` 现有已支持解码 token；`requireAuth` 检查 `req.user` 存在即可 |
| `src/store/` | 新增 `authStore`（顾客登录态管理，持久化 token） |
| `src/lib/api.ts` | 所有请求自动附带顾客 JWT token |
| `pages/account.tsx` | 新页面：个人中心（订单列表、积分、优惠券、等级） |
| `pages/login.tsx` | 新页面：顾客登录/注册 |
| `components/` | 修改 Cart 组件：结算时显示可用优惠券列表 |

### 架构决策

- **顾客 token 与管理员 token 用同一 JWT 机制**——payload 中 `role: 'customer'` vs `role: 'admin'`
- **手机号作为顾客唯一标识**——注册用手机号 + 密码，替代当前的匿名模式
- **向后兼容**：未登录顾客仍可下单（保持现有匿名下单行为）
- **优惠券列表在结算时从 CouponService 查询**：根据已登录顾客 ID 获取可用优惠券

### API 契约

新增 REST 端点：
- `POST /api/customer/register` — 注册（phone + password）
- `POST /api/customer/login` — 登录，返回 JWT
- `GET /api/customer/me` — 当前顾客信息（含积分、等级）
- `GET /api/customer/orders` — 我的订单列表
- `GET /api/customer/orders/:id` — 订单详情（含物流）
- `GET /api/customer/coupons` — 我的可用优惠券
- `POST /api/customer/coupons/use` — 使用优惠券

### 前端路由

- `/login` — 登录/注册页面
- `/account` — 个人中心（需登录）
- `/account/orders` — 我的订单
- `/account/orders/:id` — 订单详情

## 测试决策

### 好测试描述

- 测试注册新顾客返回 JWT token
- 测试重复手机号注册返回错误
- 测试登录后查询订单列表仅返回该顾客的订单
- 测试未登录访问 /account 重定向到 /login
- 测试使用过期优惠券返回错误
- 不测试前端 UI（由 E2E 测试覆盖）

### 测试先例

遵循 `test/auth.test.ts` 模式：内存 SQLite + supertest，测试顾客登录/注册端点。

## 超出范围

- 短信验证码注册（需要短信服务商，仅用密码注册）
- 密码重置（忘记密码）
- 微信/支付宝快捷登录
- 管理员后台审核注册

## 附加说明

- CRM 的 CustomerService 已有 `create`/`getById`/`update` 方法，`register` 是它们的薄封装
- 顾客下单关联逻辑：修改 `OrderService.create()` —— 若 `req.user` 存在且角色为 customer，自动关联 `customer_phone`
- 积分累积：下单成功后 `PointsService.addPoints()` 自动触发
- 本 PRD 将已有 CRM 后端能力暴露给顾客端，而非新建功能
