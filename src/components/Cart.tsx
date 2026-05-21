import { useEffect, useState } from 'react';
import { useCheckoutStore } from '@/store/checkoutStore';
import { useAuthStore } from '@/store/authStore';
import { getCustomerCoupons } from '@/lib/api';
import type { CartItem } from '@/types';

interface CartProps {
  items: CartItem[];
  onClose: () => void;
  onRemove: (productId: number) => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  totalPrice: number;
}

export default function Cart({ items, onClose, onRemove, onUpdateQuantity, totalPrice }: CartProps) {
  const {
    customerName, customerPhone, province, city, district, addressDetail,
    paymentMethod, checkoutStep, paymentInfo, submitting, paymentStatus,
    selectedCoupon,
    setField, setProvince, setPaymentMethod, setCheckoutStep, setSelectedCoupon,
    submitOrder, resetCheckout, getCities, getAllProvinces,
  } = useCheckoutStore();

  const { token } = useAuthStore();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);

  useEffect(() => {
    if (checkoutStep === 'form' && token && !couponsLoaded) {
      getCustomerCoupons().then(data => {
        setCoupons(data || []);
        setCouponsLoaded(true);
      }).catch(() => setCouponsLoaded(true));
    }
    if (checkoutStep !== 'form') {
      setCouponsLoaded(false);
    }
  }, [checkoutStep, token, couponsLoaded]);

  const cities = getCities();

  const handleCheckout = async () => {
    if (checkoutStep === 'cart') {
      setCheckoutStep('form');
      return;
    }

    if (checkoutStep === 'form') {
      try {
        await submitOrder(items, totalPrice);
      } catch (error: any) {
        alert(error.message || '下单失败');
      }
    }
  };

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>
            {checkoutStep === 'cart' && '购物车'}
            {checkoutStep === 'form' && '填写收货信息'}
            {checkoutStep === 'payment' && '支付'}
          </h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {checkoutStep === 'cart' && (
          <>
            <div className="cart-items">
              {items.length === 0 ? (
                <div className="empty-cart"><p>购物车是空的</p></div>
              ) : (
                items.map(item => (
                  <div key={item.id} className="cart-item">
                    <img src={item.image} alt={item.name} className="cart-item-image" />
                    <div className="cart-item-info">
                      <h4>{item.name}</h4>
                      <p className="cart-item-model">型号: {item.model}</p>
                      <p className="cart-item-price">¥{item.price.toFixed(2)}</p>
                    </div>
                    <div className="cart-item-actions">
                      <div className="cart-quantity">
                        <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}>-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}>+</button>
                      </div>
                      <button className="remove-btn" onClick={() => onRemove(item.id)}>删除</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="cart-footer">
                <div className="cart-total">
                  <span>总计:</span>
                  <span className="total-price">¥{totalPrice.toFixed(2)}</span>
                </div>
                <button className="checkout-btn" onClick={handleCheckout}>去结算</button>
              </div>
            )}
          </>
        )}

        {checkoutStep === 'form' && (
          <div className="checkout-form">
            <div className="form-group">
              <label>收货人</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setField('customerName', e.target.value)}
                placeholder="请输入收货人姓名"
              />
            </div>
            <div className="form-group">
              <label>手机号</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setField('customerPhone', e.target.value)}
                placeholder="请输入手机号"
              />
            </div>
            <div className="form-group">
              <label>省份</label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                <option value="">请选择省份</option>
                {getAllProvinces().map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>城市</label>
              <select
                value={city}
                onChange={(e) => setField('city', e.target.value)}
                disabled={!province}
              >
                <option value="">请选择城市</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>区/县</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setField('district', e.target.value)}
                placeholder="请输入区/县（选填）"
              />
            </div>
            <div className="form-group">
              <label>详细地址</label>
              <textarea
                value={addressDetail}
                onChange={(e) => setField('addressDetail', e.target.value)}
                placeholder="街道、门牌号等详细信息"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>支付方式</label>
              <div className="payment-methods">
                {[
                  { value: 'alipay', label: '支付宝' },
                  { value: 'wechat', label: '微信支付' },
                  { value: 'unionpay', label: '银联/银行卡' },
                  { value: 'cod', label: '货到付款' }
                ].map(m => (
                  <label key={m.value} className={`payment-option ${paymentMethod === m.value ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value={m.value}
                      checked={paymentMethod === m.value}
                      onChange={() => setPaymentMethod(m.value as any)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            {token && coupons.length > 0 && (
              <div className="form-group">
                <label>优惠券</label>
                <select
                  value={selectedCoupon}
                  onChange={(e) => setSelectedCoupon(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                >
                  <option value="">不使用优惠券</option>
                  {coupons.map((c: any) => (
                    <option key={c.id} value={c.code}>
                      {c.coupon_name || c.code}
                      ({c.type === 'fixed' ? `¥${c.discount_value}` : `${c.discount_value}%`}
                      {c.min_order_amount > 0 ? ` 满¥${c.min_order_amount}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="checkout-actions">
              <button className="back-btn" onClick={() => setCheckoutStep('cart')}>返回购物车</button>
              <button className="checkout-btn" onClick={handleCheckout} disabled={submitting}>
                {submitting ? '提交中...' : `确认支付 ¥${totalPrice.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}

        {checkoutStep === 'payment' && paymentInfo && (
          <div className="payment-result">
            {paymentStatus === 'paid' ? (
              <>
                <div className="payment-success-icon">✓</div>
                <h3>支付成功</h3>
                <p>订单号: {paymentInfo.orderNo}</p>
                <p>支付金额: ¥{paymentInfo.amount?.toFixed(2) || totalPrice.toFixed(2)}</p>
              </>
            ) : (
              <>
                <h3>等待支付</h3>
                <p>订单号: {paymentInfo.orderNo}</p>
                {paymentInfo.qrUrl && (
                  <div className="qr-code-section">
                    <p>请使用{paymentMethod === 'alipay' ? '支付宝' : '微信'}扫码支付:</p>
                    <img
                      src={paymentInfo.qrUrl}
                      alt="支付二维码"
                      className="qr-code"
                    />
                  </div>
                )}
                {paymentInfo.paymentMethod === 'unionpay' && paymentInfo.formParams && (
                  <div>
                    <p>点击下方按钮跳转到银联支付页面:</p>
                    <form method="POST" action={paymentInfo.payUrl}>
                      {Object.entries(paymentInfo.formParams).map(([key, value]) => (
                        <input key={key} type="hidden" name={key} value={value as string} />
                      ))}
                      <button type="submit" className="checkout-btn" style={{ marginTop: 12 }}>
                        前往银联支付
                      </button>
                    </form>
                  </div>
                )}
                {paymentInfo.sandbox && (
                  <p style={{ color: '#faad14', fontSize: 13, marginTop: 8 }}>
                    沙箱模式 - {paymentInfo.message}
                  </p>
                )}
                <p style={{ color: '#999', fontSize: 13, marginTop: 8 }}>
                  支付完成后页面将自动更新...
                </p>
              </>
            )}
            <button className="checkout-btn" onClick={resetCheckout}>
              {paymentStatus === 'paid' ? '完成' : '取消支付'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
