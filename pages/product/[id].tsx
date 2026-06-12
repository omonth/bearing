import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Header from "@/components/Header";
import ProductDetail from "@/components/ProductDetail";
import { localized } from "@/lib/utils";
import Cart from "@/components/Cart";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query;

  const {
    currentProduct: product,
    similarProducts: similar,
    detailLoading: loading,
    fetchProductDetail,
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
    if (id) {
      fetchProductDetail(Number(id));
    }
  }, [fetchProductDetail, id]);

  if (router.isFallback || loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <h2 className="text-lg font-medium text-neutral-300">产品未找到</h2>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{localized(product.name)} - 轴承销售系统</title>
        <meta
          name="description"
          content={localized(product.description) || localized(product.name)}
        />
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <ProductDetail
            product={product}
            similarProducts={similar}
            onBack={() => router.push("/")}
            onAddToCart={(product, quantity) => { addItem(product, quantity); setShowCart(true); }}
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
