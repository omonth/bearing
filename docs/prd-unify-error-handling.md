# PRD: 统一错误处理 —— 三种模式化为一种

**标签**: `ready-for-agent`

## 问题陈述

代码库当前有三套共存且互不兼容的错误传播约定：

| 模式 | 示例 | 使用位置 |
|------|------|----------|
| `{ data, error, status }` 元组 | `return { data: null, error: "库存不足", status: 400 }` | OrderService, BearingService, CouponService, PointsService, CustomerService |
| 裸 `throw` | `throw new Error("订单不存在")` | PaymentOrchestrator, supplyChainService, AIService, utils |
| `next(AppError)` | `next(new AppError("未授权", 403))` | 仅少数路由处理器，`app.js` 中已定义但未全面使用 |

结果：
- 全局错误处理器只能捕获第三种（`next(AppError)`）。前两种要么返回不一致的 JSON 形状，要么 crash 为 500。
- 每个调用点都必须解包 `{ data, error }`——路由中重复 70+ 次相同的 `if (result.error) return res.status(result.status).json({ error: result.error })`。
- `AppError` 类（`utils/errors.js`）已定义构造函数 `(message, statusCode, code)` 但仅 3 个文件使用。

## 解决方案

采用 **AppError 类层次**作为唯一错误传播约定。服务只 throw，路由委托给 `next(err)`，全局错误处理器统一格式化。

```
之前:  服务返回 { data, error, status } → 路由解包 → res.json
       服务 throw Error → 路由 try/catch → res.status(500)
       next(AppError) → 全局处理器

之后:  服务 throw AppError → 路由不捕获 → next(err) → 全局处理器统一格式化
```

### AppError 类层次

```javascript
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;  // 区分编程 bug vs 预期错误
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'resource') {
    super(`${resource}不存在`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未登录') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = '无权限') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}
```

### 全局错误处理器

```javascript
// 已存在于 app.js，需增强
app.use((err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.field && { field: err.field }),
    });
  }
  // 编程 bug：记录完整堆栈，返回通用 500
  logger.error('Unhandled error', { stack: err.stack, path: req.path });
  res.status(500).json({ error: '服务器内部错误', code: 'INTERNAL_ERROR' });
});
```

## 用户故事

1. 作为开发者，我想在服务中 `throw new NotFoundError('订单')` 并获得一致的 404 JSON，无需手动构造 `{ data, error, status }`
2. 作为维护者，我想全局错误处理器捕获所有错误，以便不再有裸 `Error` 导致 500 crash
3. 作为 AFK 代理，我想仅通过阅读 AppError 类了解所有可能的错误形状，以便生成正确的客户端错误处理代码
4. 作为前端开发者，我想每个错误响应包含 `code` 字段，以便客户端可以精确判断错误类型而不依赖中文消息文本

## 实现决策

### 受影响文件

| 文件 | 变更 |
|------|------|
| `utils/errors.js` | 从当前基础 AppError 扩展为完整类层次 |
| `app.js` | 增强全局错误处理器；移除路由中的 try/catch 样板 |
| `services/orderService.js` | `return { data, error, status }` → `throw new AppError(...)` |
| `services/bearingService.js` | 同上 |
| `services/customerService.js` | 同上 |
| `services/couponService.js` | 同上 |
| `services/pointsService.js` | 同上 |
| `services/authService.js` | 同上 |
| `services/PaymentOrchestrator.js` | 替换裸 `throw new Error(...)` 为 AppError |
| `services/supplyChainService.js` | 同上（同步完成 DI 重构后） |
| `services/aiService.js` | 同上 |
| `routes/*.js` (14 文件) | 移除 try/catch + 解包样板；路由处理器变为 `const data = await service.method(...); res.json({ data })` |
| `graphql/endpoint.js` | resolver 用 try/catch 包装，将 AppError 转为 GraphQL errors |

### 架构决策

- **服务只 throw，永不返回错误元组**：`{ data, error, status }` 从代码库中彻底消除
- **`isOperational` 标志**：区分预期错误（如库存不足）和编程 bug（如 `undefined.foo`），前者返回结构化 JSON，后者返回通用 500 + 日志
- **GraphQL 层**：resolver 内 try/catch，`AppError` → `throw new GraphQLError(err.message, { extensions: { code: err.code, statusCode: err.statusCode } })`
- **向后兼容**：HTTP 响应形状保持 `{ error: string }` 不变，新增 `code` 字段为可选
- **不改动前端**：本次重构不要求前端适配新错误格式——HTTP 状态码和 `error` 字段保持现有约定

### 迁移策略

分三步逐步替换（每个步骤独立可合并、独立可回滚）：

1. **增强 AppError 类 + 全局处理器**（不影响现有行为）
2. **逐个服务迁移**：OrderService → BearingService → AuthService → CustomerService → CouponService → PointsService → PaymentOrchestrator → supplyChainService → AIService。每个服务的现有测试必须全量通过
3. **清理路由样板**：移除所有 `if (result.error)` 解包和 try/catch，改为 `next(err)` 委托

## 测试决策

### 好测试的描述

- 测试 `throw new NotFoundError('订单')` 在全局处理器中产生 `{ error: "订单不存在", code: "NOT_FOUND" }` + 状态码 404
- 测试 `throw new ValidationError('库存不足', 'quantity')` 产生 `{ error: "库存不足", code: "VALIDATION_ERROR", field: "quantity" }` + 状态码 400
- 测试非 AppError（如 `TypeError`）产生通用 500 且不泄露堆栈
- 每个服务方法的测试：验证"失败路径抛 AppError 而非返回 `{ data: null, error }`"
- 不测试 Express 中间件本身（由已有集成测试覆盖 HTTP 响应形状）

### 测试先例

- 新增 `test/errors.test.ts`：测试 AppError 类层次和全局处理器
- 修改现有 `test/orders.test.ts`：`expect(() => service.createOrder(...)).toThrow(AppError)`
- 遵循已有测试模式：内存 SQLite + 直接实例化服务

## 超出范围

- GraphQL 错误格式重构（本 PRD 仅让 AppError 被 GraphQL 层捕获并包装为 GraphQLError）
- 客户端错误处理国际化（仅在后端提供 `code` 字段）
- Apollo Server 迁移或 GraphQL 中间件替换
- 前端错误提示的 UX 改造

## 附加说明

- 此 PRD 源自 2026-05-25 架构审查的候选 #2（强烈建议）
- 架构审查原话："采用 `AppError` 类层次作为唯一错误传播约定。服务抛出，路由委托给 `next(err)`"
- 审查指出此任务是 #1（提取服务层）之后的下一个逻辑步骤——一旦路由不再直接访问 DB，就可以安全统一为 `next(AppError)` 模式
- 消除约 200 行重复的 `if (result.error)` 样板代码
- `AppError.isOperational` 模式参考 Node.js 最佳实践（区分操作错误 vs 程序员错误）
- 迁移期间两套模式共存：已迁移的服务 throw，未迁移的仍返回元组。路由通过检查返回值类型做兼容处理
