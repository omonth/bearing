# PRD: 拆分 CRM 路由模块 —— 提取 CustomerService / CouponService / PointsService

**标签**: `ready-for-agent`

## 问题陈述

当前 CRM 模块（`routes/crm.js`，522 行）是代码库中最大的 single-file god-module。单个文件包含：

- **8 张表的 DDL**（CREATE TABLE，含外键和索引）
- **种子数据**（5 条客户等级：bronze/silver/gold/platinum/diamond）
- **fire-and-forget 初始化**（`initCRMTables()` 在模块加载时被调用但不被 await）
- **14 个路由处理器**：客户 CRUD、积分操作、优惠券发放/兑换、客户互动、反馈管理、CRM 仪表盘
- **业务规则内联在路由处理器中**：等级自动升级逻辑嵌入加分路由（lines 275-284），优惠券有效期/类型计算嵌入兑换路由（lines 396-418）

这导致：

- 无法在不启动 Express 的情况下测试优惠券兑换规则
- 无法隔离测试客户等级自动升级逻辑
- GraphQL 的 CRM resolver（useCoupon、createCustomer 等）用内联 SQL 实现了不同版本——GraphQL 的 useCoupon 缺少日期校验和百分比折扣计算，与 REST 行为不一致
- DDL 全部是 PostgreSQL 语法（`SERIAL`、`ON CONFLICT DO NOTHING`），在 `DB_TYPE=sqlite` 下静默失败
- 初始化 race condition：CRM 表在首请求到达时可能尚未创建

## 解决方案

将 CRM 模块拆分为 3 个领域服务 + 1 个瘦路由模块，遵循 AuthService / BearingService / OrderService 的已建立模式。

### 模块：CustomerService（类，构造器注入 db）

**职责边界：**
- 客户 CRUD（创建、查询列表/详情、更新）
- 客户等级管理（自动升级/降级规则）
- 客户标签管理
- 客户互动记录
- 客户反馈管理（含回复）
- 客户搜索

**接口形状：** 返回 `{ data, error, status }`，与已有服务一致。

### 模块：CouponService（类，构造器注入 db）

**职责边界：**
- 优惠券 CRUD（创建、查询）
- 优惠券发放（批量分配给客户）
- 优惠券兑换（含有效性校验：日期范围、库存余量、最低订单金额、未使用状态）
- 折扣金额计算（fixed 类型 vs percentage 类型）

**接口形状：** 返回 `{ data, error, status }`。

### 模块：PointsService（类，构造器注入 db）

**职责边界：**
- 积分增减（含理由和关联订单）
- 积分记录查询
- 等级自动升级检查（积分达到阈值自动晋升，在 CustomerService 中触发）

**接口形状：** 返回 `{ data, error, status }`。

### 架构决策

- 遵循已完成模式：AuthService / BearingService / OrderService 的 DI 模式
- DDL 迁移到 `db/` 下的独立迁移文件（已有 `db/crm.sql`，可直接用于 Docker 初始化）
- 种子数据保留在服务中或移到 `initDatabase.js`
- `initCRMTables()` 的 fire-and-forget 改为在 `server.js` 中 await
- GraphQL CRM resolver 调用同一服务
- 路由处理器变薄：解析输入 → 调用服务 → 格式化输出

### GraphQL resolver 影响

以下 resolver 需要迁移到服务（约 8 个）：
- `customers`、`customer` → CustomerService
- `coupons` → CouponService
- `createCustomer`、`updateCustomer` → CustomerService
- `addPoints` → PointsService
- `createCoupon`、`issueCoupon`、`useCoupon` → CouponService

## 测试决策

### 好测试的描述

- 测试 CouponService.redeem() 返回正确的折扣金额，不关心 HTTP 层
- 测试固定金额优惠券和百分比优惠券的计算是否正确
- 测试过期优惠券返回特定错误
- 测试超量优惠券返回"已用完"错误
- 测试 PointsService.addPoints() 触发等级升级规则
- 不测试 Express 中间件或 HTTP 层（由功能测试覆盖）

### 哪些模块需要测试

- `CouponService` — 最关键的领域逻辑，6 种校验规则
- `CustomerService` — CRUD + 等级升级规则
- `PointsService` — 积分操作 + 升级触发

### 测试先例

遵循 `backend/test/auth.test.ts` 和 `backend/test/orders.test.ts` 的现有模式：使用内存 SQLite + 直接注入服务实例。

## 超出范围

- PaymentService 拆分为 ProviderInterface（独立 PRD）
- supplyChainService 对齐 DI 模式（独立 PRD）
- SQL 方言分支集中化（独立 PRD）
- 前端 CRM 管理界面（独立 PRD）

## 附加说明

- 此 PRD 源自 2026-05-21 架构审查的候选 #4 和 #2（CRM 是 GraphQL 不一致的主要来源之一）
- 提取后 `routes/crm.js` 将从 522 行缩减至约 50 行（仅路由组装）
- DDL 问题一次性解决：复用已有 `db/crm.sql` 文件，移除 `initCRMTables()`
- GraphQL useCoupon 的缺陷（缺少日期校验、百分比计算）在此次重构中修复
