# PRD: 集中化 SQL 方言分支到数据库适配器

**标签**: `ready-for-agent`

## 问题陈述

当前数据库适配器（`db/adapter.js`）已将占位符转换（`?` → `$N`）集中化——但对**时间表达式**未做同样处理。每个需要日期运算的模块必须手动分支 `this.db.type === 'postgres' ? ... : ...`：

- `utils/analytics.js` — 6 处重复
- `utils/inventoryAlert.js` — 3 处重复
- `services/aiService.js` — 2 处重复
- `utils/recommendation.js` — 1 处重复

共计 **13 处相同模式**复制在 4 个文件中。例如：

```javascript
// analytics.js line 56
const interval = this.db.type === 'postgres'
  ? "date_trunc('day', created_at)"
  : "date(created_at)";
```

如果新增 MySQL 方言，需在 4 个文件中各自添加分支——而非改一个适配器。

## 解决方案

在适配器上暴露两个日期辅助方法，消灭所有 13 处分支：

```
db.dateTrunc(granularity, column) — 返回数据库合适的日期截断表达式
db.dateInterval(column, days) — 返回"N 天前"的时间表达式
```

**使用前：**
```javascript
const interval = this.db.type === 'postgres'
  ? "date_trunc('day', created_at)"
  : "date(created_at)";
const query = `SELECT ${interval} as day, COUNT(*) ... FROM orders WHERE created_at >= datetime('now', '-90 days') GROUP BY day`;
```

**使用后：**
```javascript
const dayExpr = this.db.dateTrunc('day', 'created_at');
const sinceExpr = this.db.dateInterval('-90 days');
const query = `SELECT ${dayExpr} as day, COUNT(*) FROM orders WHERE created_at >= ${sinceExpr} GROUP BY ${dayExpr}`;
```

### 接口形状

```typescript
interface DbAdapter {
  // 现有
  all(sql, params): Promise<Row[]>
  get(sql, params): Promise<Row|null>
  run(sql, params): Promise<{lastID, changes}>
  transaction(cb): Promise<any>

  // 新增
  dateTrunc(granularity: 'day'|'hour'|'month'|'year', column: string): string
  dateInterval(offset: string): string     // '-90 days', '-30 days' 等
  dateNow(): string                        // 当前时间戳，方言无关
}
```

Postgres 实现：`dateTrunc('day', 'col')` → `"date_trunc('day', col)"` , `dateInterval('-90 days')` → `"NOW() - INTERVAL '90 days'"`

SQLite 实现：`dateTrunc('day', 'col')` → `"date(col)"` , `dateInterval('-90 days')` → `"datetime('now', '-90 days')"`

## 用户故事

1. 作为开发者，我想在新增 MySQL 方言时只修改适配器，不需要在 4 个业务文件中各自加分支
2. 作为维护者，我想在一次代码审查中理解日期表达式逻辑，不需要在 13 处分散的分支中跳转
3. 作为 AFK 代理，我想通过适配器接口判断哪些 SQL 特性是跨数据库的，哪些不是

## 实现决策

### 模块修改

- **`db/adapter.js`** — 在 `initDatabase()` 中为 Postgres 和 SQLite 分别实现 `dateTrunc` / `dateInterval` / `dateNow` 方法，挂载到 `db` 对象上
- **`utils/analytics.js`** — 6 处 `this.db.type === 'postgres'` 替换为 `this.db.dateTrunc()` / `this.db.dateInterval()`
- **`utils/inventoryAlert.js`** — 3 处替换
- **`services/aiService.js`** — 2 处替换
- **`utils/recommendation.js`** — 1 处替换

### 架构决策

- 日期辅助方法直接挂载在 `db` 对象上，与 `all`/`get`/`run` 同级
- 不需要新增 `require` 或构造器参数——现有服务通过 `this.db` 直接调用
- `dateInterval` 接受类似 `'-90 days'`、`'-30 days'`、`'-1 year'` 的字符串，适配器内部转换为正确的 SQL

## 测试决策

### 好测试描述

- 测试 Postgres 适配器的 `dateTrunc('day', 'col')` 返回 `"date_trunc('day', col)"`
- 测试 SQLite 适配器的 `dateTrunc('day', 'col')` 返回 `"date(col)"`
- 测试 `dateInterval('-90 days')` 在两种方言下返回正确表达式
- 不测试实际数据库查询结果（由集成测试覆盖）

### 测试先例

已有 `test/adapter.test.ts` 测试适配器接口——可在同一文件中添加日期方法的单元测试。

## 超出范围

- 适配器的 DDL 抽象层（`createTable` builder）——独立 PRD
- MySQL 方言支持——独立 PRD
- 升级现有 ORM 或查询构建器——独立 PRD
- 其他在 `analytics.js` / `aiService.js` 中使用的 SQL 差异（如 `GROUP BY` 行为、`CASE WHEN` 语法）——可按需追加

## 附加说明

- 此 PRD 源自 2026-05-21 架构审查的候选 #5
- 改动为纯机械重构——替换模式不改变行为
- 受影响的文件数量少，改动范围明确，适合 AFK 代理实现
- `dateInterval` 字符串格式参考 SQLite 的 modifiers 语法（`'-90 days'`），适配器内部转换为 Postgres 的 `INTERVAL` 语法
