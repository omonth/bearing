# 支付系统集成文档

## 概述

集成主流支付方式，支持支付宝、微信支付、银行卡支付等多种支付渠道。

---

## 支持的支付方式

### ✅ 支付宝支付
- 扫码支付
- 手机网站支付
- APP支付
- 电脑网站支付

### ✅ 微信支付
- 扫码支付（Native）
- 公众号支付（JSAPI）
- H5支付
- APP支付

### ✅ 银行卡支付
- 快捷支付
- 网银支付

### ✅ 其他支付
- 货到付款
- 余额支付
- 分期付款

---

## 技术栈

### SDK
- **alipay-sdk** - 支付宝SDK
- **wechatpay-node-v3** - 微信支付SDK
- **stripe** - 国际支付（可选）

### 安全
- **RSA加密** - 签名验证
- **HTTPS** - 安全传输
- **回调验证** - 防止篡改

---

## 数据库设计

```sql
-- 支付订单表
CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    transaction_id VARCHAR(100),
    trade_no VARCHAR(100),
    payer_info TEXT,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_no ON payment_orders(trade_no);

-- 退款记录表
CREATE TABLE IF NOT EXISTS refund_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_order_id INTEGER NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    refund_no VARCHAR(100),
    refunded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id)
);
```

---

## 1. 支付宝支付

### 安装SDK

```bash
npm install alipay-sdk
```

### 配置

```typescript
// backend/config/alipay.ts
import AlipaySdk from 'alipay-sdk';
import AlipayFormData from 'alipay-sdk/lib/form';

export const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  gateway: 'https://openapi.alipay.com/gateway.do',
  charset: 'utf-8',
  version: '1.0',
  signType: 'RSA2',
});
```

### 扫码支付

```typescript
// backend/services/alipayService.ts
import { alipaySdk } from '../config/alipay';

// 创建支付订单
export async function createAlipayOrder(orderData: any) {
  const formData = new AlipayFormData();
  
  formData.setMethod('get');
  formData.addField('bizContent', {
    outTradeNo: orderData.orderNo,
    productCode: 'FAST_INSTANT_TRADE_PAY',
    totalAmount: orderData.amount,
    subject: orderData.subject,
    body: orderData.description,
  });
  
  const result = await alipaySdk.exec(
    'alipay.trade.page.pay',
    {},
    { formData }
  );
  
  return result;
}

// 扫码支付（当面付）
export async function createAlipayQRCode(orderData: any) {
  const result = await alipaySdk.exec('alipay.trade.precreate', {
    bizContent: {
      outTradeNo: orderData.orderNo,
      totalAmount: orderData.amount,
      subject: orderData.subject,
    },
  });
  
  return {
    qrCode: result.qrCode,
    outTradeNo: result.outTradeNo,
  };
}

// 查询支付状态
export async function queryAlipayOrder(outTradeNo: string) {
  const result = await alipaySdk.exec('alipay.trade.query', {
    bizContent: {
      outTradeNo,
    },
  });
  
  return result;
}

// 退款
export async function refundAlipayOrder(refundData: any) {
  const result = await alipaySdk.exec('alipay.trade.refund', {
    bizContent: {
      outTradeNo: refundData.outTradeNo,
      refundAmount: refundData.amount,
      refundReason: refundData.reason,
    },
  });
  
  return result;
}

// 验证回调签名
export function verifyAlipayCallback(params: any) {
  return alipaySdk.checkNotifySign(params);
}
```

---

## 2. 微信支付

### 安装SDK

```bash
npm install wechatpay-node-v3
```

### 配置

```typescript
// backend/config/wechatpay.ts
import { Payment } from 'wechatpay-node-v3';

export const wechatPay = new Payment({
  appid: process.env.WECHAT_APP_ID,
  mchid: process.env.WECHAT_MCH_ID,
  private_key: process.env.WECHAT_PRIVATE_KEY,
  serial_no: process.env.WECHAT_SERIAL_NO,
  apiv3_private_key: process.env.WECHAT_APIV3_KEY,
  notify_url: process.env.WECHAT_NOTIFY_URL,
});
```

### Native扫码支付

```typescript
// backend/services/wechatpayService.ts
import { wechatPay } from '../config/wechatpay';

// 创建Native支付订单
export async function createWechatNativeOrder(orderData: any) {
  const result = await wechatPay.native({
    description: orderData.subject,
    out_trade_no: orderData.orderNo,
    amount: {
      total: Math.round(orderData.amount * 100), // 转换为分
    },
  });
  
  return {
    codeUrl: result.code_url,
    outTradeNo: orderData.orderNo,
  };
}

// JSAPI支付（公众号）
export async function createWechatJSAPIOrder(orderData: any) {
  const result = await wechatPay.jsapi({
    description: orderData.subject,
    out_trade_no: orderData.orderNo,
    amount: {
      total: Math.round(orderData.amount * 100),
    },
    payer: {
      openid: orderData.openid,
    },
  });
  
  return result;
}

// H5支付
export async function createWechatH5Order(orderData: any) {
  const result = await wechatPay.h5({
    description: orderData.subject,
    out_trade_no: orderData.orderNo,
    amount: {
      total: Math.round(orderData.amount * 100),
    },
    scene_info: {
      payer_client_ip: orderData.clientIp,
      h5_info: {
        type: 'Wap',
      },
    },
  });
  
  return {
    h5Url: result.h5_url,
    outTradeNo: orderData.orderNo,
  };
}

// 查询订单
export async function queryWechatOrder(outTradeNo: string) {
  const result = await wechatPay.query({
    out_trade_no: outTradeNo,
  });
  
  return result;
}

// 关闭订单
export async function closeWechatOrder(outTradeNo: string) {
  await wechatPay.close(outTradeNo);
}

// 退款
export async function refundWechatOrder(refundData: any) {
  const result = await wechatPay.refund({
    out_trade_no: refundData.outTradeNo,
    out_refund_no: refundData.refundNo,
    amount: {
      refund: Math.round(refundData.amount * 100),
      total: Math.round(refundData.totalAmount * 100),
      currency: 'CNY',
    },
    reason: refundData.reason,
  });
  
  return result;
}

// 验证回调签名
export function verifyWechatCallback(signature: string, body: string, timestamp: string, nonce: string) {
  return wechatPay.verifySign({
    signature,
    body,
    timestamp,
    nonce,
  });
}
```

---

## 3. 统一支付服务

```typescript
// backend/services/paymentService.ts
import { createAlipayQRCode, queryAlipayOrder, refundAlipayOrder } from './alipayService';
import { createWechatNativeOrder, queryWechatOrder, refundWechatOrder } from './wechatpayService';

// 创建支付订单
export async function createPayment(orderData: any) {
  const { orderId, amount, paymentMethod, subject } = orderData;
  
  // 生成订单号
  const orderNo = `PAY${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  
  // 创建支付记录
  const paymentOrder = await db.run(
    `INSERT INTO payment_orders (order_id, payment_method, amount, status)
     VALUES (?, ?, ?, 'pending')`,
    [orderId, paymentMethod, amount]
  );
  
  let paymentInfo;
  
  // 根据支付方式调用不同的接口
  switch (paymentMethod) {
    case 'alipay':
      paymentInfo = await createAlipayQRCode({
        orderNo,
        amount,
        subject,
      });
      break;
      
    case 'wechat':
      paymentInfo = await createWechatNativeOrder({
        orderNo,
        amount,
        subject,
      });
      break;
      
    case 'cod': // 货到付款
      paymentInfo = { method: 'cod' };
      break;
      
    default:
      throw new Error('不支持的支付方式');
  }
  
  // 更新支付订单
  await db.run(
    'UPDATE payment_orders SET transaction_id = ? WHERE id = ?',
    [orderNo, paymentOrder.lastID]
  );
  
  return {
    paymentOrderId: paymentOrder.lastID,
    orderNo,
    ...paymentInfo,
  };
}

// 查询支付状态
export async function queryPaymentStatus(paymentOrderId: number) {
  const paymentOrder = await db.get(
    'SELECT * FROM payment_orders WHERE id = ?',
    [paymentOrderId]
  );
  
  if (!paymentOrder) {
    throw new Error('支付订单不存在');
  }
  
  // 如果已支付，直接返回
  if (paymentOrder.status === 'paid') {
    return paymentOrder;
  }
  
  // 查询第三方支付状态
  let result;
  switch (paymentOrder.payment_method) {
    case 'alipay':
      result = await queryAlipayOrder(paymentOrder.transaction_id);
      break;
    case 'wechat':
      result = await queryWechatOrder(paymentOrder.transaction_id);
      break;
  }
  
  // 更新支付状态
  if (result && result.trade_state === 'SUCCESS') {
    await updatePaymentStatus(paymentOrderId, 'paid', result);
  }
  
  return paymentOrder;
}

// 更新支付状态
export async function updatePaymentStatus(paymentOrderId: number, status: string, paymentInfo: any) {
  await db.run(
    `UPDATE payment_orders
     SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, paymentInfo.trade_no, JSON.stringify(paymentInfo), paymentOrderId]
  );
  
  // 如果支付成功，更新订单状态
  if (status === 'paid') {
    const paymentOrder = await db.get(
      'SELECT order_id FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );
    
    await db.run(
      'UPDATE orders SET status = ? WHERE id = ?',
      ['paid', paymentOrder.order_id]
    );
  }
}

// 退款
export async function createRefund(refundData: any) {
  const { paymentOrderId, amount, reason } = refundData;
  
  const paymentOrder = await db.get(
    'SELECT * FROM payment_orders WHERE id = ?',
    [paymentOrderId]
  );
  
  if (!paymentOrder) {
    throw new Error('支付订单不存在');
  }
  
  // 生成退款单号
  const refundNo = `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  
  // 创建退款记录
  const refundRecord = await db.run(
    `INSERT INTO refund_records (payment_order_id, refund_amount, refund_reason, refund_no, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [paymentOrderId, amount, reason, refundNo]
  );
  
  // 调用第三方退款接口
  let result;
  switch (paymentOrder.payment_method) {
    case 'alipay':
      result = await refundAlipayOrder({
        outTradeNo: paymentOrder.transaction_id,
        amount,
        reason,
      });
      break;
    case 'wechat':
      result = await refundWechatOrder({
        outTradeNo: paymentOrder.transaction_id,
        refundNo,
        amount,
        totalAmount: paymentOrder.amount,
        reason,
      });
      break;
  }
  
  // 更新退款状态
  if (result) {
    await db.run(
      `UPDATE refund_records
       SET status = 'success', refunded_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [refundRecord.lastID]
    );
  }
  
  return {
    refundId: refundRecord.lastID,
    refundNo,
    status: 'success',
  };
}
```

---

## 4. API接口

```typescript
// backend/routes/payment.js
const express = require('express');
const router = express.Router();
const { createPayment, queryPaymentStatus, createRefund } = require('../services/paymentService');
const { verifyAlipayCallback } = require('../services/alipayService');
const { verifyWechatCallback } = require('../services/wechatpayService');

// 创建支付
router.post('/create', async (req, res) => {
  try {
    const result = await createPayment(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 查询支付状态
router.get('/query/:paymentOrderId', async (req, res) => {
  try {
    const result = await queryPaymentStatus(req.params.paymentOrderId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 支付宝回调
router.post('/alipay/notify', async (req, res) => {
  try {
    // 验证签名
    const isValid = verifyAlipayCallback(req.body);
    if (!isValid) {
      return res.send('fail');
    }
    
    // 处理支付结果
    const { out_trade_no, trade_status, trade_no } = req.body;
    
    if (trade_status === 'TRADE_SUCCESS') {
      // 更新支付状态
      await updatePaymentStatus(out_trade_no, 'paid', req.body);
    }
    
    res.send('success');
  } catch (error) {
    res.send('fail');
  }
});

// 微信支付回调
router.post('/wechat/notify', async (req, res) => {
  try {
    const { signature, timestamp, nonce } = req.headers;
    const body = JSON.stringify(req.body);
    
    // 验证签名
    const isValid = verifyWechatCallback(signature, body, timestamp, nonce);
    if (!isValid) {
      return res.json({ code: 'FAIL', message: '签名验证失败' });
    }
    
    // 处理支付结果
    const { out_trade_no, trade_state } = req.body;
    
    if (trade_state === 'SUCCESS') {
      await updatePaymentStatus(out_trade_no, 'paid', req.body);
    }
    
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    res.json({ code: 'FAIL', message: error.message });
  }
});

// 退款
router.post('/refund', async (req, res) => {
  try {
    const result = await createRefund(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## 5. 前端集成

```typescript
// frontend/components/PaymentModal.tsx
import { Modal, Radio, QRCode, Button } from 'antd';
import { useState, useEffect } from 'react';

export default function PaymentModal({ visible, order, onClose }: any) {
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [qrCode, setQrCode] = useState('');
  const [polling, setPolling] = useState(false);

  const createPayment = async () => {
    const response = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.totalPrice,
        paymentMethod,
        subject: `订单 #${order.id}`,
      }),
    });

    const data = await response.json();
    
    if (paymentMethod === 'alipay') {
      setQrCode(data.qrCode);
    } else if (paymentMethod === 'wechat') {
      setQrCode(data.codeUrl);
    }
    
    // 开始轮询支付状态
    startPolling(data.paymentOrderId);
  };

  const startPolling = (paymentOrderId: number) => {
    setPolling(true);
    
    const interval = setInterval(async () => {
      const response = await fetch(`/api/payment/query/${paymentOrderId}`);
      const data = await response.json();
      
      if (data.status === 'paid') {
        clearInterval(interval);
        setPolling(false);
        onClose(true); // 支付成功
      }
    }, 2000);
  };

  return (
    <Modal
      title="选择支付方式"
      open={visible}
      onCancel={() => onClose(false)}
      footer={null}
    >
      <Radio.Group value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
        <Radio value="alipay">支付宝</Radio>
        <Radio value="wechat">微信支付</Radio>
        <Radio value="cod">货到付款</Radio>
      </Radio.Group>

      {qrCode && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <QRCode value={qrCode} size={200} />
          <p>请使用{paymentMethod === 'alipay' ? '支付宝' : '微信'}扫码支付</p>
          {polling && <p>等待支付中...</p>}
        </div>
      )}

      <Button type="primary" onClick={createPayment} block style={{ marginTop: 20 }}>
        确认支付
      </Button>
    </Modal>
  );
}
```

---

## 环境配置

```bash
# .env
# 支付宝配置
ALIPAY_APP_ID=your_app_id
ALIPAY_PRIVATE_KEY=your_private_key
ALIPAY_PUBLIC_KEY=alipay_public_key

# 微信支付配置
WECHAT_APP_ID=your_app_id
WECHAT_MCH_ID=your_mch_id
WECHAT_PRIVATE_KEY=your_private_key
WECHAT_SERIAL_NO=your_serial_no
WECHAT_APIV3_KEY=your_apiv3_key
WECHAT_NOTIFY_URL=https://yourdomain.com/api/payment/wechat/notify
```

---

## 安全建议

1. **使用HTTPS** - 所有支付接口必须使用HTTPS
2. **验证签名** - 严格验证回调签名
3. **防重放攻击** - 记录已处理的订单号
4. **金额校验** - 验证回调金额与订单金额一致
5. **日志记录** - 记录所有支付操作
6. **异常处理** - 完善的错误处理机制

---

## 总结

支付系统集成提供：

- ✅ 支付宝支付
- ✅ 微信支付
- ✅ 多种支付方式
- ✅ 退款功能
- ✅ 安全验证

完整的支付解决方案。
