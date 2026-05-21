import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '@/components/Header';
import ProductDetail from '@/components/ProductDetail';
import Cart from '@/components/Cart';
import { useProductStore } from '@/store/productStore';
import { useCartStore } from '@/store/cartStore';

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query;

  const { currentProduct: product, similarProducts: similar, detailLoading: loading, fetchProductDetail } = useProductStore();
  const { items: cart, showCart, addItem, removeItem, updateQuantity, toggleCart, setShowCart, getTotalPrice, getTotalCount } = useCartStore();

  useEffect(() => {
    if (id) {
      fetchProductDetail(Number(id));
    }
  }, [id]);

  if (router.isFallback || loading) {
    return (
      <div className="App">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
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
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
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
          cartCount={getTotalCount()}
          onCartClick={toggleCart}
        />
        <main className="main-content">
          <ProductDetail
            product={product}
            similarProducts={similar}
            onBack={() => router.push('/')}
            onAddToCart={addItem}
          />
        </main>
        {showCart && (
          <Cart
            items={cart}
            onClose={() => setShowCart(false)}
            onRemove={removeItem}
            onUpdateQuantity={updateQuantity}
            totalPrice={getTotalPrice()}
          />
        )}
      </div>
    </>
  );
}
