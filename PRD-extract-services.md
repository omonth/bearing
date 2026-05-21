# PRD: 从内联路由处理器提取领域服务层

**标签**: `ready-for-agent`

## 问题陈述

当前轴承销售系统后端的约 500 行业务逻辑内联在 Express 路由处理器中（app.js 82–606 行）。订单创建、库存管理、认证、产品管理等核心业务规则与 HTTP 请求/响应对象耦合。这导致：

- 无法在不启动 Express 服务器的情况下测试订单创建等核心业务逻辑
- GraphQL 端点用内联 SQL 重新实现了同样的业务逻辑，两套实现行为不一致（例如 GraphQL 的 useCoupon 缺少日期校验和百分比计算）
- PaymentService 直接修改 `orders.status`，与 app.js 中的路由竞争订单状态控制权——没有单一的地方实施合法的状态转换
- 开发者修改业务逻辑时必须在 REST 和 GraphQL 两处同步变更

## 解决方案

从 app.js 内联路由处理器中提取三个领域服务模块：**OrderService**、**BearingService**、**AuthService**。每个服务以类实现，通过构造器注入 `db`（遵循 PaymentService / AIService / RecommendationEngine / InventoryAlert / Analytics 的已有模式）。路由处理器变为薄层：解析输入 → 调用服务 → 格式化输出。GraphQL resolver 调用相同的服务函数，消除重复实现。

提取后，REST 和 GraphQL 共享单一的业务逻辑真相源。后续可进一步提取 CustomerService / CouponService / PointsService（来自 CRM god 模块）和 PaymentProvider 接口体系（来自 PaymentService god 类）。

## 用户故事

1. 作为开发者，我想测试订单创建逻辑而不启动 HTTP 服务器，以便测试运行更快且更可靠
2. 作为开发者，我想在 REST 中修复的 bug 在 GraphQL 中自动生效，以便不需要在两边重复修复
3. 作为维护者，我想理解订单状态转换的合法路径集中在一处，以便修改时不会遗漏影响
4. 作为 AFK 代理，我想通过阅读一个模块理解完整的业务规则，以便不需要在 5 个文件间跳转来拼凑"创建订单"的完整逻辑
5. 作为开发者，我想新的 GraphQL mutation 自动继承 REST 的安全策略，以便不会因为忘了加认证检查而暴露管理员操作
6. 作为开发者，我想切换数据库供应商（SQLite → Postgres → MySQL）时不用修改服务层代码，以便适配器是唯一需要关心的接缝

## 实现决策

### 模块：OrderService（类，构造器注入 db）

**职责边界：**
- 订单创建（含库存校验、事务包裹、总价计算、缓存失效、通知发送）
- 订单状态转换（pending → paid → shipped → completed / cancelled），含合法转换验证
- 订单删除（含库存恢复 + 已支付订单保护）
- 批量状态更新
- 订单查询（列表、详情、状态历史）

**依赖：** 仅 `db`。不依赖 `req`/`res`。不直接操作 HTTP 响应。

**接口约定：** 所有方法返回 `{ data, error }` 形状，由调用者决定如何转换为 HTTP 响应。错误使用自定义 `OrderError` 类携带 `statusCode`。

### 模块：BearingService（类，构造器注入 db）

**职责边界：**
- 产品 CRUD（创建、查询列表/详情、删除）
- 库存管理（增/减库存，含校验）
- 产品搜索（全文 + 过滤 + 排序）
- 产品图片管理

**依赖：** 仅 `db`。

### 模块：AuthService（类，构造器注入 db）

**职责边界：**
- 登录验证（bcrypt 比对）
- Token 生成与验证
- 密码修改
- 当前用户查询

**依赖：** `db` + `JWT_SECRET`（通过配置对象传入）。

### 架构决策

- 遵循已有模式：所有现有服务（PaymentService、AIService、InventoryAlert、Analytics、RecommendationEngine）已通过构造器注入 `db`。本次提取使剩余路由处理器对齐此约定。
- REST 路由处理器变为薄层：调用 `orderService.create(...)` → 用 `res.json()` 或 `res.status().json()` 包装结果
- GraphQL rootValue resolver 调用同一服务实例：`orderService.create(...)` 替代内联 SQL
- OrderService 是订单状态变更的唯一入口。PaymentService 不再直接写入 `orders.status`——改为通过 OrderService 调用
- 先不改动 CRM 模块（已由独立候选跟踪）。本次 PRD 范围限于 app.js 中的内联路由 + GraphQL endpoint.js 中的重复逻辑

### API 契约

不引入外部 API 变更。所有 HTTP 端点保持现有行为。GraphQL schema 保持现有结构。变化仅限于内部实现——路由调用服务方法而非内联数据库查询。

## 测试决策

### 好测试的描述

- 测试 OrderService.createOrder() 返回正确的订单数据或正确的错误，不关心 HTTP 层
- 测试状态转换验证：pending → paid 合法，paid → pending 非法
- 测试库存不足时 OrderService 抛出特定错误
- 测试事务回滚失败时的行为
- 不测试 Express 中间件或 HTTP 层面（这些由现有 supertest 集成测试覆盖）

### 哪些模块需要测试

- `OrderService` — 最关键的领域逻辑，拥有状态转换不变量
- `BearingService` — CRUD + 库存管理
- `AuthService` — 登录/Token 生成

### 测试先例

代码库中已有 auth.test.ts（7 个测试）、orders.test.ts（10 个测试）、adapter.test.ts（7 个测试）。当前测试使用 supertest 调用 Express 应用。提取服务层后，新增的单元测试可直接实例化 `new OrderService(memoryDb)` 并调用方法——无需 supertest。

## 超出范围

- CRM 模块（routes/crm.js）的拆分——独立候选，不在本 PRD 范围内
- PaymentService 拆分为 ProviderInterface——独立候选
- supplyChainService 对齐构造器注入模式——独立候选
- SQL 方言分支集中化——独立候选
- GraphQL 认证中间件添加——可在提取服务后作为后续 PRD
- 前端改动——不涉及

## 附加说明

- 此 PRD 源自 2026-05-21 的架构审查报告（`architecture-review-20260521.html`），是该报告的首要建议
- 提取后的服务类应放置在 `backend/services/` 目录（与现有 PaymentService、AIService 等并列）
- 本次重构为纯机械操作：将现有逻辑按原样移入服务方法，不变更行为。验证方式为现有测试套件全量通过
