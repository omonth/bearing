# Bearing Store

全栈工业轴承电商平台。Next.js 前台商城 + Vite 管理后台 + Express API。

**Live:** https://bearing-dusky.vercel.app

## 技术栈

| 层 | 技术 |
|---|---|
| 前台 | Next.js 16 · React 19 · Tailwind CSS 4 · Zustand 5 · i18next |
| 管理后台 | Vite 6 · React 19 · TypeScript · Ant Design 5 · Playwright |
| 后端 | Express 5 · SQLite / Postgres · JWT · Socket.io · Multer |
| 测试 | Vitest · Supertest · Playwright |
| AI | DeepSeek RAG 智能客服 · NL-to-SQL 数据助手 |

## 项目结构

```
bearing-sales/
├── backend/               Express API (port 3001)
│   ├── routes/            10 个模块路由
│   ├── services/          领域服务层
│   ├── middleware/         认证 / 限流 / 缓存 / 上传
│   ├── db/                SQLite / Postgres 适配器
│   └── test/              114 条测试
├── admin/                 管理后台 (port 5173)
│   └── src/modules/       auth / products / orders / dashboard
├── src/                   前台组件 / stores / lib
├── pages/                 Next.js Pages Router
└── locales/               zh.json / en.json
```

## 快速开始

```bash
# 安装依赖
npm install
cd backend && npm install && cd ..
cd admin && npm install && cd ..

# 初始化数据库
cd backend && node initDatabase.js && cd ..

# 启动（三个终端）
cd backend && npm run dev     # API → http://localhost:3001
npm run dev                   # 前台 → http://localhost:3000
cd admin && npm run dev       # 后台 → http://localhost:5173
```

默认管理员：`admin` / `admin123`

## 环境变量

**根目录 `.env`**

| 变量 | 说明 | 默认值 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | API 地址 | `http://localhost:3001/api` |

**backend/.env**

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | API 端口 | 3001 |
| `DB_TYPE` | 数据库类型 | sqlite |
| `JWT_SECRET` | JWT 密钥 | — |
| `CORS_ORIGIN` | 跨域白名单 | `http://localhost:3000` |
| `DEEPSEEK_API_KEY` | AI 助手（可选） | — |

## API 概览

| 模块 | 端点 |
|---|---|
| 认证 | `POST /api/auth/login` · `GET /api/auth/me` |
| 产品 | `GET /api/bearings` · `GET /api/search` · `GET /api/categories` |
| 订单 | `POST /api/orders` · `GET /api/orders` · `PUT /api/orders/:id/status` |
| AI | `POST /api/ai/chat`（SSE 流式） · `POST /api/ai/admin-chat` |
| 分析 | `GET /api/analytics/dashboard` |
| 库存 | `GET /api/inventory/low-stock` · `GET /api/inventory/summary` |
| 支付 | `POST /api/payment/create` · `POST /api/payment/simulate/:id` |

完整文档见 `API-DOCUMENTATION.md`。

## 测试

```bash
cd backend && npm test         # 114 条 API 测试
npm test                       # 30 条前端 store 测试
cd admin && npm test           # 8 条 admin store 测试
cd admin && npx playwright test  # 3 条 e2e 测试
```

## 部署

```bash
# Docker
docker-compose up -d

# 或直接
cd backend && npm start
npm run build && npm run preview
```

详细部署文档见 `DEPLOYMENT.md` 和 `DOCKER-DEPLOYMENT.md`。

## 许可证

MIT
