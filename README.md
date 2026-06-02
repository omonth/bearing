# 轴承销售系统 v5.1

全栈工业轴承电商平台 —— Next.js 前台商城 + Vite 管理后台 + Express 5 API。

## 项目结构

```
bearing-sales/
├── backend/                  Express 5 API (port 3001)
│   ├── server.js            入口
│   ├── app.js               应用工厂 (104行)
│   ├── routes/              10个模块路由
│   ├── services/            领域服务层 (9个服务类)
│   ├── middleware/           认证/限流/缓存/上传/校验
│   ├── utils/               工具 (analytics/inventoryAlert/errors/exportOrders)
│   ├── db/                  SQLite/Postgres 适配器 + SQL文件
│   └── test/                114条测试
├── admin/                   管理后台 Vite + React (port 5173)
│   ├── src/modules/          auth/products/orders/dashboard
│   ├── src/shared/          Layout/AdminGuard/adminApi/authStore
│   └── e2e/                 Playwright e2e 测试
├── src/                     前台组件 + stores + lib
├── pages/                   Next.js Pages Router
├── locales/                 zh.json / en.json
└── package.json             Next.js前端
```

## 快速开始

```bash
# 1. 安装依赖
npm install
cd backend && npm install && cd ..
cd admin && npm install && cd ..

# 2. 初始化数据库
cd backend
node initDatabase.js
cd ..

# 3. 启动
cd backend && npm run dev     # API → http://localhost:3001
npm run dev                   # 前台 → http://localhost:3000
cd admin && npm run dev       # 管理后台 → http://localhost:5173
```

**默认管理员**: `admin` / `admin123`

## 运行地址

| 服务 | 地址 |
|---|---|
| 前台商城 | `http://localhost:3000` |
| 管理后台 | `http://localhost:5173/admin/login` |
| 后端 API | `http://localhost:3001` |
| 后端健康检查 | `http://localhost:3001/health` |

后端分析看板接口：

```text
http://localhost:3001/api/analytics/dashboard
```

如果从同一局域网其他设备访问，把 `localhost` 替换为运行后端机器的 IP，例如：

```text
http://66.183.206.85:3001/api/analytics/dashboard
```

该接口需要管理员 JWT：

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/analytics/dashboard
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前台 | Next.js 16 + React 19 + Tailwind CSS 4 + Zustand 5 + react-i18next |
| 管理后台 | Vite 6 + React 19 + TypeScript strict + Ant Design 5 + Playwright |
| 后端 | Express 5 + SQLite/Postgres + JWT + Winston + Socket.io + Multer |
| 测试 | Vitest + Supertest + Playwright |
| AI | DeepSeek RAG 智能客服 + NL-to-SQL 数据助手 |

## 测试

```bash
cd backend && npm test         # 114 条 API 测试
npm test                       # 30 条前端 store 测试
cd admin && npm test           # 8 条 admin store 测试
cd admin && npx playwright test  # 3 条 e2e 测试
```

## 环境变量 (backend/.env)

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | API端口 | 3001 |
| `DB_TYPE` | 数据库类型 (sqlite/postgres) | sqlite |
| `JWT_SECRET` | JWT签名密钥 | 随机64位 |
| `JWT_ADMIN_EXPIRES_IN` | 管理员token过期 | 8h |
| `JWT_CUSTOMER_EXPIRES_IN` | 顾客token过期 | 7d |
| `DEEPSEEK_API_KEY` | RAG/AI助手 (可选) | — |
| `LOG_LEVEL` | 日志级别 | info |
| `CORS_ORIGIN` | 跨域白名单 | http://localhost:3000 |

## API 概览

### 认证
- `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/change-password`

### 产品
- `GET /api/bearings` · `GET /api/bearings/:id` · `POST /api/bearings`
- `PUT /api/bearings/:id` · `DELETE /api/bearings/:id`
- `GET /api/search` · `GET /api/categories`

### 订单
- `POST /api/orders` · `GET /api/orders`
- `PUT /api/orders/:id/status` · `PUT /api/orders/batch/status`
- `GET /api/orders/:id/history` · `GET /api/orders/:id/items`
- `GET /api/orders/export/excel` · `GET /api/orders/:id/export/pdf`

### AI / 分析 / 库存
- `POST /api/ai/chat` (SSE流式) · `POST /api/ai/admin-chat` · `POST /api/ai/reindex`
- `GET /api/analytics/dashboard`
- `GET /api/inventory/low-stock` · `GET /api/inventory/summary`

### 支付 (沙箱)
- `POST /api/payment/create` · `POST /api/payment/simulate/:id` · `POST /api/payment/refund`

## 许可证

MIT
