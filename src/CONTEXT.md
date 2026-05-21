# 前端组件上下文

## 领域

轴承销售系统前端 React 组件。

## 核心概念

- **Bearing** — 产品类型，含 id、name、model、price、image、category、specs、stock
- **CartItem** — 购物车项，扩展 Bearing 加 quantity
- **ProductList** — 产品列表组件，支持分类筛选
- **ProductDetail** — 产品详情组件
- **Cart** — 购物车组件
- **Header** — 页头组件，含导航和购物车入口

## 技术栈

- React + TypeScript
- Next.js
- CSS Modules

## API 通信

通过 `src/lib/api.ts` 与后端通信，基础 URL 为 `http://localhost:3001/api`。
