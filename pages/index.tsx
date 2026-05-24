import { useEffect } from "react";
import Head from "next/head";
import Header from "@/components/Header";
import ProductList from "@/components/ProductList";
import ProductDetail from "@/components/ProductDetail";
import Cart from "@/components/Cart";
import ChatBot from "@/components/ChatBot";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

export default function Home() {
  const {
    products,
    selectedProduct,
    loading,
    error,
    activeCategory,
    categories,
    fetchProducts,
    fetchCategories,
    setActiveCategory,
    setSelectedProduct,
  } = useProductStore();

  const {
    items: cart,
    showCart,
    addItem,
    removeItem,
    updateQuantity,
    toggleCart,
    setShowCart,
    getTotalPrice,
    getTotalCount,
  } = useCartStore();

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
        <meta name="description" content="专业轴承采购平台" />
      </Head>

      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />

        <main className="max-w-7xl mx-auto px-6 py-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-2 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-neutral-400 text-sm">加载中...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-neutral-400">{error}</p>
              <button
                onClick={() => fetchProducts(activeCategory)}
                className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
              >
                重试
              </button>
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
      <ChatBot />
    </>
  );
}
