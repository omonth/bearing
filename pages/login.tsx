import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '@/components/Header';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { items: cart, toggleCart, getTotalCount } = useCartStore();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!phone || !password) {
      setError('请填写手机号和密码');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(phone, password);
      } else {
        await register({ name: name || undefined, phone, password });
      }
      router.push('/account');
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>{mode === 'login' ? '登录' : '注册'} - 轴承商城</title>
      </Head>
      <div className="App">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <main className="main-content">
          <div style={{ maxWidth: 400, margin: '40px auto' }}>
            <div style={{ display: 'flex', marginBottom: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
              <button
                onClick={() => { setMode('login'); setError(''); }}
                style={{
                  flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                  background: mode === 'login' ? '#1890ff' : '#fff',
                  color: mode === 'login' ? '#fff' : '#333',
                  fontSize: 16, fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                登录
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); }}
                style={{
                  flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                  background: mode === 'register' ? '#1890ff' : '#fff',
                  color: mode === 'register' ? '#fff' : '#333',
                  fontSize: 16, fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                注册
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {mode === 'register' && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>姓名（选填）</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入姓名"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>手机号</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                />
              </div>

              {error && (
                <p style={{ color: '#ff4d4f', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', padding: '12px', background: '#1890ff', color: '#fff',
                  border: 'none', borderRadius: 6, fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  opacity: submitting ? 0.7 : 1, transition: 'all 0.2s',
                }}
              >
                {submitting ? '请稍候...' : (mode === 'login' ? '登录' : '注册')}
              </button>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}
