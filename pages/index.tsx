import { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '@/components/Header';
import ProductList from '@/components/ProductList';
import ProductDetail from '@/components/ProductDetail';
import Cart from '@/components/Cart';
import { getProducts, getCategories } from '@/lib/api';
import type { Bearing, CartItem } from '@/types';

export default function Home() {
  const [products, setProducts] = useState<Bearing[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Bearing | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async (category?: string) => {
    try {
      setLoading(true);
      const data = await getProducts(category);
      setProducts(data);
    } catch (error) {
      console.error('获取产品失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const cats = await getCategories();
      setCategories(['全部', ...cats]);
    } catch {}
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    fetchProducts(category);
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
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.id === productId ? { ...item, quantity } : item
      ));
    }
  };

  const getTotalPrice = () =>
    cart.reduce((total, item) => total + item.price * item.quantity, 0);

  return (
    <>
      <Head>
        <title>轴承销售系统</title>
        <meta name="description" content="专业轴承销售商城" />
      </Head>
      <div className="App">
        <Header
          cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={() => setShowCart(!showCart)}
        />
        <main className="main-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <div className="loading-spinner" />
              <p>加载中...</p>
            </div>
          ) : selectedProduct ? (
            <ProductDetail
              product={selectedProduct}
              onBack={() => setSelectedProduct(null)}
              onAddToCart={addToCart}
            />
          ) : (
            <ProductList
              products={products}
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              onProductClick={setSelectedProduct}
              onAddToCart={addToCart}
            />
          )}
        </main>
        {showCart && (
          <Cart
            items={cart}
            onClose={() => setShowCart(false)}
            onRemove={removeFromCart}
            onUpdateQuantity={updateQuantity}
            totalPrice={getTotalPrice()}
          />
        )}
      </div>
    </>
  );
}
