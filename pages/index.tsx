import { useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import Header from "@/components/Header";
import ProductList from "@/components/ProductList";
import ChatBotEntry from "@/components/ChatBotEntry";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

const ProductDetail = dynamic(() => import("@/components/ProductDetail"), {
  loading: () => <ProductDetailSkeleton />,
});

const Cart = dynamic(() => import("@/components/Cart"), {
  ssr: false,
});

function ProductDetailSkeleton() {
  return (
    <div className="space-y-6" aria-label="正在加载商品详情">
      <div className="h-9 w-24 animate-pulse rounded-md bg-white/[0.055]" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div className="space-y-3">
          <div className="aspect-square animate-pulse rounded-lg border border-white/10 bg-white/[0.055]" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-md bg-white/[0.035]"
              />
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-3 w-32 animate-pulse rounded bg-amber-300/20" />
          <div className="h-10 w-4/5 animate-pulse rounded bg-white/10" />
          <div className="h-5 w-36 animate-pulse rounded bg-white/[0.055]" />
          <div className="h-px bg-white/10" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-11 animate-pulse rounded-md bg-white/[0.035]"
              />
            ))}
          </div>
          <div className="h-11 w-full animate-pulse rounded-md bg-amber-300/20" />
        </div>
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
          {error ? (
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
              loading={loading}
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
      <ChatBotEntry />
    </>
  );
}
