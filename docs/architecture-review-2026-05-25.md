# 架构审查 — bearing-sales

**日期：** 2026-05-25
**范围：** `backend/` (~4,900 行) · `src/` (~1,300 行) · `pages/` (~1,200 行)

---

## 术语

来自 LANGUAGE.md：**模块**（任何有接口+实现的事物）、**接口**（调用者必须知道的一切）、**实现**（内部代码）、**深度**（小接口背后的行为量）、**接缝**（可不原地编辑改变行为的地方）、**适配器**（接缝处的具体事物）、**杠杆**（调用者的收益）、**局部性**（维护者的收益）。

---

## 10 个架构深化候选

### 1. 折叠路由处理器中的双数据路径 [强烈]

**文件：** `backend/routes/analytics.js` `orders.js` `customer.js` `ai.js` `admin-products.js` `upload.js` `backend/services/orderService.js` `customerService.js` `bearingService.js`

**问题：** 6 个路由文件在调用服务的同时直接查询 `db`。接缝部分存在——无法通过仅模拟服务来测试路由。

**解决方案：** 将直接查询折叠到各自的服务中：`OrderService.exportPDF()`、`CustomerService.register()`、`AIService.recognizeImage()`。路由只调用服务。

**收益：**
- **局部性：** 业务规则集中在一处
- **接口即测试面：** 路由测试只需模拟服务
- **删除测试**通过：删除 `db.all` 复杂性不重现

```
之前:  路由 → 服务 + db（泄漏）
之后:  路由 → 服务 → db（接缝闭合）
```

### 2. 统一错误处理 — 三种模式化为一种 [强烈]

**文件：** `backend/app.js` `routes/*.js` (14 文件) `services/*.js` (14 文件) `utils/errors.js`

**问题：** `{ data, error, status }` 元组、裸 `throw` 和 `next(AppError)` 共存。错误处理器只能捕获第三种。

**解决方案：** 采用 `AppError` 类层次作为唯一错误传播约定。服务抛出，路由委托给 `next(err)`。

**收益：**
- **局部性：** 错误格式在一个地方决定
- **杠杆：** 所有 70+ 路由处理器从单个接缝获得错误格式化
- 消除整个 `{ data, error, status }` 解包样板

### 3. 分解结账页面 — 569 行巨石拆成三个可测试模块 [强烈]

**文件：** `pages/checkout.tsx` `src/components/` (新建: CartReviewStep, AddressFormStep, PaymentStep)

**问题：** 三个结账步骤、优惠券获取、表单验证和内联 CSS 类共存于一个 569 行的文件中。更改一个步骤可能会破坏另一个；无法独立测试步骤。

**解决方案：** 提取 `CartReviewStep`、`AddressFormStep`、`PaymentStep` 作为纯展示组件。结账页面变为编排器。共享的 `inputClass` 提取到共享模块。

**收益：**
- **局部性：** 表单验证只存在于 AddressFormStep
- **杠杆：** 每个步骤有一个接口，多个测试
- **可测试性：** 渲染每个步骤并独立交互
- 消除组件中的重复 `inputClass`

### 4. 将命令式获取器替换为 Zustand 响应式选择器 [强烈]

**文件：** `src/store/cartStore.ts` `checkoutStore.ts` `productStore.ts` `src/components/Header.tsx` `Cart.tsx` `pages/index.tsx` `checkout.tsx` `product/[id].tsx`

**问题：** `getTotalPrice()`、`getTotalCount()`、`getFinalPrice()` 是命令式函数，迫使组件订阅整个 store。`showCart` 每次切换都会导致所有消费者重渲染。

**解决方案：** 内联选择器：`useCartStore(s => s.items.reduce(...))`。组件仅在它们使用的状态片发生变化时重渲染。

**收益：**
- **杠杆：** 每个组件精确订阅所需内容
- **接口**缩小：存储调用者只暴露相关状态
- 消除由 `showCart` 切换导致的级联重渲染

### 5. 整合双令牌存储为单一真实源 [值得探索]

**文件：** `src/store/authStore.ts` `src/lib/api.ts`

**问题：** 令牌以两个不同的 localStorage 键（`"token"` 和 `"bearing-auth"`）冗余存储。`getAuthHeaders()` 绕过 Zustand store 直接读取，意外地使两个副本同步。

**解决方案：** 从 authStore 中移除手动 `setItem('token')` 调用。让 `getAuthHeaders()` 读取 `useAuthStore.getState().token`。

**收益：**
- **局部性：** 令牌生命周期仅存在于 authStore
- 移除跨模块同步 bug 类别
- **接口**缩小：一个接缝用于令牌存储

### 6. 通知服务——用 DI 替换内部单例 [值得探索]

**文件：** `backend/services/notificationService.js` `db/adapter.js`

**问题：** `notificationService` 内部调用 `getDatabase()`，而其他所有服务都通过构造函数接收 `db`。破坏了项目的 DI 模式，使其无法用测试数据库实例化。

**解决方案：** 将构造函数改为接受 `db`（如其他所有服务一样）。同时修复 `cleanOldNotifications` 中的 Postgres 专用 SQL（`INTERVAL '30 days'` → SQLite 兼容语法）。

**收益：**
- **接缝**变得真实：`new NotificationService(db)`
- **两个适配器证明接缝合理**：生产 + 测试
- 修复休眠的 SQL 方言 bug

### 7. 缓存失效管道——用手动线程替代事件接缝 [值得探索]

**文件：** `backend/server.js` `services/bearingService.js` `orderService.js` `middleware/cache.js`

**问题：** `clearCache` 函数从 `server.js` 手动线程化到 `BearingService` 和 `OrderService` 构造函数，再到每个突变方法。添加新的缓存服务需要级联修改。

**解决方案：** 在缓存中间件和服务之间引入一个接缝：缓存装饰器包装服务方法，或数据库写入时发起的缓存失效钩子。服务不再需要知道缓存。

**收益：**
- **杠杆：** 每个服务方法一个失效规则
- **局部性：** 缓存策略驻留在一个模块中
- 从服务构造函数中移除 `clearCache` 参数

### 8. 统一数据获取——结束 Store 绕过模式 [值得探索]

**文件：** `pages/checkout.tsx` `account.tsx` `src/components/ChatBot.tsx`

**问题：** `checkout.tsx` 和 `account.tsx` 直接调用 `getCustomerCoupons()`、`getCustomerOrders()`，绕过 stores。`ChatBot` 完全绕过 API 客户端。无法共享状态、无法缓存、没有一致的错误处理。

**解决方案：** 向 checkoutStore 添加优惠券列表获取，向 authStore 添加订单/优惠券状态。将 ChatBot SSE 提取到 `lib/api.ts` 或专用的 `useChatBot` hook。

**收益：**
- **杠杆：** 每个 API 端点一个入口
- **接口即测试面：** 测试 store 而非组件网络 I/O
- 页面间共享缓存数据

### 9. ProductStore 删除测试——透传还是发挥作用？ [推测性]

**文件：** `src/store/productStore.ts` `src/components/ProductList.tsx`

**问题：** `productStore` 几乎完全是透传：`fetchProducts()` → API，`setSelectedProduct()` → 设置状态。接口（76 行）几乎匹配实现。

**解决方案：** 运行真正的删除测试：如果直接用 API 调用和本地 `useState` 替换它，复杂性是消失还是分散？结果指导行动。

**收益：**
- 可能移除浅层模块
- **接口**成本降低：消除 5 个 store 方法
- 或确认 store 确实增加了价值

### 10. 死代码移除——未使用的中间件、服务和端点 [推测性]

**文件：** `backend/middleware/auth.js` `rateLimiter.js` `config/i18n.js` `services/websocketService.js` `routes/payment.js`

**问题：** 死代码膨胀接口，增加认知负荷，且违反了单一适配器接缝规则。

**死代码清单：**

| 模块 | 状态 |
|------|------|
| `optionalAuth` 中间件 | 定义于 auth.js，从未挂载 |
| `registerLimiter` / `productsLimiter` | 定义于 rateLimiter.js，从未使用 |
| i18n 中间件 | 完整的 i18next 设置，从未在 app.js 中连接 |
| `websocketService.initWebSocket` | 从未在 server.js 中调用；所有通知是死代码 |
| payment 重复查询端点 | `/query/:id` 和 `/status/:id` 功能相同 |
| payment 重复创建端点 | `POST /create` 和 `POST /checkout` 功能相同 |

**收益：**
- **接口**缩小：可见模块数量减少
- **局部性：** 维护者不再浪费时间追踪死路径
- 移除约 300 行未使用代码

---

## 首要建议

**从 #1 开始 —— 折叠路由处理器中的双数据路径。**

这是最广泛的结构性问题。6 个路由文件在调用服务层的同时直接查询 `db`。一半的接缝在发挥作用——你无法通过仅模拟服务来测试任何路由。这也是深化其他任何模块（Analytics、OrderService、CustomerService、AIService）的先决条件，因为那些服务在路由擅自查询 DB 时缺失了方法。

修复此问题将创建路线图上下一个候选的条件：**统一错误处理（#2）**，因为一旦路由不会因 DB 查询而分支，路由处理器就可以安全地统一为 `next(AppError)` 模式。

---

## 测试缺口汇总

| 模块 | 覆盖 |
|------|------|
| `services/couponService.js` | 无 |
| `services/supplyChainService.js` | 无 |
| `services/aiService.js` | 无 |
| `services/ragEngine.js` | 无 |
| `services/emailService.js` | 无 |
| `services/notificationService.js` | 无 |
| `services/websocketService.js` | 无 |
| `services/payment/PaymentOrchestrator.js` | 仅集成测试 |
| `services/payment/providers/*` | 无 |
| `middleware/cache.js` | 无 |
| `middleware/rateLimiter.js` | 无 |
| `middleware/upload.js` | 无 |
| `utils/inventoryAlert.js` | 无 |
| `utils/recommendation.js` | 无 |
| `utils/exportOrders.js` | 无 |
| `src/store/authStore.ts` | 无 |
| 所有 React 组件 | 无 |
