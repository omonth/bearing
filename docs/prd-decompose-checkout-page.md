# PRD: 分解结账页面 —— 569 行巨石拆成三个可测试模块

**标签**: `ready-for-agent`

## 问题陈述

`pages/checkout.tsx` 当前为 569 行单文件，包含三项独立职责：

- **购物车复查**（CartReviewStep）：已有购物车数据的展示 + 返回购物车编辑的能力
- **地址表单**（AddressFormStep）：收件人姓名、手机号、详细地址、备注的输入与验证
- **支付步骤**（PaymentStep）：支付方式选择、模拟支付触发、2 秒轮询支付状态 + 倒计时

三个步骤的 UI 渲染、表单验证、优惠券数据获取和内联 CSS 类全部混在一个组件中：

- `inputClass` / `labelClass` / `buttonClass` 字符串在文件顶部定义，三个步骤各自重复类似的 Tailwind 组装
- 表单验证逻辑（手机号正则、地址长度校验）内联在 JSX 的 `onChange` / `onBlur` 中，无法独立测试
- `getCustomerCoupons()` 直接在组件中 fetch，绕过 Zustand store，无法缓存、无法测试
- 更改一个步骤的布局可能破坏另一个步骤的渲染——没有组件边界防护

## 解决方案

提取三个纯展示步骤组件 + 一个结账编排器：

```
pages/checkout.tsx              → 编排器（~80 行）：步骤状态机 + 数据获取
src/components/checkout/
  CartReviewStep.tsx            → 购物车复查（~100 行）
  AddressFormStep.tsx           → 地址表单 + 验证（~150 行）
  PaymentStep.tsx               → 支付 + 轮询（~150 行）
  shared.ts                     → 共享样式常量（~20 行）
```

### 组件接口

```typescript
// CartReviewStep — 纯展示，不管理状态
interface CartReviewStepProps {
  items: CartItem[];
  onBackToCart: () => void;
  onProceed: () => void;
}

// AddressFormStep — 管理自己的表单状态，通过回调提交
interface AddressFormStepProps {
  onSubmit: (address: ShippingAddress) => void;
  onBack: () => void;
  initialValues?: Partial<ShippingAddress>;
}

// PaymentStep — 管理支付 + 轮询状态
interface PaymentStepProps {
  orderId: number;
  amount: number;
  onComplete: (paymentId: string) => void;
  onBack: () => void;
}

// CheckoutPage — 编排器
// 状态: step (cart-review | address | payment)
// 数据获取: 从 cartStore 读购物车，通过 checkoutStore 提交
```

### 共享样式模块

```typescript
// shared.ts
export const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg ...";
export const labelClass = "block text-sm font-medium text-gray-700 mb-1";
export const buttonClass = "px-4 py-2 bg-blue-600 text-white rounded-lg ...";
export const errorClass = "text-red-500 text-sm mt-1";
```

## 用户故事

1. 作为开发者，我想独立测试地址表单验证逻辑（手机号格式、地址长度），无需渲染整个结账页面
2. 作为开发者，我想修改支付步骤的轮询间隔或 UI 而不会意外影响地址表单
3. 作为维护者，我想通过阅读一个 100 行的文件理解购物车复查逻辑，而非在 569 行中搜索
4. 作为测试者，我想用 `render(<AddressFormStep onSubmit={mockFn} />)` 测试 6 种验证场景，每次测试在毫秒级完成
5. 作为前端开发者，我想在三个步骤间共享 `inputClass` 等样式常量，一次修改全局生效

## 实现决策

### 模块拆分

| 当前（checkout.tsx） | 目标 |
|---------------------|------|
| `inputClass` / `labelClass` / `buttonClass` (lines 18-35) | → `shared.ts` |
| 手机号正则验证 (line 142) | → `AddressFormStep.validatePhone()` |
| 地址表单 JSX (lines 180-280) | → `AddressFormStep.tsx` |
| 购物车复查 JSX (lines 80-175) | → `CartReviewStep.tsx` |
| 支付 UI + 轮询 (lines 285-450) | → `PaymentStep.tsx` |
| 步骤切换状态机 (lines 50-75) | → `checkout.tsx` 编排器 |
| `getCustomerCoupons()` 直接 fetch (line 48) | → 移入 `checkoutStore.fetchCoupons()` |

### 架构决策

- **步骤组件为纯展示组件**：props 进，回调出。不直接访问 store（除了 PaymentStep 内的轮询 store）
- **结账编排器**持有步骤状态机（`const [step, setStep] = useState<'cart-review' | 'address' | 'payment'>('cart-review')`）和提交逻辑
- **`getCustomerCoupons()` 移入 checkoutStore**：解决架构审查候选 #8（统一数据获取——结束 Store 绕过模式）
- **地址验证逻辑封装在 AddressFormStep 中**：`validatePhone(phone: string): string | null` 返回错误消息或 null
- **轮询逻辑保留在 PaymentStep 中**：`useEffect` + `setInterval` + `clearPolling()` 保持不变，但作用域限定在组件内

### 向后兼容

- 路由 `/checkout` 不变
- 用户可见的结账流程不变（三步顺序不变、UI 布局不变）
- `checkoutStore` 接口不变——编排器调用方式与当前一致

## 测试决策

### 好测试的描述

- `CartReviewStep`: 渲染购物车物品列表 → 点击"继续"触发 `onProceed` → 点击"返回购物车"触发 `onBackToCart`
- `AddressFormStep`: 输入无效手机号 → 显示"手机号格式不正确" → `onSubmit` 不被调用
- `AddressFormStep`: 所有字段合法 → 点击"提交" → `onSubmit` 以正确数据调用一次
- `PaymentStep`: 模拟 `checkoutStore.pollPaymentStatus()` 返回 `paid` → 显示成功状态 → `onComplete` 被调用
- `PaymentStep`: 轮询超时 → 显示"支付超时"错误
- 不测试完整结账流程（由 Playwright E2E 覆盖）

### 测试先例

- 遵循已有前端测试模式：Vitest + React Testing Library
- 步骤组件测试为纯单元测试（mock props，验证回调调用）
- 参考 `src/test/cartStore.test.ts` 的 mock 模式

## 超出范围

- 结账页面的视觉重设计
- 支付流程变更（添加新支付方式、修改轮询逻辑）
- 地址自动填充或地图选点
- 优惠券选择 UI 重构（当前仅将获取逻辑移入 store）
- 结账页面性能优化（已在店铺优化循环 Round 16 中处理了 cart chunk 拆分）

## 附加说明

- 此 PRD 源自 2026-05-25 架构审查的候选 #3（强烈建议）
- 架构审查原话："三个结账步骤、优惠券获取、表单验证和内联 CSS 类共存于一个 569 行的文件中。更改一个步骤可能会破坏另一个；无法独立测试步骤"
- 提取后 `pages/checkout.tsx` 从 569 行缩减至约 80 行（仅编排逻辑）
- Round 16 的实验日志已确认 cart chunk 从 ~11.6KB 缩减至 ~4.9KB——本次拆分进一步将 checkout chunk 按需加载
- 本次重构同时修复架构审查候选 #8 中的结账页面 store 绕过问题
