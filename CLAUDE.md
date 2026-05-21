# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

轴承销售系统 (Bearing Sales System) — a full-stack e-commerce application for industrial bearing products. Chinese-language UI with i18n support (zh/en).

## Agent skills

### Issue tracker

GitHub Issues，使用 `gh` CLI。参见 `docs/agents/issue-tracker.md`。

### Triage labels

默认标签：needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix。参见 `docs/agents/triage-labels.md`。

### Domain docs

多上下文布局（backend / src / pages）。参见 `docs/agents/domain.md`。

## Repository layout

This is a **multi-context repository**. Each subdirectory has its own `CONTEXT.md` and optional `docs/adr/`:

| Context | Path | Stack |
|---------|------|-------|
| Backend | `backend/` | Express 4 + SQLite/Postgres + GraphQL + JWT |
| Frontend components | `src/` | React 19 + Zustand 5 + TypeScript 6 |
| Pages | `pages/` | Next.js 16 Pages Router |

## Commands

### Frontend (root)

```bash
npm run dev          # Next.js dev server on port 3000
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest run (unit tests for Zustand stores)
npm run test:watch   # Vitest in watch mode
```

To run a single test file:
```bash
npx vitest run src/test/cartStore.test.ts
```

### Backend (`backend/`)

```bash
cd backend
npm run dev          # nodemon server.js (port 3001)
npm start            # node server.js
npm run init-db      # Seed SQLite database with sample data
npm run backup       # Backup SQLite database file
npm test             # Vitest run (adapter, auth, orders)
npm run test:watch   # Vitest in watch mode
```

To run a single backend test:
```bash
cd backend && npx vitest run test/auth.test.ts
```

## Architecture

### Data flow

```
Browser (port 3000)
  → pages/ (Next.js SSR/CSR)
    → src/store/ (Zustand: cartStore, productStore, checkoutStore)
      → src/lib/api.ts (fetch wrapper, base URL from NEXT_PUBLIC_API_URL)
        → backend on port 3001 (Express)
          → routes/ or graphql/endpoint.js
            → services/ → db/adapter.js → SQLite or Postgres
```

### Backend architecture

Entry: `backend/server.js` → `backend/app.js` (Express app factory `createApp(db, services)`).

**Middleware stack (in order):** helmet → cors → rate limiter (500 req/60s on /api/) → body-parser → static files → auth guards on protected routes → cache middleware on read-heavy endpoints.

**Database adapter pattern:** `backend/db/adapter.js` exports a unified interface (`get`, `all`, `run`, `query`, `transaction`) that works with both SQLite and Postgres. Controlled by `DB_TYPE` env var. Queries use `?` placeholders; the adapter auto-converts to `$1, $2, ...` for Postgres.

**Route organization:**
- Core CRUD routes defined inline in `app.js` (bearings, categories, search, orders, auth)
- Modular routers: `routes/crm.js`, `routes/supplyChain.js`, `routes/upload.js`, `routes/inventory.js`, `routes/analytics.js`
- Payment and AI endpoints also defined inline in `app.js`, delegating to service classes

**Services** are classes instantiated in `server.js` and passed to `createApp()`:
- `PaymentService` — Alipay/WeChat/UnionPay with sandbox fallback
- `AIService` — rule-based chatbot, demand prediction, recommendations
- `supplyChainService` — suppliers, purchase orders, FIFO stock costing
- `emailService`, `notificationService`, `websocketService` (Socket.io)

**Authentication:** JWT Bearer tokens. `verifyToken` middleware extracts and verifies, `requireAdmin` checks `role === 'admin'`. Default admin seeded by `initDatabase.js`: `admin` / `admin123`.

**GraphQL:** Not Apollo Server — uses legacy `graphql()` function with `buildSchema()` and a `rootValue` object. No auth at GraphQL layer; security relies on service-level checks.

**Cache:** Redis-based read-through cache with TTL on bearings, categories, and search endpoints. Gracefully degrades if Redis is unavailable.

### Frontend architecture

**Rendering pattern:** Single-page app feel via conditional rendering. Home page (`pages/index.tsx`) swaps between `ProductList` and `ProductDetail` based on `selectedProduct` state. Cart is a slide-in overlay. `pages/product/[id].tsx` provides direct deep-link access.

**State management (3 Zustand stores):**

| Store | File | Persisted? | Purpose |
|-------|------|-----------|---------|
| `cartStore` | `src/store/cartStore.ts` | Yes (localStorage, items only) | Cart items, visibility toggle, computed totals |
| `checkoutStore` | `src/store/checkoutStore.ts` | No | 3-step flow: cart → address form → payment with 2s polling |
| `productStore` | `src/store/productStore.ts` | No | Product list, categories, selected product, detail view, similar products |

**Key pattern:** The `Cart` component receives cart data as props from the page (presentational), but reads/writes `checkoutStore` directly (controller pattern for checkout flow).

**API client** (`src/lib/api.ts`): Generic `request<T>()` wrapper around `fetch`. All functions return typed promises. The `getAuthHeaders()` helper reads JWT from localStorage but is **not currently wired into any API call** — admin features are not exposed in the frontend yet.

**Image handling:** `next.config.js` proxies `/images/:path*` to `localhost:3001/images/:path*`. Image optimization is disabled (`unoptimized: true`).

## Key patterns and conventions

- **Path alias:** `@/` maps to `src/` in both TypeScript and Vitest configs.
- **CSS:** Global styles in `src/index.css` and `src/App.css`. Per-component CSS files imported at the top of each component.
- **i18n:** Backend uses `i18next` with resource files in `backend/locales/` (zh-CN, en). Frontend is Chinese-only hardcoded strings.
- **Testing:** Vitest with `globals: true`. Backend tests use in-memory SQLite (`test/helpers.ts`) + supertest (app created via `createApp(db, {})` without listening on a port). Frontend tests are store-only unit tests with `vi.mock('@/lib/api')` and `vi.useFakeTimers()` for polling tests.
- **TypeScript strict mode is off** (`strict: false`). Types are defined in `src/types/index.ts` but some are unused (CRM, AI types).
- **Error handling:** Backend returns `{ error: "message" }` JSON. Frontend `request()` throws on non-2xx with parsed error message.
- **The API base URL** is read from `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:3001/api`), set in `.env` at project root.

## Environment variables

**Root `.env`:** `NEXT_PUBLIC_API_URL` (frontend API base)

**Backend `.env`:** `PORT`, `NODE_ENV`, `DB_TYPE` (sqlite|postgres), `DB_PATH`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `REDIS_HOST/PORT`, `LOG_LEVEL`, `BACKUP_DIR`, plus optional payment gateway credentials.

See `backend/.env` for current dev values and `backend/.env.example` for all available variables.

## Project documentation

- `CRUD-COMPLETE.md` — Order and product CRUD feature report
- `DASHBOARD-COMPLETE.md` — Admin dashboard with ECharts (accessible at `backend/public/dashboard.html`)
- `ORDER-PRODUCT-API.md` — API documentation for order and product endpoints
- `test-crud-api.sh` / `test-crud-api.bat` — Shell scripts for testing CRUD endpoints
