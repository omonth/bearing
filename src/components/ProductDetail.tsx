import { useState } from "react";
import ProductImage from "@/components/ProductImage";
import { useStorefrontLanguage } from "@/lib/storefrontLanguage";
import type { Bearing } from "@/types";
import { localized } from "@/lib/utils";

interface ProductDetailProps {
  product: Bearing;
  similarProducts?: Bearing[];
  onBack: () => void;
  onAddToCart: (product: Bearing, quantity: number) => void;
}

export default function ProductDetail({
  product,
  similarProducts = [],
  onBack,
  onAddToCart,
}: ProductDetailProps) {
  const { language, text } = useStorefrontLanguage();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const inStock = product.stock > 0;
  const maxQuantity = Math.max(product.stock, 1);
  const productName = localized(product.name, language);
  const productDescription = localized(product.description, language);

  const setSafeQuantity = (value: number) => {
    setQuantity(Math.min(maxQuantity, Math.max(1, value)));
  };

  const handleAddToCart = () => {
    if (!inStock) {
      return;
    }

    onAddToCart(product, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        data-testid="storefront-product-back"
        onClick={onBack}
        className="rounded-md px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/5 hover:text-amber-300 active:scale-95"
      >
        {text.product.backToList}
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div className="space-y-3">
          <ProductImage
            src={product.image}
            alt={productName}
            className="aspect-square rounded-lg border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            imageClassName="transition duration-500 hover:scale-[1.03]"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
          <div className="grid grid-cols-3 gap-2 text-xs text-neutral-500">
            <div className="rounded-md bg-white/[0.035] px-3 py-2">
              <span className="block text-neutral-300">{product.category}</span>
              分类
            </div>
            <div className="rounded-md bg-white/[0.035] px-3 py-2">
              <span className="block font-mono text-neutral-300">
                {product.model}
              </span>
              型号
            </div>
            <div className="rounded-md bg-white/[0.035] px-3 py-2">
              <span className="block font-mono text-neutral-300">
                {product.stock}
              </span>
              库存
            </div>
          </div>
        </div>

        <div className="space-y-7">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              Product detail
            </p>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight text-white text-balance sm:text-4xl">
              {productName}
            </h1>
            <p className="mt-3 text-sm text-neutral-500">{product.category}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/10 py-5">
            <span className="font-mono text-3xl font-semibold text-amber-300">
              ¥{product.price.toFixed(2)}
            </span>
            <span
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                inStock
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-red-400/10 text-red-300"
              }`}
            >
              {inStock ? `库存 ${product.stock} 件` : "暂时缺货"}
            </span>
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-neutral-200">
              {text.product.specs}
            </h2>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {[
                [text.product.model, product.model],
                [text.product.innerDiameter, product.specs?.innerDiameter],
                [text.product.outerDiameter, product.specs?.outerDiameter],
                [text.product.width, product.specs?.width],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-md bg-white/[0.035] px-3 py-2.5"
                >
                  <span className="text-neutral-500">{label}</span>
                  <span className="font-mono text-neutral-200">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {productDescription && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-neutral-200">
                {text.product.description}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-neutral-400 text-pretty">
                {productDescription}
              </p>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="inline-flex h-11 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
                <button
                  type="button"
                  onClick={() => setSafeQuantity(quantity - 1)}
                  disabled={quantity <= 1 || !inStock}
                  className="w-11 text-neutral-400 transition hover:bg-white/5 hover:text-white active:scale-95 disabled:text-neutral-700"
                  aria-label="减少数量"
                >
                  -
                </button>
                <input
                  type="number"
                  data-testid="storefront-detail-quantity"
                  value={quantity}
                  onChange={(event) =>
                    setSafeQuantity(parseInt(event.target.value, 10) || 1)
                  }
                  min="1"
                  max={maxQuantity}
                  disabled={!inStock}
                  className="w-16 bg-transparent text-center text-sm font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setSafeQuantity(quantity + 1)}
                  disabled={quantity >= maxQuantity || !inStock}
                  className="w-11 text-neutral-400 transition hover:bg-white/5 hover:text-white active:scale-95 disabled:text-neutral-700"
                  aria-label="增加数量"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                data-testid="storefront-detail-add-to-cart"
                onClick={handleAddToCart}
                disabled={!inStock}
                className="h-11 flex-1 rounded-md bg-amber-400 px-5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
              >
                {text.product.addToCart}
              </button>
            </div>

            {added && (
              <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
                已加入购物车，可继续选购或打开购物车结算。
              </p>
            )}
          </section>
        </div>
      </div>

      {similarProducts.length > 0 && (
        <section className="border-t border-white/10 pt-7">
          <h2 className="mb-4 text-sm font-semibold text-neutral-200">
            {text.product.similarProducts}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {similarProducts.map((similarProduct) => (
              <article
                key={similarProduct.id}
                className="rounded-lg border border-white/10 bg-white/[0.035] p-2.5 transition hover:border-amber-400/30"
              >
                <ProductImage
                  src={similarProduct.image}
                  alt={localized(similarProduct.name, language)}
                  className="aspect-square rounded-md"
                  sizes="(max-width: 768px) 50vw, 180px"
                />
                <p className="mt-2 truncate text-xs text-neutral-300">
                  {localized(similarProduct.name, language)}
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-amber-300">
                  ¥{similarProduct.price.toFixed(2)}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
