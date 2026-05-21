import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '@/components/Header';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { getCustomerOrders, getCustomerCoupons } from '@/lib/api';

type Tab = 'orders' | 'coupons';

const statusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
};

const statusColors: Record<string, string> = {
  pending: '#faad14',
  paid: '#1890ff',
  shipped: '#722ed1',
  completed: '#52c41a',
  cancelled: '#999',
};

const levelLabels: Record<string, string> = {
  bronze: '铜牌会员',
  silver: '银牌会员',
  gold: '金牌会员',
  platinum: '铂金会员',
  diamond: '钻石会员',
};

export default function AccountPage() {
  const router = useRouter();
  const { user, token, loading, fetchMe, logout } = useAuthStore();
  const { getTotalCount, toggleCart } = useCartStore();
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    fetchMe();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    if (tab === 'orders') {
      getCustomerOrders().then(setOrders).catch(() => {}).finally(() => setFetching(false));
    } else {
      getCustomerCoupons().then(setCoupons).catch(() => {}).finally(() => setFetching(false));
    }
  }, [tab, token]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!token) return null;

  return (
    <>
      <Head>
        <title>个人中心 - 轴承商城</title>
      </Head>
      <div className="App">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <main className="main-content">
          <div style={{ maxWidth: 800, margin: '20px auto' }}>
            {/* User info card */}
            <div style={{ background: '#fff', borderRadius: 8, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>{user?.name || user?.phone}</h2>
                <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>手机号: {user?.phone}</p>
                <p style={{ color: '#666', fontSize: 14 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12,
                    background: user?.level === 'diamond' ? '#e6f7ff' : '#fff7e6',
                    color: user?.level === 'diamond' ? '#1890ff' : '#fa8c16',
                    marginRight: 12,
                  }}>
                    {levelLabels[user?.level || 'bronze'] || user?.level}
                  </span>
                  积分: <strong>{user?.points || 0}</strong>
                </p>
              </div>
              <button
                onClick={handleLogout}
                style={{ padding: '8px 20px', background: '#fff', color: '#ff4d4f', border: '1px solid #ff4d4f', borderRadius: 6, fontSize: 14 }}
              >
                退出登录
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e8', background: '#fff' }}>
              {[
                { key: 'orders', label: '我的订单' },
                { key: 'coupons', label: '我的优惠券' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as Tab)}
                  style={{
                    flex: 1, padding: '12px', border: 'none', cursor: 'pointer', fontSize: 15,
                    background: tab === t.key ? '#1890ff' : 'transparent',
                    color: tab === t.key ? '#fff' : '#333',
                    fontWeight: tab === t.key ? 600 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            {fetching ? (
              <p style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</p>
            ) : tab === 'orders' ? (
              orders.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 8, padding: 60, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <p style={{ color: '#999', fontSize: 16, marginBottom: 16 }}>暂无订单</p>
                  <button
                    onClick={() => router.push('/')}
                    style={{ padding: '10px 24px', background: '#1890ff', color: '#fff', borderRadius: 6, fontSize: 14 }}
                  >
                    去逛逛
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {orders.map(order => (
                    <div key={order.id} style={{ background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, color: '#999' }}>订单号: </span>
                          <strong style={{ fontSize: 16 }}>#{order.id}</strong>
                        </div>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12,
                          background: (statusColors[order.status] || '#999') + '20',
                          color: statusColors[order.status] || '#999',
                          fontWeight: 600,
                        }}>
                          {statusLabels[order.status] || order.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                        {order.province} {order.city} {order.address_detail}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#999' }}>{order.created_at}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#ff4d4f' }}>¥{order.total_price?.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              coupons.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 8, padding: 60, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <p style={{ color: '#999', fontSize: 16 }}>暂无优惠券</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {coupons.map((c: any) => (
                    <div key={c.id} style={{ background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <strong style={{ fontSize: 16 }}>{c.coupon_name || c.code}</strong>
                        <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                          {c.type === 'fixed' ? `¥${c.discount_value} 直减` : `${c.discount_value}% 折扣`}
                          {c.min_order_amount > 0 ? ` · 满¥${c.min_order_amount}可用` : ''}
                        </p>
                        <p style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                          有效期: {c.valid_from || '即日'} ~ {c.valid_until || '长期'}
                        </p>
                      </div>
                      <span style={{ fontSize: 13, color: '#52c41a', fontWeight: 600 }}>可用</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </main>
      </div>
    </>
  );
}
