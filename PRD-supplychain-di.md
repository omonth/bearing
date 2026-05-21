# PRD: supplyChainService 对齐构造器注入模式

**标签**: `ready-for-agent`

## 问题陈述

supplyChainService 是代码库中唯一不遵循 DI 模式的服务。所有导出的函数（15 个）在函数体开头调用 `const db = getDatabase()`，从全局单例获取数据库连接——而其他所有 11 个服务类都通过构造器注入 `db`。

这导致：
- 无法用内存 SQLite 测试供应链逻辑——它绑定到全局数据库单例
- 与其他服务的模式不一致——新开发者阅读代码时需要理解为什么供应链特殊
- 15 次冗余的 `getDatabase()` 调用（函数内部、模块级）

## 解决方案

将 supplyChainService 从**导出函数的模块**转为**接受 `db` 的类**，与其他服务对齐：

```
// 当前：独立函数，内部调用 getDatabase()
module.exports = { getSuppliers, createSupplier, ... }

// 目标：类，构造器注入 db
class SupplyChainService {
  constructor(db) { this.db = db; }
  async getSuppliers(status) { ... }
  async createSupplier(data) { ... }
}
```

同时为每个 catch 块加 `logger.error()` 和 `error.message` 透传（当前供应链路由吞掉了所有错误细节，客户端只看到 `'创建采购订单失败'`）。

## 用户故事

1. 作为开发者，我想用测试数据库测试供应链逻辑，以便不需要真实的数据库连接
2. 作为新加入的开发者，我想供应链服务的模式和其他 11 个服务一致，以便我可以迅速理解代码约定
3. 作为维护者，我想在供应链操作失败时看到真实的错误信息，以便我能迅速诊断问题

## 实现决策

### 模块转换

| 当前（函数） | 目标（方法） |
|---|---|
| `getSuppliers(status)` | `this.db` 替代 `getDatabase()` |
| `createSupplier(data)` | 同上 |
| `updateSupplier(id, data)` | 同上 |
| `getPurchaseOrders(query)` | 同上 |
| `getPurchaseOrder(id)` | 同上 |
| `createPurchaseOrder(data)` | 同上 |
| `updatePurchaseOrderStatus(id, status)` | 同上 |
| `getStockInRecords(query)` | 同上 |
| `createStockIn(data)` — FIFO 成本 | 同上 |
| `getStockOutRecords(query)` | 同上 |
| `createStockOut(data)` — FIFO 出库 | 同上 |
| `getProductCost(bearingId)` | 同上 |
| `getProfitAnalysis(startDate, endDate)` | 同上 |

### 架构决策

- 类名 `SupplyChainService`，文件重命名保持 `supplyChainService.js`（与 import 语句一致）
- `server.js` 中实例化：`new SupplyChainService(db)`，与其他服务并列
- 供应链路由接受 `supplyChainService` 实例
- 13 处 `const db = getDatabase()` 替换为 `this.db`
- 每个 catch 块加 `logger.error()` + 响应体中包含 `error.message`

### 接口契约

与其他服务一致：每个公开方法返回 `{ data, error, status }`。

## 测试决策

不需要新增测试文件——改动为纯机械重构（替换 `getDatabase()` → `this.db`），行为不变。由现有集成测试验证。

## 超出范围

- 供应链路由的错误处理国际化——独立 PRD
- 供应链功能的前端界面——独立 PRD
- 为 supplyChainService 编写单元测试——独立 PRD

## 附加说明

- 此 PRD 源自 2026-05-21 架构审查的候选 #6
- 改动为纯机械重构——所有函数体不变，仅替换数据库访问方式和错误处理
- 同时修复架构审查的候选 #11（供应链路由吞掉错误）
