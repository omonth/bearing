import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const AlipayProvider = require('../services/payment/providers/AlipayProvider');
const UnionPayProvider = require('../services/payment/providers/UnionPayProvider');
const WechatProvider = require('../services/payment/providers/WechatProvider');

describe('real payment provider callback contracts', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('passes the configured Alipay notify URL to precreate and accepts both paid terminal states', async () => {
    const provider = new AlipayProvider({
      appId: '',
      notifyUrl: 'https://shop.example.test/api/payment/alipay/notify',
    });
    provider.alipayClient = {
      exec: vi.fn()
        .mockResolvedValueOnce({ code: '10000', qrCode: 'https://qr.example.test/1' })
        .mockResolvedValueOnce({
          tradeStatus: 'TRADE_FINISHED',
          tradeNo: 'ALI-TRADE-FINISHED',
          totalAmount: '15.00',
          buyerUserId: 'buyer-1',
        }),
    };

    await expect(provider.createPayment({
      orderNo: 'PAY-ALI-NOTIFY-1',
      amount: 15,
      subject: 'bearing',
    })).resolves.toEqual({
      qrCode: 'https://qr.example.test/1',
      tradeNo: '',
    });
    expect(provider.alipayClient.exec).toHaveBeenNthCalledWith(
      1,
      'alipay.trade.precreate',
      {
        notify_url: 'https://shop.example.test/api/payment/alipay/notify',
        bizContent: {
          out_trade_no: 'PAY-ALI-NOTIFY-1',
          total_amount: '15.00',
          subject: 'bearing',
          product_code: 'FACE_TO_FACE_PAYMENT',
        },
      }
    );

    await expect(provider.queryStatus({
      paymentOrder: { transaction_id: 'PAY-ALI-NOTIFY-1', status: 'processing' },
    })).resolves.toEqual({
      status: 'paid',
      tradeNo: 'ALI-TRADE-FINISHED',
      amount: 15,
      payer: { buyerUserId: 'buyer-1' },
    });
  });

  it('fails closed when Alipay precreate has no asynchronous notify URL', async () => {
    const provider = new AlipayProvider({ appId: '', notifyUrl: '' });
    provider.alipayClient = { exec: vi.fn() };

    await expect(provider.createPayment({
      orderNo: 'PAY-ALI-NO-NOTIFY',
      amount: 15,
      subject: 'bearing',
    })).rejects.toMatchObject({ code: 'ALIPAY_NOTIFY_URL_REQUIRED' });
    expect(provider.alipayClient.exec).not.toHaveBeenCalled();
  });

  it('accepts a signed Alipay success callback for the configured application', async () => {
    const provider = new AlipayProvider({ appId: '' });
    provider.config.appId = 'alipay-app-1';
    provider.alipayClient = { checkNotifySign: vi.fn().mockReturnValue(true) };
    const body = {
      app_id: 'alipay-app-1',
      notify_id: 'notify-1',
      out_trade_no: 'PAY-ALI-1',
      trade_no: 'ALI-TRADE-1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '15.00',
      buyer_id: 'buyer-1',
      sign: 'test-signature',
    };

    const result = await provider.handleCallback({ headers: {}, body, rawBody: '' });

    expect(provider.alipayClient.checkNotifySign).toHaveBeenCalledWith(body);
    expect(result).toEqual({
      eventId: 'notify-1',
      transactionId: 'PAY-ALI-1',
      status: 'paid',
      tradeNo: 'ALI-TRADE-1',
      amount: 15,
      payer: { buyer_id: 'buyer-1' },
    });
  });

  it('rejects Alipay callbacks with an invalid signature, missing identity, or invalid amount', async () => {
    const provider = new AlipayProvider({ appId: '' });
    provider.config.appId = 'alipay-app-1';
    provider.alipayClient = { checkNotifySign: vi.fn().mockReturnValue(false) };

    await expect(provider.handleCallback({
      headers: {},
      body: { app_id: 'alipay-app-1' },
      rawBody: '',
    })).rejects.toMatchObject({ code: 'ALIPAY_CALLBACK_SIGNATURE_INVALID' });

    provider.alipayClient.checkNotifySign.mockReturnValue(true);
    await expect(provider.handleCallback({
      headers: {},
      body: { app_id: 'another-app' },
      rawBody: '',
    })).rejects.toMatchObject({ code: 'ALIPAY_CALLBACK_IDENTITY_MISMATCH' });

    await expect(provider.handleCallback({
      headers: {},
      body: {
        out_trade_no: 'PAY-ALI-1',
        trade_no: 'ALI-TRADE-1',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '15.00',
      },
      rawBody: '',
    })).rejects.toMatchObject({ code: 'ALIPAY_CALLBACK_IDENTITY_MISMATCH' });

    await expect(provider.handleCallback({
      headers: {},
      body: {
        app_id: 'alipay-app-1',
        out_trade_no: 'PAY-ALI-1',
        trade_no: 'ALI-TRADE-1',
        trade_status: 'TRADE_SUCCESS',
        total_amount: 'not-a-number',
      },
      rawBody: '',
    })).rejects.toMatchObject({ code: 'ALIPAY_CALLBACK_TRANSACTION_INVALID' });
  });

  it('verifies a UnionPay callback with an ephemeral RSA key and merchant identity', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearing-unionpay-contract-'));
    temporaryDirectories.push(directory);
    const verifyCertPath = path.join(directory, 'verify-public-key.pem');
    fs.writeFileSync(verifyCertPath, publicKey.export({ type: 'spki', format: 'pem' }));

    const provider = new UnionPayProvider({
      merchantId: 'merchant-1',
      verifyCertPath,
    });
    const signedFields = {
      merId: 'merchant-1',
      orderId: 'PAY-UNION-1',
      queryId: 'UNION-QUERY-1',
      respCode: '00',
      txnAmt: '1500',
      txnTime: '20260719100000',
    };
    const signedText = Object.keys(signedFields)
      .sort()
      .map((key) => `${key}=${signedFields[key as keyof typeof signedFields]}`)
      .join('&');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signedText), privateKey).toString('base64');

    const result = await provider.handleCallback({
      headers: {},
      body: { ...signedFields, signature, certId: 'ephemeral' },
      rawBody: '',
    });

    expect(result).toEqual({
      eventId: 'UNION-QUERY-1:20260719100000:00',
      transactionId: 'PAY-UNION-1',
      status: 'paid',
      tradeNo: 'UNION-QUERY-1',
      amount: 15,
    });
  });

  it('rejects a UnionPay callback with a forged signature', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearing-unionpay-contract-'));
    temporaryDirectories.push(directory);
    const verifyCertPath = path.join(directory, 'verify-public-key.pem');
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(verifyCertPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const provider = new UnionPayProvider({ merchantId: 'merchant-1', verifyCertPath });

    await expect(provider.handleCallback({
      headers: {},
      body: {
        merId: 'merchant-1',
        orderId: 'PAY-UNION-1',
        respCode: '00',
        signature: Buffer.from('forged').toString('base64'),
      },
      rawBody: '',
    })).rejects.toThrow('银联回调签名验证失败');
  });

  it('marks UnionPay refunds for manual handling without claiming provider success', async () => {
    const provider = new UnionPayProvider({ merchantId: 'merchant-1' });

    await expect(provider.createRefund({})).resolves.toEqual({
      status: 'manual_required',
      message: '银联退款需要人工处理',
    });
  });

  it('queries an Alipay refund by the stable merchant refund number and validates its amount', async () => {
    const provider = new AlipayProvider({ appId: '' });
    provider.alipayClient = {
      exec: vi.fn().mockResolvedValue({
        code: '10000',
        outTradeNo: 'PAY-ALI-REFUND-1',
        outRequestNo: 'REF-ALI-STABLE-1',
        refundAmount: '15.00',
        refundStatus: 'REFUND_SUCCESS',
        tradeNo: 'ALI-TRADE-REFUND-1',
      }),
    };
    const input = {
      paymentOrder: { transaction_id: 'PAY-ALI-REFUND-1' },
      refund: {
        refund_no: 'REF-ALI-STABLE-1',
        refund_amount: 15,
        provider_refund_id: null,
      },
    };

    await expect(provider.queryRefund(input)).resolves.toEqual({
      status: 'success',
      providerRefundId: 'ALI-TRADE-REFUND-1',
    });
    expect(provider.alipayClient.exec).toHaveBeenCalledWith(
      'alipay.trade.fastpay.refund.query',
      {
        bizContent: {
          out_trade_no: 'PAY-ALI-REFUND-1',
          out_request_no: 'REF-ALI-STABLE-1',
        },
      }
    );

    provider.alipayClient.exec.mockResolvedValueOnce({
      code: '10000',
      outTradeNo: 'PAY-ALI-REFUND-1',
      outRequestNo: 'REF-ALI-STABLE-1',
      refundAmount: '14.99',
      refundStatus: 'REFUND_SUCCESS',
    });
    await expect(provider.queryRefund(input)).rejects.toMatchObject({
      code: 'ALIPAY_REFUND_AMOUNT_MISMATCH',
    });
  });

  it('unwraps the pinned WeChat SDK response for native payment and query', async () => {
    const provider = new WechatProvider({ notifyUrl: 'https://example.test/wechat/notify' });
    provider.wechatClient = {
      transactions_native: vi.fn().mockResolvedValue({
        status: 200,
        data: { code_url: 'weixin://wxpay/test-code' },
      }),
      query: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          trade_state: 'SUCCESS',
          transaction_id: 'WX-TRADE-1',
          amount: { total: 1500, currency: 'CNY' },
          payer: { openid: 'openid-1' },
        },
      }),
    };

    const payment = await provider.createPayment({
      orderNo: 'PAY-WX-1',
      amount: 15,
      subject: 'bearing',
    });
    const status = await provider.queryStatus({
      paymentOrder: { transaction_id: 'PAY-WX-1', status: 'pending' },
    });

    expect(payment).toEqual({
      codeUrl: 'weixin://wxpay/test-code',
      qrCode: 'weixin://wxpay/test-code',
      prepayId: '',
    });
    expect(status).toEqual({
      status: 'paid',
      tradeNo: 'WX-TRADE-1',
      amount: 15,
      payer: { openid: 'openid-1' },
    });
  });

  it('maps the pinned WeChat SDK refund response and rejects non-2xx responses', async () => {
    const provider = new WechatProvider({});
    provider.wechatClient = {
      refunds: vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 'SUCCESS', refund_id: 'WX-REFUND-1' },
        })
        .mockResolvedValueOnce({
          status: 500,
          data: { code: 'SYSTEM_ERROR' },
        }),
    };
    const input = {
      paymentOrder: { transaction_id: 'PAY-WX-1', amount: 15 },
      amount: 15,
      reason: 'return',
      refundNo: 'REFUND-1',
    };

    await expect(provider.createRefund(input)).resolves.toEqual({
      status: 'success',
      providerRefundId: 'WX-REFUND-1',
    });
    await expect(provider.createRefund(input)).rejects.toThrow('微信支付退款请求失败');
  });

  it('queries WeChat refunds by out_refund_no and rejects mismatched provider data', async () => {
    const provider = new WechatProvider({});
    provider.wechatClient = {
      find_refunds: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          status: 'SUCCESS',
          refund_id: 'WX-REFUND-QUERY-1',
          out_refund_no: 'REF-WX-STABLE-1',
          out_trade_no: 'PAY-WX-REFUND-1',
          amount: { refund: 1500, currency: 'CNY' },
        },
      }),
    };
    const input = {
      paymentOrder: { transaction_id: 'PAY-WX-REFUND-1' },
      refund: { refund_no: 'REF-WX-STABLE-1', refund_amount: 15 },
    };

    await expect(provider.queryRefund(input)).resolves.toEqual({
      status: 'success',
      providerRefundId: 'WX-REFUND-QUERY-1',
    });
    expect(provider.wechatClient.find_refunds).toHaveBeenCalledWith('REF-WX-STABLE-1');

    provider.wechatClient.find_refunds.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'SUCCESS',
        refund_id: 'WX-REFUND-QUERY-2',
        out_refund_no: 'REF-WX-STABLE-1',
        out_trade_no: 'PAY-OTHER',
        amount: { refund: 1500, currency: 'CNY' },
      },
    });
    await expect(provider.queryRefund(input)).rejects.toMatchObject({
      code: 'WECHAT_REFUND_QUERY_MISMATCH',
    });
  });
});
