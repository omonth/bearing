# PRD: 命令式 getter 替换为 Zustand 响应式选择器

**标签**: `ready-for-agent`

## 问题陈述

三个 Zustand store 暴露了命令式 getter 函数（`getTotalPrice()`、`getTotalCount()`、`getFinalPrice()`），迫使组件订阅整个 store：

```typescript
// cartStore.ts — 当前（问题模式）
const useCartStore = create((set, get) => ({
  items: [],
  showCart: false,
  // 命令式 getter — 每次都重新计算
  getTotalPrice: () => get().items.reduce(...),
  getTotalCount: () => get().items.reduce(...),
  // ...
}));

// 使用处：组件订阅了整个 store，showCart 变化 → 所有消费者重渲染
const { items, showCart, getTotalPrice } = useCartStore();
```

核心问题：
- **`showCart` 每次切换导致所有使用 `useCartStore()` 的组件重渲染**——即使它们只关心 `items`
- Header 的购物车徽标（只关心 `getTotalCount()`）在 `showCart` 切换时重渲染
- 三个 store 共 7 个命令式 getter 全部存在此问题

## 解决方案

将命令式 getter 替换为内联响应式选择器。Zustand 的选择器使用 `Object.is` 做浅比较——组件仅在它使用的状态切片变化时重渲染。

### 改造前后对比

```typescript
// 之前：命令式 getter
const useCartStore = create((set, get) => ({
  items: [],
  showCart: false,
  getTotalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  getTotalCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));

// 组件中
function CartBadge() {
  const { getTotalCount } = useCartStore();  // showCart 变化 → 重渲染！
  return <span>{getTotalCount()}</span>;
}
```

```typescript
// 之后：响应式选择器
const useCartStore = create((set, get) => ({
  items: [],
  showCart: false,
}));

// 派生数据通过选择器获取，不存储在 store 中

function CartBadge() {
  const totalCount = useCartStore(s => s.items.reduce((sum, i) => sum + i.quantity, 0));
  // 仅在 items 变化时重渲染。showCart 变化不影响此组件。
  return <span>{totalCount}</span>;
}

function CartPanel() {
  const showCart = useCartStore(s => s.showCart);
  const items = useCartStore(s => s.items);
  // showCart 或 items 变化时重渲染——这正是 CartPanel 需要的
  // ...
}
```

### 快捷选择器（高频复用提取为函数）

```typescript
// store 文件中导出选择器函数，避免在组件中重复 reduce 逻辑
export const selectTotalPrice = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectTotalCount = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectItemCount = (id: number) => (s: CartState) =>
  s.items.find(i => i.id === id)?.quantity ?? 0;

// 组件中
const totalPrice = useCartStore(selectTotalPrice);
const totalCount = useCartStore(selectTotalCount);
```

### checkoutStore 和 productStore 同理

| Store | 当前命令式 getter | 替换为 |
|-------|------------------|--------|
| `cartStore` | `getTotalPrice()`, `getTotalCount()` | `selectTotalPrice`, `selectTotalCount` |
| `checkoutStore` | `getFinalPrice()` (含优惠券折扣) | `selectFinalPrice` |
| `productStore` | `getSelectedProduct()`, `getFilteredProducts()` | `selectSelectedProduct`, `selectFilteredProducts` |

## 用户故事

1. 作为用户，我想购物车侧滑面板的开关动画流畅不卡顿，以便体验顺畅
2. 作为前端开发者，我想理解每个组件的订阅范围，一眼看出"它依赖哪些状态"
3. 作为维护者，我想新增 store 字段时不用担心意外触发大量组件重渲染
4. 作为测试者，我想单独测试派生逻辑（总价计算、过滤逻辑），无需 mock 整个 store

## 实现决策

### 受影响文件

| 文件 | 变更 |
|------|------|
| `src/store/cartStore.ts` | 移除 `getTotalPrice`、`getTotalCount`；导出 `selectTotalPrice`、`selectTotalCount`、`selectItemCount` |
| `src/store/checkoutStore.ts` | 移除 `getFinalPrice`；导出 `selectFinalPrice` |
| `src/store/productStore.ts` | 移除命令式 getter；导出 `selectSelectedProduct`、`selectFilteredProducts`、`selectCategories` |
| `src/components/Header.tsx` | `useCartStore(getTotalCount)` → `useCartStore(selectTotalCount)` |
| `src/components/Cart.tsx` | 拆分为细粒度 `useCartStore` 选择器 |
| `src/components/ProductList.tsx` | `useProductStore(getFilteredProducts)` → `useProductStore(selectFilteredProducts)` |
| `pages/checkout.tsx` | `useCheckoutStore(getFinalPrice)` → `useCheckoutStore(selectFinalPrice)` |

### 架构决策

- **选择器函数导出为命名导出**：与 store hook 在同一文件中，便于发现和维护
- **不在 store 中存储派生状态**：总价、总数始终通过选择器计算，消除 `items` 和 `getTotalPrice` 不同步的风险
- **性能关键的选择器可加 `shallow` 比较**：当选择器返回对象时使用 `import { shallow } from 'zustand/shallow'` 避免不必要的重渲染
- **不改动 store 的 action 部分**：`addItem`、`removeItem`、`clearCart` 等保持不变

### 重渲染影响分析

| 组件 | 当前订阅 | 当前触发条件 | 改后触发条件 | 收益 |
|------|---------|-------------|-------------|------|
| Header 购物车图标 | 整个 cartStore | items, showCart 任意变化 | 仅 items 变化 | **showCart 不再触发其重渲染** |
| Cart 面板 | 整个 cartStore | items, showCart 任意变化 | items + showCart | 无变化（本就需要） |
| 产品列表 | 整个 productStore | 所有字段变化 | 仅 products + filteredProducts | selectedProduct 不再触发其重渲染 |
| 结账页面 | 整个 checkoutStore | 所有字段变化 | 仅所需字段 | 轮询步骤变化不再刷新地址表单 |

## 测试决策

### 好测试的描述

- 测试 `selectTotalPrice`：给定 `items` 数组，返回正确的总金额
- 测试 `selectTotalPrice`：空数组返回 0
- 测试 `selectFilteredProducts`：给定产品和分类过滤条件，返回正确的过滤结果
- 测试 `selectItemCount(id)`：返回正确数量；不存在的 ID 返回 0
- 不测试 Zustand 的响应式机制本身（由 Zustand 库保证）
- 不测试 React 渲染行为（由组件测试或 E2E 覆盖）

### 测试先例

- 选择器函数为纯函数——测试最简单：输入状态对象 → 断言输出值
- 遵循 `src/test/cartStore.test.ts` 的已有测试模式
- 选择器测试与 store 测试放在同一文件中

## 超出范围

- 将 Zustand 更换为其他状态管理库
- 引入 `reselect` 或 memoization 库（Zustand 内置的选择器已足够）
- store 结构的重新设计（如合并/拆分 store）
- 组件级别的 React.memo 优化（选择器优化已足够解决当前问题）

## 附加说明

- 此 PRD 源自 2026-05-25 架构审查的候选 #4（强烈建议）
- 架构审查原话："`showCart` 每次切换都会导致所有消费者重渲染"
- 改动为纯机械替换：`useCartStore()` → `useCartStore(selectTotalCount)` 等 7 处
- 选择器模式是 Zustand 官方推荐的最佳实践，不引入任何新依赖
- 此优化对移动端尤其重要——低端设备上不必要的重渲染影响 60fps 滑动体验
