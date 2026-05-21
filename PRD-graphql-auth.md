# PRD: GraphQL 端点添加认证中间件

**标签**: `ready-for-agent`

## 问题陈述

GraphQL 端点（`/graphql`）当前无任何认证检查。任何人均可在未登录的情况下执行管理员操作：

- `mutation { deleteBearing(id:1) { success } }` — 无需 token 即可删除产品
- `mutation { updateOrderStatus(orderId:1, status:"cancelled") }` — 无需 token 修改订单状态
- `mutation { deleteBearing(id:1) { success } }` — 无需 token 删产品

对比 REST API：所有管理员端点均有 `verifyToken` + `requireAdmin` 中间件。GraphQL 层是唯一越过安全边界的入口。

## 解决方案

在 GraphQL 端点添加 `verifyToken` 中间件，在 resolver 层对管理员操作添加 `requireAdmin` 检查。

两层防护：
1. **端点级**：`/graphql` 路由加 `verifyToken`——拒绝未认证请求
2. **Resolver 级**：管理员 mutation（deleteBearing、updateOrderStatus 等）额外检查 `requireAdmin`

公开查询（bearings、categories、hotProducts 等）无需认证，保持现有行为。

### Resolver 分级

**公开（无需认证）：**
bearings、bearing、categories、search、hotProducts、newProducts、similarProducts、demandPredictions、demandPrediction、salesForecast、chat

**需认证但非管理员：**
createOrder、createPayment、useCoupon

**需管理员：**
所有其他 mutation + orders、customers、customer、coupons、payments、payment、dashboard、addBearing、deleteBearing、updateStock、createCustomer、updateCustomer、addPoints、createCoupon、issueCoupon、updateOrderStatus、simulatePayment、createRefund

## 用户故事

1. 作为系统管理员，我不想未登录的用户通过 GraphQL 删除产品数据
2. 作为普通客户，我想能查询轴承产品和下订单（无需管理员权限）
3. 作为开发者，我想理解每个 GraphQL 操作的权限要求，不依赖隐式约定

## 实现决策

### 架构决策

- `verifyToken` 作为 Express 中间件挂载在 `/graphql` 路由上（与 REST 端点一致）
- 对于公开查询：`verifyToken` 设为可选模式——有 token 则解析用户，无 token 则 `req.user = null`
- Admin mutation 的 resolver 函数检查 `if (!req.user || req.user.role !== 'admin') throw new Error('需要管理员权限')`
- 或者更简单：将 Schema 拆为两个端点——`/graphql`（公开，无需认证）和 `/graphql/admin`（需 verifyToken + requireAdmin）。但这需要客户端知道两个 URL，且会产生重复 schema。

推荐方案：**单端点 + verifyToken 中间件 + 公开 query 豁免**。修改 `verifyToken` 为可选模式（不强制要求 token），resolver 内部按需检查权限。

简化版：不对 `verifyToken` 做改动。直接创建一个新的 `optionalAuth` 中间件，有 token 就解析，没有就继续。公开 resolver 不管 `req.user`，管理员 resolver 检查 `req.user?.role === 'admin'`。

### 实现步骤

1. 创建 `middleware/auth.js` 中的 `optionalAuth` 中间件
2. 修改 `app.js` 中 GraphQL 挂载：`app.use('/graphql', optionalAuth, createGraphQLEndpoint(...))`
3. 修改 GraphQL resolver：管理员操作检查 `context.user?.role === 'admin'`
4. GraphQL endpoint 的 `createGraphQLMiddleware` 接收 `req` 对象中的 `user`

## 测试决策

无需新增测试文件——REST 端点的认证测试已验证 `verifyToken` 和 `requireAdmin` 中间件正确。GraphQL 认证行为由手动验证测试。

## 超出范围

- GraphQL rate limiting
- GraphQL query depth/complexity limiting
- 按字段级别的权限控制

## 附加说明

- 此 PRD 源自 2026-05-21 架构审查的候选 #14
- 路由拆分方案（公开/管理员两个端点）会增加维护成本，两套 schema 需要同步
- `optionalAuth` 中间件可复用于其他需要"可选登录"的场景
