import { useState, useEffect, useRef } from 'react';
import { createOrder, createPayment, queryPaymentStatus } from '@/lib/api';
import type { CartItem } from '@/types';

// Province/city data for cascading selector
const REGION_DATA: Record<string, string[]> = {
  '北京市': ['东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '顺义区', '通州区', '大兴区', '房山区'],
  '上海市': ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '闵行区', '宝山区', '浦东新区'],
  '广东省': ['广州市', '深圳市', '珠海市', '汕头市', '佛山市', '韶关市', '湛江市', '肇庆市', '江门市', '茂名市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'],
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'],
  '江苏省': ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'],
  '山东省': ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市', '日照市', '临沂市', '德州市', '聊城市', '滨州市', '菏泽市'],
  '四川省': ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市', '南充市', '眉山市', '宜宾市', '广安市', '达州市', '雅安市', '巴中市', '资阳市'],
  '湖北省': ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市', '咸宁市', '随州市', '恩施州'],
  '湖南省': ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', '怀化市', '娄底市'],
  '福建省': ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'],
  '河南省': ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市', '漯河市', '三门峡市', '南阳市', '商丘市', '信阳市', '周口市', '驻马店市'],
  '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'],
  '辽宁省': ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'],
  '陕西省': ['西安市', '铜川市', '宝鸡市', '咸阳市', '渭南市', '延安市', '汉中市', '榆林市', '安康市', '商洛市'],
  '重庆市': ['渝中区', '江北区', '南岸区', '九龙坡区', '沙坪坝区', '大渡口区', '北碚区', '渝北区', '巴南区'],
  '天津市': ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区'],
};

const PROVINCES = Object.keys(REGION_DATA);
const OTHER_PROVINCES = ['安徽省', '山西省', '贵州省', '云南省', '甘肃省', '青海省', '吉林省', '黑龙江省', '海南省', '广西壮族自治区', '宁夏回族自治区', '新疆维吾尔自治区', '西藏自治区', '内蒙古自治区', '香港特别行政区', '澳门特别行政区'];

interface CartProps {
  items: CartItem[];
  onClose: () => void;
  onRemove: (productId: number) => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  totalPrice: number;
}

export default function Cart({ items, onClose, onRemove, onUpdateQuantity, totalPrice }: CartProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'form' | 'payment'>('cart');
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const cities = province ? (REGION_DATA[province] || ['其他']) : [];
  const allProvinces = [...PROVINCES, ...OTHER_PROVINCES].sort();

  // 支付状态轮询
  useEffect(() => {
    if (checkoutStep === 'payment' && paymentInfo?.paymentOrderId && paymentStatus === 'pending') {
      pollingRef.current = setInterval(async () => {
        try {
          const result = await queryPaymentStatus(paymentInfo.paymentOrderId);
          if (result.status === 'paid') {
            setPaymentStatus('paid');
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } catch {}
      }, 2000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [checkoutStep, paymentInfo, paymentStatus]);

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    setCity('');
    setDistrict('');
  };

  const handleCheckout = async () => {
    if (checkoutStep === 'cart') {
      setCheckoutStep('form');
      return;
    }

    if (checkoutStep === 'form') {
      if (!customerName || !customerPhone || !province || !city || !addressDetail) {
        alert('请填写完整的收货信息');
        return;
      }
      setSubmitting(true);
      try {
        const orderResult = await createOrder({
          customerName,
          customerPhone,
          province,
          city,
          district,
          addressDetail,
          items: items.map(item => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price
          })),
          totalPrice
        });

        const payment = await createPayment({
          orderId: orderResult.orderId,
          amount: totalPrice,
          paymentMethod,
          subject: `订单 #${orderResult.orderId}`
        });

        setPaymentInfo({ ...payment, amount: totalPrice, paymentOrderId: payment.paymentOrderId });
        setCheckoutStep('payment');
      } catch (error: any) {
        alert(error.message || '下单失败');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const resetCheckout = () => {
    setCheckoutStep('cart');
    setPaymentInfo(null);
    setPaymentStatus('pending');
    if (pollingRef.current) clearInterval(pollingRef.current);
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
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="请输入收货人姓名"
              />
            </div>
            <div className="form-group">
              <label>手机号</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="请输入手机号"
              />
            </div>
            <div className="form-group">
              <label>省份</label>
              <select
                value={province}
                onChange={(e) => handleProvinceChange(e.target.value)}
              >
                <option value="">请选择省份</option>
                {allProvinces.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>城市</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
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
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="请输入区/县（选填）"
              />
            </div>
            <div className="form-group">
              <label>详细地址</label>
              <textarea
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
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
                      onChange={() => setPaymentMethod(m.value)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
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
                    <form method="POST" action={paymentInfo.payUrl} ref={(form) => {
                      if (form && paymentInfo.formParams) {
                        // 自动提交表单跳转到银联
                      }
                    }}>
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
