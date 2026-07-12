# Bearing Store

工业轴承电商与运营管理系统。项目由三个主要应用组成：Next.js 前台商城、Vite/React 管理后台、Express API 服务。它覆盖产品检索、购物车、下单、支付、客户账户、库存预警、CRM、供应链、数据分析、图片上传和 AI 客服等业务场景。

**线上地址：** https://bearing-dusky.vercel.app

## 核心能力

- 前台商城：轴承列表、分类筛选、产品详情、购物车、结算下单、客户登录与订单查询。
- 管理后台：管理员登录、产品管理、订单管理、仪表盘、图片上传和后台聊天助手。
- 后端 API：产品、订单、客户、CRM、库存、支付、供应链、推荐、分析、AI 与运行时配置接口。
- 数据层：默认支持 SQLite，本地和生产环境可切换到 Postgres；Redis 用于缓存高频读取接口。
- 运维能力：Docker Compose 一键启动 Postgres、Redis、后端、前端和 Nginx。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前台商城 | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, i18next |
| 管理后台 | Vite 6, React 19, TypeScript, Ant Design 5, React Router, Zustand |
| 后端 API | Node.js, Express 5, JWT, Socket.io, Multer, Winston |
| 数据库与缓存 | SQLite, Postgres, Redis |
| 支付与业务服务 | Alipay, WeChat Pay, UnionPay, sandbox payment provider |
| 测试 | Vitest, Supertest, Playwright |

## 项目结构

```text
bearing-sales/
├── pages/                 Next.js 页面入口
├── src/                   前台组件、状态管理、API client 和类型
├── admin/                 Vite 管理后台
├── backend/               Express API、服务、路由、数据库与测试
├── locales/               前台国际化资源
├── k8s/                   Kubernetes 部署配置
├── docs/                  内部设计、计划和架构记录
├── docker-compose.yml     Postgres + Redis + backend + frontend + Nginx
└── nginx.conf             生产反向代理配置
```

## 快速开始

### 1. 安装依赖

```bash
npm ci

cd backend
npm ci
cd ..

cd admin
npm ci
cd ..
```

### 2. 配置环境变量

根目录 `.env` 用于前台商城：

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

后端可在 `backend/.env` 中配置数据库、JWT、Redis、CORS 和第三方支付。SQLite 与沙箱支付仅限本地开发；不要把开发 `.env`、数据库或种子账号带入生产。

关键变量：

| 变量 | 说明 | 常用值 |
| --- | --- | --- |
| `PORT` | 后端端口 | `3001` |
| `DB_TYPE` | 数据库类型 | `sqlite` 或 `postgres` |
| `JWT_SECRET` | 主 JWT 签名密钥 | 生产环境必填，至少 32 个随机字符 |
| `AI_JWT_SECRET` | AI 管理端 JWT 签名密钥 | 生产环境必填，且不得复用主 JWT 密钥 |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | 首次主管理员引导账户 | 生产环境必填，仅用于首次初始化 |
| `AI_BOOTSTRAP_USERNAME` / `AI_BOOTSTRAP_PASSWORD` | 首次 AI 管理员引导账户 | 生产环境必填，仅用于首次初始化 |
| `PAYMENT_MODE` | 支付提供方模式 | 生产环境必须显式为 `production` |
| `CORS_ORIGIN` | 允许访问 API 的前端源 | `http://localhost:3000` |
| `REDIS_HOST` / `REDIS_PORT` | Redis 连接信息 | Docker 环境使用 `redis:6379` |
| `REDIS_PASSWORD` | Redis 认证密钥 | 生产环境必填，使用强随机值 |
| `DEEPSEEK_API_KEY` | AI 助手密钥 | 可选 |

生产环境变量示例见 `.env.production.example`。复制后必须填写所有空值；该文件受 `.gitignore` 保护，仍应限制其读取权限。

### 3. 初始化数据库

```bash
cd backend
npm run init-db
cd ..
```

开发种子数据可能包含演示账号，仅用于本地测试。生产环境不得运行默认账号/密码，必须通过 `INITIAL_ADMIN_*` 与 `AI_BOOTSTRAP_*` 提供一次性、强随机的初始化凭据，并在首次登录后轮换。

### 4. 启动本地开发服务

分别在三个终端启动：

```bash
cd backend
npm run dev
```

```bash
npm run dev
```

```bash
cd admin
npm run dev
```

本地访问地址：

| 服务 | 地址 |
| --- | --- |
| 前台商城 | http://localhost:3000 |
| 后端 API | http://localhost:3001 |
| 管理后台 | http://localhost:5173 |

## 常用命令

### 前台商城

```bash
npm run dev
npm run build
npm run preview
npm test
```

### 后端 API

```bash
cd backend
npm run dev
npm start
npm run init-db
npm test
```

### 管理后台

```bash
cd admin
npm run dev
npm run build
npm test
npx playwright test
```

## API 概览

前台通过 `/api` 访问后端；本地开发时可直接访问 `http://localhost:3001/api`。

| 模块 | 主要接口 |
| --- | --- |
| 认证 | `POST /api/auth/login`, `GET /api/auth/me` |
| 产品 | `GET /api/bearings`, `GET /api/bearings/:id`, `GET /api/search`, `GET /api/categories` |
| 订单 | `POST /api/orders`, `GET /api/orders`, `PUT /api/orders/:id/status` |
| 客户 | `POST /api/customer/register`, `POST /api/customer/login`, `GET /api/customer/me`, `GET /api/customer/orders` |
| 支付 | `POST /api/payment/checkout`, `GET /api/payment/status/:paymentOrderId`, `POST /api/payment/simulate/:paymentOrderId` |
| 库存 | `GET /api/inventory/low-stock`, `GET /api/inventory/summary` |
| 推荐 | `GET /api/recommendations/hot`, `GET /api/recommendations/similar/:productId` |
| 分析 | `GET /api/analytics/dashboard` |
| AI | `POST /api/ai/chat`, `POST /api/ai/admin-chat` |
| 供应链 | `/api/supply-chain/*` |
| CRM | `/api/crm/*` |

更完整的接口说明见 `API-DOCUMENTATION.md`、`ORDER-PRODUCT-API.md`、`PAYMENT-INTEGRATION.md` 和 `backend/README.md`。

## Docker 部署

生产环境使用 Docker Compose 同时启动数据库、缓存、后端、前端和 Nginx。Compose 不再提供数据库、Redis、JWT 或初始化账号的默认值：

```bash
cp .env.production.example .env.production
# 编辑 .env.production，填写所有空值（不要提交该文件）
chmod 600 .env.production
docker compose --env-file .env.production up -d --build
```

Compose 默认启动：

- Postgres 15
- Redis 7
- Express backend
- Next.js frontend
- Nginx reverse proxy

生产部署前必须设置 `DB_PASSWORD`、`REDIS_PASSWORD`、`JWT_SECRET`、`AI_JWT_SECRET`、两组首次管理员凭据、`CORS_ORIGIN` 和 `PAYMENT_MODE=production`。Nginx 配置仅提供 HTTP 反向代理；公网部署还应在其前方配置受管 TLS 或 HTTPS 终止。部署、备份、恢复和回滚细节见 `DEPLOYMENT.md` 与 `DOCKER-DEPLOYMENT.md`。

## 测试

```bash
npm test
npm run lint
npm run build
cd backend && npm test
cd admin && npm test
cd admin && npm run build
cd admin && npx playwright test
```

测试覆盖前台 store、后端 API/服务、管理后台 store，以及后台端到端流程。

## 文档索引

- `FEATURES.md`：功能清单
- `API-DOCUMENTATION.md`：API 文档
- `PAYMENT-INTEGRATION.md`：支付集成说明
- `CRM-SYSTEM.md`：CRM 模块说明
- `SUPPLY-CHAIN.md`：供应链模块说明
- `AI-INTEGRATION.md`：AI 能力说明
- `DEPLOYMENT.md`：部署指南
- `DOCKER-DEPLOYMENT.md`：Docker 部署指南

## 许可证

MIT
