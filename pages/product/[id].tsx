import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '@/components/Header';
import ProductDetail from '@/components/ProductDetail';
import Cart from '@/components/Cart';
import { getProduct, getSimilarProducts } from '@/lib/api';
import type { Bearing, CartItem } from '@/types';

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query;
  const [product, setProduct] = useState<Bearing | null>(null);
  const [similar, setSimilar] = useState<Bearing[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchProduct(Number(id));
    }
  }, [id]);

  const fetchProduct = async (productId: number) => {
    try {
      setLoading(true);
      const data = await getProduct(productId);
      setProduct(data);
      const similarData = await getSimilarProducts(productId);
      setSimilar(similarData);
    } catch (error) {
      console.error('获取产品失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Bearing, quantity = 1) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
      ));
    } else {
      setCart([...cart, { ...product, quantity }]);
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) removeFromCart(productId);
    else setCart(cart.map(item => item.id === productId ? { ...item, quantity } : item));
  };

  if (router.isFallback || loading) {
    return (
      <div className="App">
        <Header cartCount={cart.length} onCartClick={() => setShowCart(!showCart)} />
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <div className="loading-spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="App">
        <Header cartCount={cart.length} onCartClick={() => setShowCart(!showCart)} />
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>产品未找到</h2>
          <button onClick={() => router.push('/')} className="btn-primary">返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{product.name} - 轴承销售系统</title>
        <meta name="description" content={product.description || product.name} />
      </Head>
      <div className="App">
        <Header
          cartCount={cart.reduce((s, i) => s + i.quantity, 0)}
          onCartClick={() => setShowCart(!showCart)}
        />
        <main className="main-content">
          <ProductDetail
            product={product}
            similarProducts={similar}
            onBack={() => router.push('/')}
            onAddToCart={addToCart}
          />
        </main>
        {showCart && (
          <Cart
            items={cart}
            onClose={() => setShowCart(false)}
            onRemove={removeFromCart}
            onUpdateQuantity={updateQuantity}
            totalPrice={cart.reduce((t, i) => t + i.price * i.quantity, 0)}
          />
        )}
      </div>
    </>
  );
}
