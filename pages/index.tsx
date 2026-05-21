import { useEffect } from 'react';
import Head from 'next/head';
import Header from '@/components/Header';
import ProductList from '@/components/ProductList';
import ProductDetail from '@/components/ProductDetail';
import Cart from '@/components/Cart';
import { useProductStore } from '@/store/productStore';
import { useCartStore } from '@/store/cartStore';

export default function Home() {
  const {
    products, selectedProduct, loading, activeCategory, categories,
    fetchProducts, fetchCategories, setActiveCategory, setSelectedProduct,
  } = useProductStore();

  const { items: cart, showCart, addItem, removeItem, updateQuantity, toggleCart, setShowCart, getTotalPrice, getTotalCount } = useCartStore();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    fetchProducts(category);
  };

  return (
    <>
      <Head>
        <title>轴承销售系统</title>
        <meta name="description" content="专业轴承销售商城" />
      </Head>
      <div className="App">
        <Header
          cartCount={getTotalCount()}
          onCartClick={toggleCart}
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
              onAddToCart={addItem}
            />
          ) : (
            <ProductList
              products={products}
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              onProductClick={setSelectedProduct}
              onAddToCart={addItem}
            />
          )}
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
