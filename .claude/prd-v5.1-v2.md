## 问题陈述

轴承销售系统 v5.0 已完成后端核心服务重构（服务层提取、支付多Provider、CRM拆分、SQL方言统一、GraphQL认证），但存在以下不足：

1. **缺少管理后台前端** — admin 功能仅通过静态 HTML 页面和 API 调用，运营效率低
2. **测试覆盖不足** — 仅 27 个后端测试和 3 个前端 store 测试，无 e2e
3. **代码质量待提升** — Express 4 旧版、app.js 内联路由、GraphQL 未删、TypeScript strict 关闭
4. **缺少智能功能** — 客服是规则匹配假 AI，产品仅有 6 条种子数据
5. **未达生产标准** — 无 HTTPS、前台硬编码中文、安全配置默认值、无响应式

## 解决方案

分 5 个阶段将系统从内部工具提升到可上线的生产级电商平台。**执行顺序：E → B → C → D → A**（后端重构先行，为管理后台提供干净的 API 基础）。

- **E 阶段**：代码质量与架构升级（Express 5、Router 全拆、GraphQL 删除、Error middleware、OrderService 批量端点）
- **B 阶段**：独立 Vite + React 管理后台（5 个模块：auth、products、orders、dashboard、shared）
- **C 阶段**：测试补齐（后端 API + store 单元 + Playwright e2e 3 条 happy path + 支付沙箱测试）
- **D 阶段**：RAG 智能客服（DeepSeek + SQLite 向量存储）+ 精选 50 个真实轴承数据 + 前台 i18n + 支付测试
- **A 阶段**：生产安全加固 + HTTPS + 响应式适配

### 架构概述

```
bearing-sales/
  backend/          (Express 5 API)
  src/ + pages/     (Next.js 前台)
  admin/            (Vite + React 管理后台 — 新)
```

管理后台为**独立 Vite + React SPA 项目**，与前台 Next.js 完全分离。共享类型在 C 阶段后通过 npm workspaces 统一管理。

## 用户故事

### E 阶段 — 后端重构

1. 作为开发者，我希望 Express 升级到 v5 并获得原生 async 错误处理，以便减少中间件依赖
2. 作为开发者，我希望 app.js 内联路由全拆为独立 Router 文件，以便代码可维护
3. 作为开发者，我希望 GraphQL 端点及其依赖完全删除，以便消除 REST/GraphQL 双维护负担
4. 作为开发者，我希望所有错误通过统一 error middleware 处理，以便一致的错误响应格式
5. 作为开发者，我希望 OrderService 支持批量状态更新（批量发货/取消），以便管理后台一次操作多个订单
6. 作为运维，我希望生产环境错误不泄露堆栈，统一走 Winston 日志

### B 阶段 — 管理后台

7. 作为管理员，我通过账号密码登录管理后台，进入后看到侧边栏导航和面包屑
8. 作为管理员，我在商品列表搜索、筛选、分页浏览所有轴承产品
9. 作为管理员，我通过弹窗表单新增商品（含图片上传和裁剪）
10. 作为管理员，我点击商品行快速修改价格和库存（行内编辑，失焦保存）
11. 作为管理员，我删除不需要的商品
12. 作为管理员，我在订单列表按状态/日期/客户筛选订单
13. 作为管理员，我点击"发货"按钮将订单状态改为已发货
14. 作为管理员，我批量选择订单并批量发货或取消
15. 作为管理员，我导出订单为 Excel / 单个订单为 PDF
16. 作为管理员，我点击订单行打开侧拉抽屉查看订单详情和状态历史
17. 作为管理员，我看到 4 个统计卡片（总销售额/总订单/总客户/本月收入）
18. 作为管理员，我看到销售趋势折线图（按日）和分类销售占比饼图
19. 作为管理员，我看到热销商品排行榜 Top 10 和库存预警列表
20. 作为管理员，我看到实时订单滚动通知（WebSocket 推送）
21. 作为管理者，管理后台仅提供中文界面（内部工具，无需国际化）

### C 阶段 — 测试

22. 作为开发者，我希望后端 admin API（商品CRUD、订单管理、批量操作、数据分析）有自动化测试
23. 作为开发者，我希望 adminAuthStore 的 token 生命周期有单元测试
24. 作为开发者，我希望 adminApi 的响应格式转换有单元测试
25. 作为开发者，我希望有一条 e2e happy path：登录→商品CRUD→订单管理
26. 作为开发者，我希望有一条 e2e happy path：登录→看板加载→订单发货
27. 作为开发者，我希望有一条 e2e happy path：登录→批量操作（选择多个订单→批量发货）
28. 作为开发者，我希望 Sandbox 支付完整流程有自动化测试（创建→模拟支付→回调→订单状态同步→退款）
29. 作为开发者，我希望关键业务路径有测试覆盖：订单创建库存扣减事务、优惠券使用校验

### D 阶段 — 智能客服

30. 作为顾客，我在前台右下角打开智能客服悬浮气泡，用自然语言询问轴承型号推荐和规格咨询
31. 作为顾客，我看到 AI 回答以逐字流式输出
32. 作为管理员，我在管理后台右下角打开 AI 助手悬浮气泡，用自然语言查询销售数据和库存状况（如"今天卖了多少"、"哪些型号缺货"）
33. 作为开发者，我希望 LLM 回答基于真实商品和订单数据（RAG，Embedding 索引），而非规则匹配
34. 作为开发者，我希望向量存储在 SQLite 中，使用余弦相似度检索，无需额外数据库依赖

### D 阶段 — 产品数据

35. 作为运营，系统内置精选 50 个常用轴承型号的真实规格数据（内径/外径/宽度/材质）
36. 作为国际客户，产品名称和描述同时有中英文（JSON 多语言字段 {"zh":"...", "en":"..."}）
37. 作为顾客，我看到产品有准确的型号和规格参数，以便做出采购决策
38. 作为开发者，产品规格（尺寸、载荷、转速）保留数值+单位，不做翻译

### D 阶段 — 国际化

39. 作为中文用户，我看到前台 UI 为中文界面
40. 作为英文用户，我切换到英文后看到翻译后的界面和按钮文本
41. 作为顾客，我在 Header 点击中/英切换按钮即可切换语言

### A 阶段 — 安全加固

42. 作为运维，JWT 使用随机 64 位密钥且 admin 8h / customer 7d 分开过期
43. 作为运维，登录接口有严格限流（5次/5min），注册 3次/10min，支付 10次/min
44. 作为运维，CSP 头分项目配置（管理后台放宽 antd cssinjs，前台收紧）
45. 作为运维，文件上传校验 MIME 类型（magic bytes）+ 文件名长度 100 字符限制 + 路径穿越防护
46. 作为运维，所有 SQL 动态列名加白名单校验
47. 作为运维，生产 LOG_LEVEL=warn + winston-daily-rotate-file 日志轮转

### A 阶段 — 生产就绪

48. 作为运维，通过 ngrok 验证 HTTPS 全链路
49. 作为顾客，我在手机上浏览产品列表，布局自动适配单列，购物车从底部滑出
50. 作为顾客，我在手机上完成 checkout 三步流程（地址/支付/确认），无横向滚动
51. 作为管理员，管理后台通过 ProLayout 内置响应式（侧边栏折叠、表格横滚）在平板上可用
52. 作为运营，B 阶段管理后台交付后立即删除旧 backend/public/admin.html 和 dashboard.html

## 实现决策

### 管理后台架构

- **技术栈**：独立 Vite + React SPA 项目，位于同仓库 /admin 目录
- **路由**：react-router-dom v7
- **组件库**：Ant Design（仅 ProLayout 用于布局；Table/Form 手写，不用 ProTable/ProForm）
- **样式**：完整 Tailwind CSS（不关 preflight）+ Ant Design v5 cssinjs 共存
- **TypeScript**：strict: true，从第一天开始
- **目录结构**：按模块分组 — modules/products/、modules/orders/、modules/dashboard/、modules/auth/、shared/
- **语言**：管理后台仅中文（内部工具）
- **认证**：独立 adminAuthStore（Zustand + localStorage），JWT role: 'admin'，与前台 customer auth 完全隔离
- **路由守卫**：AdminGuard 组件检查 token，未登录渲染 Login 页
- **API 层**：独立 adminApi.ts（axios instance + interceptor），内置格式转换适配 ProLayout 的 { data, success, total } 格式
- **API 策略**：复用现有 REST 端点 + adminApi.ts 适配层，不新建 /api/admin/* 前缀
- **开发代理**：Vite dev server 代理 /api 和 /images 到 localhost:3001
- **状态管理**：ProLayout 内部管理 loading/data/pagination/search/selection，不额外用 Zustand
- **通知**：antd message + Modal.confirm + axios 层统一错误拦截

### 商品管理

- **功能边界**：标准 CRUD + 行内编辑（文本/数值字段行内编辑+失焦保存，图片和下拉字段弹窗编辑，新增用弹窗表单）
- **图片上传**：封装 ImageUpload 组件（antd Upload + antd-img-crop 裁剪），内置 token 注入、进度、预览、删除

### 订单管理

- **功能边界**：查看 + 状态流转 + 批量操作（后端批量端点，一个事务全成功或全回滚）+ Excel/PDF 导出
- **批量操作**：POST /api/orders/batch-status { ids, status }，一个事务
- **订单详情**：Drawer 侧拉展示订单项和状态历史
- **导出**：复用现有 utils/exportOrders.js（ExcelJS + PDFKit）

### 数据大屏

- **图表库**：Ant Design Charts（@ant-design/charts）
- **指标**：4 统计卡 + 销售趋势折线图 + 分类占比饼图 + 热销排行 Top 10 + 库存预警 + 实时订单滚动
- **数据刷新**：Dashboard 统计数据轮询 30s；实时事件（新订单、库存预警）走 WebSocket（已有 Socket.io admin 房间推送）
- **旧看板**：B 阶段交付后删除 backend/public/admin.html 和 dashboard.html

### 后端架构升级（E 阶段，B 阶段之前执行）

- **Express 5**：升级到 Express 5
- **Router 全拆**：app.js 从约 447 行瘦到约 50 行（仅中间件挂载 + Router mount），新建 8 个模块 Router 文件
- **GraphQL 删除**：删除 backend/graphql/endpoint.js、graphql 依赖、src/lib/api.ts 中死函数 graphql()
- **Error middleware**：3 个 Custom Error 类（AppError、ValidationError、NotFoundError）+ Express error middleware 统一收口
- **OrderService 批量**：新增 updateBatchStatus(ids, status) 方法，一个事务全成功或全回滚

### AI 智能客服

- **LLM**：DeepSeek API（原生中文，成本低，提供 embedding API）
- **架构**：RAG 模式 — 产品数据+FAQ → DeepSeek embedding → SQLite JSON 字段存向量 → 余弦相似度检索 → 拼接提示词 → DeepSeek 生成回答
- **Embedding 生成**：服务启动时全量生成 + 管理后台"重建索引"按钮
- **前端**：Ant Design Bubble + Sender（原 X 组件），SSE 流式输出
- **部署**：前台右下角悬浮气泡（客服视角）+ 管理后台右下角悬浮气泡（管理员 NL-to-SQL 视角），复用同一 Chat 组件 + 不同 systemPrompt
- **管理员 AI 助手**：NL-to-SQL 引擎，将自然语言转为数据库查询（额外技术复杂度，管理后台数据看板已覆盖 90% 需求，AI 助手做增量）

### 产品数据

- **范围**：精选 50 个常用轴承型号（深沟球 6200-6220、圆锥滚子 30200-30300、圆柱滚子 NU200-NU300 系列等）
- **多语言字段**：name 和 description 改为 JSON 格式 {"zh": "...", "en": "..."}
- **规格不翻译**：内径/外径/宽度/材质等数值规格保留原始格式
- **迁移**：ALTER TABLE 加 JSON 列 → 数据迁移 → 删除旧文本列

### 国际化

- **前台**：react-i18next（与后端 i18next 同生态），中英双语
- **范围**：前台页面 UI 文案，管理后台不做国际化
- **语言检测**：浏览器 Accept-Language + URL ?lang= 参数 + Header 切换按钮
- **产品数据**：JSON 多语言字段，不改表结构

### 支付

- **方案**：保持 Sandbox 模式，加自动化测试覆盖完整支付流程
- **测试**：支付创建 → 模拟支付 → 回调验证 → 订单状态同步 → 退款 完整链路

### 安全加固

- **JWT**：crypto.randomBytes(64).toString('base64') 生成密钥，JWT_ADMIN_EXPIRES_IN=8h，JWT_CUSTOMER_EXPIRES_IN=7d，AuthService 按 role 返回不同过期时间的 token
- **Rate Limit**：login 5/5min, register 3/10min, payment 10/min, products 200/min, 默认 100/min。在现有 middleware/rateLimiter.js 扩展预设
- **CSP**：分项目配置（管理后台 style-src 'unsafe-inline' 因 antd cssinjs，img-src blob: data:；前台收紧 default-src 'self'）
- **文件上传**：file-type MIME 检测（magic bytes）+ 文件名最长 100 字符 + 字符集限制 + 路径穿越防护（已有）
- **SQL**：全量审计动态拼接，动态列名（ORDER BY、GROUP BY）加白名单校验
- **日志**：winston-daily-rotate-file + 生产 LOG_LEVEL=warn + 错误不泄露堆栈
- **依赖**：npm audit 扫前后端

### HTTPS

- **方案**：本地 Docker Compose + ngrok 隧道验证 HTTPS 链路
- **域名**：需用户自行购买，DNS 解析生效后配置 Nginx + Let's Encrypt

### 响应式

- **前台**：完整适配（产品网格 4列→2列→1列，购物车底部滑出，checkout 三步流程，账号页，登录页）
- **管理后台**：不专门做适配开发，依赖 ProLayout 内置响应式（侧边栏折叠、表格横滚）

## 测试决策

### 测试原则

- 测试外部行为，不测试实现细节
- ProLayout/AntDesign Charts 内部行为不测（antd 的测试责任）
- 不做组件单元测试（RTL render + assert DOM）— CRUD 后台组件测试价值低，用 e2e 覆盖

### 后端测试（Vitest + supertest + 内存 SQLite）

- 商品 CRUD API：创建、列表、更新库存、删除
- 订单管理 API：状态流转、批量操作、导出端点、状态历史
- Analytics API：dashboard 数据、销售趋势、分类统计
- Admin Auth：登录成功/失败、token 过期、权限拒绝
- 关键路径：订单创建库存扣减事务、优惠券使用校验、支付状态同步
- E 阶段重构：现有 27 个后端测试全量回归

### 前端测试（Vitest + jsdom）

- adminAuthStore：login/logout、token 持久化、过期处理
- adminApi.ts：请求格式、ProTable 响应转换、错误拦截
- 不做 AdminGuard/ImageUpload/各模块 list/form 组件测试

### e2e 测试（Playwright）

- Happy path 1：admin 登录 → 看板加载 → 新增商品 → 列表搜索 → 行内编辑改价格 → 订单管理 → 订单发货确认
- Happy path 2：admin 登录 → 订单列表筛选 → 订单详情 Drawer → 导出 PDF
- Happy path 3：admin 登录 → 批量选择订单 → 批量发货

### 支付测试（Vitest + supertest）

- Sandbox 支付完整流程：创建支付 → 模拟支付 → 支付回调 → 订单状态变更验证 → 退款流程

### 测试先例

- 后端：遵循 test/auth.test.ts、test/orders.test.ts 模式（内存 SQLite + supertest + createApp 不监听端口）
- 前端：遵循 src/test/cartStore.test.ts 模式（vi.mock API 调用 + vi.useFakeTimers）
- RAG：无先例，建立新测试模式（检索精度 + 答案相关性）

## 超出范围

- 真实支付对接（支付宝/微信/银联）— 需企业营业执照、商户号，保留代码架构日后对接
- 短信验证码注册 — 需短信服务商
- 微信/支付宝快捷登录
- 密码重置（忘记密码）
- 管理后台权限分级（超级管理员 vs 普通管理员）
- Redis token 黑名单
- 多仓库库存同步、多币种定价
- 供应商门户（B2B 场景）
- 移动端 App（React Native）
- monorepo 重整（npm workspaces）— 推迟到 C 阶段后
- 性能优化（CDN、缓存策略）

## 附加说明

- 本 PRD 基于 2 次 grill-me 技术访谈（共 37 个决策点），覆盖架构、组件选型、路由设计、测试策略、安全策略、国际化、AI 集成等全部维度
- 替换 PRD #14（初版 v5.1 方案），为更新后的精炼版本
- 模块按 15 个独立 Issue 拆分，每个可独立开发、测试、合并
- **执行顺序：E（后端重构）→ B（管理后台）→ C（测试）→ D（新功能）→ A（生产加固）**
- 后端重构（E）先行，为管理后台提供干净的路由和错误处理基础
