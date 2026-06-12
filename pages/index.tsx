import { useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import Header from "@/components/Header";
import ProductList from "@/components/ProductList";
import ProductDetail from "@/components/ProductDetail";
import Cart from "@/components/Cart";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

const ChatBot = dynamic(() => import("@/components/ChatBot"), {
  ssr: false,
});

function ProductListSkeleton() {
  return (
    <div className="space-y-8" aria-label="正在加载产品">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="py-2">
          <div className="h-3 w-44 animate-pulse rounded bg-white/10" />
          <div className="mt-5 h-12 w-full max-w-2xl animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-12 w-4/5 max-w-xl animate-pulse rounded bg-white/10" />
          <div className="mt-6 grid max-w-2xl grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-lg border border-white/10 bg-white/[0.035]"
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className={`aspect-[3/4] animate-pulse rounded-lg bg-white/[0.055] ${
                item === 1 ? "mt-8" : ""
              }`}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="overflow-hidden rounded-lg border border-white/10 bg-neutral-900/70"
          >
            <div className="aspect-[4/3] animate-pulse bg-white/[0.055]" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
              <div className="h-10 animate-pulse rounded bg-white/[0.055]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  }, [fetchCategories, fetchProducts]);

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    fetchProducts(category);
  };

  return (
    <>
      <Head>
        <title>轴承商城 | 工业轴承现货采购</title>
        <meta
          name="description"
          content="专业轴承采购平台，支持按型号、尺寸、分类和库存快速筛选现货轴承。"
        />
        <meta property="og:title" content="轴承商城 | 工业轴承现货采购" />
        <meta
          property="og:description"
          content="按型号、尺寸和库存快速定位可采购轴承。"
        />
      </Head>

      <div className="min-h-screen bg-neutral-950/80">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />

        <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
          {loading ? (
            <ProductListSkeleton />
          ) : error ? (
            <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-red-400/20 bg-red-400/10 px-6 py-16 text-center">
              <h1 className="text-lg font-semibold text-white">产品加载失败</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{error}</p>
              <button
                type="button"
                onClick={() => fetchProducts(activeCategory)}
                className="mt-6 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-95"
              >
                重试
              </button>
            </div>
          ) : selectedProduct ? (
            <ProductDetail
              product={selectedProduct}
              onBack={() => setSelectedProduct(null)}
              onAddToCart={(product, quantity) => {
                addItem(product, quantity);
                setShowCart(true);
              }}
            />
          ) : (
            <ProductList
              products={products}
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              onProductClick={setSelectedProduct}
              onAddToCart={(product) => {
                addItem(product);
                setShowCart(true);
              }}
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
