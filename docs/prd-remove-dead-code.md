# PRD: 死代码移除 + 通知服务 DI 对齐

**标签**: `ready-for-agent`

## 问题陈述

2026-05-25 架构审查的候选 #10 和 #6 识别了以下未使用代码和 DI 不一致问题，两者合并处理以减少协调开销：

### A. 死代码清单（候选 #10）

| 模块 | 状态 |
|------|------|
| `optionalAuth` 中间件 | 定义于 `middleware/auth.js`，从未在任何路由挂载 |
| `registerLimiter` 速率限制器 | 定义于 `middleware/rateLimiter.js`，从未使用 |
| `productsLimiter` 速率限制器 | 同上 |
| i18n 中间件 | `config/i18n.js` 完整的 i18next 设置，从未在 `app.js` 中连接（后端已有独立的 i18n 方案） |
| `websocketService.initWebSocket` | 从未在 `server.js` 中调用；所有通知是死代码 |
| payment 重复查询端点 | `GET /query/:id` 与 `GET /status/:id` 功能相同（已在 `prd-harden-payment-surface.md` 中规划移除） |
| payment 重复创建端点 | `POST /create` 与 `POST /checkout` 功能相同（同上） |

### B. 通知服务 DI 缺口（候选 #6）

`notificationService` 是唯一一个**内部调用 `getDatabase()`** 而不通过构造器注入 `db` 的服务：

```javascript
// 当前：notificationService.js 内部单例
const db = getDatabase();  // 全局单例，无法替换为测试数据库

// 同时存在 Postgres 专用 SQL
await db.run("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'");
// ↑ SQLite 下静默失败，INTERVAL 语法不兼容
```

其他所有 11 个服务类均已通过构造器注入 `db`——notificationService 是最后的例外。

## 解决方案

### 阶段一：移除死代码（纯删除，零风险）

**1. 删除 `optionalAuth` 中间件**
- 从 `middleware/auth.js` 中移除 `optionalAuth` 函数定义
- 替代方案：保留并挂载到 GraphQL 端点（由 `PRD-graphql-auth.md` 覆盖）

**2. 删除未使用的速率限制器**
- 从 `middleware/rateLimiter.js` 中移除 `registerLimiter` 和 `productsLimiter` 的创建和导出
- 保留 `generalLimiter`（已挂载在 `app.js` 的 `/api/` 路由上）

**3. 删除未连接的 i18n 中间件**
- 移除 `config/i18n.js` 文件
- 移除 `backend/package.json` 中的 `i18next` 相关依赖（若仅此文件使用）

**4. 删除 websocketService 死代码**
- 从 `services/websocketService.js` 中移除 `initWebSocket(server)` 方法
- 或：若通知功能计划在未来启用，标记为 `@deprecated` 并添加注释指向对应 PRD
- `server.js` 中不调用，无影响

**5. Payment 重复端点**
- 已在 `docs/prd-harden-payment-surface.md` 中规划，本 PRD 不再重复

### 阶段二：notificationService DI 对齐 + SQL 方言修复

**转换 notificationService 为类：**

```javascript
// 之前：函数模块 + 全局 getDatabase()
class NotificationService {
  // 无构造器，内部调用 getDatabase()
}

// 之后：构造器注入 db
class NotificationService {
  constructor(db) {
    this.db = db;
  }
  // 所有方法用 this.db 替代 getDatabase()
}
```

**修复 `cleanOldNotifications` 中的 SQL 方言 bug：**

```javascript
// 之前：Postgres 专用（SQLite 下静默失败）
await db.run("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'");

// 之后：使用适配器的 dateInterval 方法（若已实施 prd-sql-dialect-centralize.md）
const cutoff = this.db.dateInterval('-30 days');
await this.db.run(`DELETE FROM notifications WHERE created_at < ${cutoff}`);
// 或：手动兼容
const cutoff = this.db.type === 'postgres'
  ? "NOW() - INTERVAL '30 days'"
  : "datetime('now', '-30 days')";
```

**`server.js` 中实例化：**

```javascript
const notificationService = new NotificationService(db);
// 与其他 11 个服务并列
```

## 用户故事

1. 作为开发者，我想 `backend/` 目录中没有从未调用的代码，以便阅读代码时不被死路径误导
2. 作为新加入的开发者，我想所有服务遵循相同的构造器注入模式，以便我可以不查文档直接理解依赖关系
3. 作为维护者，我想 SQL 方言 bug 被修复，以便生产环境切换到 Postgres 时通知清理不会静默失败
4. 作为测试者，我想用内存 SQLite 测试通知逻辑，以便不需要真实的数据库连接

## 实现决策

### 受影响文件

| 文件 | 变更类型 |
|------|---------|
| `middleware/auth.js` | 删除 `optionalAuth` 函数（~15 行） |
| `middleware/rateLimiter.js` | 删除 `registerLimiter`、`productsLimiter`（~20 行） |
| `config/i18n.js` | 删除整个文件（~30 行） |
| `services/websocketService.js` | 标记 `initWebSocket` 为 deprecated 或删除 |
| `services/notificationService.js` | 重构为类 + 构造器注入 `db` + 修复 SQL 方言 |
| `server.js` | `new NotificationService(db)` 替代 `require` 调用后的独立函数使用 |
| `routes/notification.js` 或调用处 | 更新为接收 notificationService 实例 |

### 架构决策

- **删除优先于标记**：死代码在 git 历史中可恢复。标记 `@deprecated` 仅在"计划在未来 2 周内启用"时使用
- **通知服务的 `notify()` 方法**：当前 3 个位置调用（订单创建、支付成功、库存预警）。保持调用签名不变
- **`cleanOldNotifications` 保留但修复**：该方法被 `initDatabase.js` 中的定时清理调用，是活代码
- **Payment 重复端点不在本 PRD 删除**：已在 `prd-harden-payment-surface.md` 中独立规划

### 死代码判断标准

满足以下任一条件 → 删除：
- 函数/变量被定义但从未被调用或导出
- 文件在 `require` 链中无引用
- 中间件在 `app.js` 中无挂载

不删除：
- `app.js` 中挂载的中间件（即使当前所有路由都跳过验证——中间件可选择性应用）
- 测试辅助文件
- 被其他活代码引用的模块

## 测试决策

### 好测试的描述

- 删除前后：27 个后端测试全部通过——证明删除不影响任何功能
- notificationService：`create()` 创建通知 → `getByUser()` 返回该通知
- notificationService：`cleanOldNotifications()` 清理超过 30 天的通知，保留近期通知
- SQLite 和 Postgres 双环境下 `cleanOldNotifications` 不报错
- 不测试被删除的代码（删除后无测试目标）

### 测试先例

- notificationService 测试遵循现有模式：内存 SQLite + 直接实例化 `new NotificationService(db)`
- 删除验证：全量测试套件 `npm test` 通过即确认无功能回归

## 超出范围

- Payment 重复端点删除（独立 PRD：`prd-harden-payment-surface.md`）
- WebSocket 通知功能的实际实现和挂载
- i18n 中间件的重新设计和挂载（如需 i18n，后端已有 `locales/` 资源文件的独立方案）
- 其他未使用依赖的清理（`depcheck` 扫描）

## 附加说明

- 此 PRD 合并了 2026-05-25 架构审查的候选 #10（死代码移除，推测性）和候选 #6（通知服务 DI 对齐，值得探索）
- 死亡代码总计约 **300 行**——这些代码在仓库中存在但从未被执行
- notificationService 的 SQL 方言 bug 是休眠 bug——开发环境用 SQLite 时被静默吞掉，生产切 Postgres 才暴露
- 架构审查原话："死代码膨胀接口，增加认知负荷，且违反了单一适配器接缝规则"
- 删除操作不可逆（执行前建议确认无外部引用）。git 历史保留完整记录
