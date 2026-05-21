# PRD: 拆分 PaymentService —— 提取支付提供商接口

**标签**: `ready-for-agent`

## 问题陈述

当前 PaymentService（722 行）是代码库中最后一个 god 类，包含 5 项以上职责：

- **SDK 初始化**：支付宝、微信、银联三套 SDK 的连接管理
- **建表 DDL**：`payment_orders`、`refund_records` 等表的内联创建
- **支付创建**：三套支付网关的请求构建（支付宝表单、微信 Native、银联 RSA 签名）
- **状态查询与回调验证**：三套网关各自不同的验签逻辑
- **退款**：三套网关各自的退款请求
- **列表分页与统计**
- **越层写入**：支付状态更新时直接修改 `orders.status`（已在上一轮 PRD 通过 OrderService DI 修复）

更重要的是，三套支付网关的实现**全部混在同一个类的 switch/if 分支中**：

- `createPayment()` → if alipay / else if wechat / else if unionpay
- `queryPaymentStatus()` → if alipay / else if wechat / else if unionpay
- `_verifyAlipayCallback()` / `_verifyWechatCallback()` / `_verifyUnionpayCallback()` 各自独立方法
- `createRefund()` → if alipay / else if wechat / else if unionpay

新增一个支付渠道（如 Stripe、PayPal）需要修改 PaymentService 的 6 个方法，且可能破坏现有逻辑。单元测试任何一个支付渠道都需要 mock 整个类的依赖。

## 解决方案

定义 **PaymentProvider 接口**，三套网关各实现一个 Provider：

```
PaymentProvider {
  createPayment(orderId, amount, metadata) → { paymentUrl, qrUrl, formParams, transactionId }
  queryStatus(paymentOrderId) → { status, tradeNo, payerInfo }
  verifyCallback(headers, body) → { valid, paymentOrderId, tradeNo, amount }
  createRefund(paymentOrderId, amount, reason) → { refundNo, status }
}
```

三个实现类：`AlipayProvider`、`WechatProvider`、`UnionPayProvider`，每个仅包含该网关的实现细节。

**PaymentOrchestrator**（从现有 PaymentService 重构）处理共有流程：

- 创建 `payment_orders` 记录
- 分发到对应 Provider
- 更新支付状态（通过 OrderService）
- 列表、统计
- 模拟支付（沙箱模式下注入 MockProvider）

### 接口形状

```typescript
interface PaymentResult {
  data: any | null;
  error: string | null;
  status: number;
}

class PaymentProvider {
  constructor(config: object) {}
  async createPayment(order: object, amount: number): PaymentResult
  async queryStatus(paymentOrderId: number): PaymentResult
  async handleCallback(headers: object, body: object): PaymentResult
  async createRefund(paymentOrderId: number, amount: number, reason: string): PaymentResult
}
```

### 模块清单

| 模块 | 职责 | 依赖 |
|------|------|------|
| PaymentProvider（接口契约） | 定义 create/query/callback/refund | config |
| AlipayProvider | 支付宝 SDK 集成 | alipay-sdk |
| WechatProvider | 微信支付 v3 Native 集成 | wechatpay-node-v3 |
| UnionPayProvider | 银联网关 RSA 签名/验签 | crypto |
| PaymentOrchestrator | 订单记录、分发 Provider、状态更新、列表/统计 | db, orderService, providers |

## 用户故事

1. 作为开发者，我想在不对接真实支付宝的情况下测试支付创建逻辑，以便测试运行更快
2. 作为开发者，我想新增 Stripe 支付时只需编写一个 Provider 类，不修改现有代码
3. 作为维护者，我想在修改微信支付回调验证逻辑时不会意外破坏支付宝或者银联
4. 作为 AFK 代理，我想通过阅读 AlipayProvider 完整理解支付宝对接逻辑，不需要在 700 行代码中追踪 if/else 分支
5. 作为测试者，我想针对每个 Provider 分别编写单元测试，模拟回调请求和验签

## 实现决策

### 架构决策

- **每个 Provider 是独立类**，构造器接受支付配置对象（appId、privateKey、publicKey 等）
- **PaymentOrchestrator** 持有 `Map<paymentMethod, PaymentProvider>`，按 method 分发
- **沙箱模式**：当某网关未配置时，注入 `SandboxProvider`（生成模拟二维码、自动模拟支付成功）
- **PaymentProvider 不访问数据库**——仅处理外部支付网关通信。所有数据库操作由 PaymentOrchestrator 负责
- **OrderService 依赖已在上一轮注入**，本 PRD 不改变此关系

### 配置结构

```typescript
// 每个 Provider 的配置契约
interface PaymentConfig {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  // 支付宝
  alipay?: { appId, privateKey, publicKey, gateway, notifyUrl };
  // 微信
  wechat?: { appId, mchId, apiKeyV3, serialNo, privateKey, notifyUrl };
  // 银联
  unionpay?: { merchantId, certPath, certPassword, notifyUrl };
}
```

### 接口变更

- PaymentOrchestrator 保持 PaymentService 的现有公开方法签名不变
- REST 路由文件和 GraphQL resolver 无需改动——它们调用 PaymentOrchestrator 的方法
- 删除 PaymentService 类，替换为 PaymentOrchestrator + Providers

## 测试决策

### 好测试描述

- 测试 AlipayProvider.createPayment() 返回正确的表单参数
- 测试 WechatProvider.handleCallback() 正确验证签名
- 测试 PaymentOrchestrator 在 Provider 返回失败时不修改订单状态
- 测试 SandboxProvider 自动生成有效二维码和支付成功回调
- 测试路由分发根据 paymentMethod 选择正确的 Provider
- 不测试真实的支付宝/微信/银联 SDK（使用 mock）

### 模块测试

- `AlipayProvider` — 构造支付请求、解析回调、创建退款
- `WechatProvider` — 同上
- `UnionPayProvider` — 同上
- `PaymentOrchestrator` — 集成测试，使用 SandboxProvider

### 测试先例

遵循已有服务测试模式：内存 SQLite + DI 注入 + supertest。参见 `test/auth.test.ts` 和 `test/orders.test.ts`。

## 超出范围

- 对接真实支付网关的商户资质（营业执照、API 密钥）
- 前端支付页面重构
- 支付渠道动态开关的运行时配置界面
- supplyChainService DI 对齐（独立 PRD）
- SQL 方言分支集中化（独立 PRD）

## 附加说明

- 此 PRD 源自 2026-05-21 架构审查的候选 #3
- 拆分后每个 Provider 约 80–120 行（对比当前 722 行 god 类）
- SandboxProvider 保留现有 `simulatePayment()` 逻辑，使开发环境无需真实密钥
- 拆分后的目录结构：
  ```
  backend/services/payment/
    PaymentOrchestrator.js
    providers/
      PaymentProvider.js     (接口/基类)
      AlipayProvider.js
      WechatProvider.js
      UnionPayProvider.js
      SandboxProvider.js
  ```
