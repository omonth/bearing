import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProductImage from "@/components/ProductImage";
import type { Bearing } from "@/types";
import { localized } from "@/lib/utils";

interface ProductListProps {
  products: Bearing[];
  categories?: string[];
  activeCategory?: string;
  loading?: boolean;
  onCategoryChange?: (category: string) => void;
  onProductClick: (product: Bearing) => void;
  onAddToCart: (product: Bearing) => void;
}

function ProductGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading products"
    >
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
  );
}

export default function ProductList({
  products,
  categories,
  activeCategory,
  loading = false,
  onCategoryChange,
  onProductClick,
  onAddToCart,
}: ProductListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const allCategoriesLabel = t("product.allCategories");

  const cats = useMemo(
    () =>
      categories && categories.length > 0
        ? categories
        : [
            "全部",
            ...Array.from(new Set(products.map((product) => product.category))),
          ],
    [categories, products]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const categoryFiltered =
      !activeCategory || activeCategory === "全部"
        ? products
        : products.filter((product) => product.category === activeCategory);

    if (!normalizedQuery) {
      return categoryFiltered;
    }

    return categoryFiltered.filter((product) => {
      const haystack = [
        localized(product.name),
        localized(product.description),
        product.model,
        product.category,
        product.specs?.innerDiameter,
        product.specs?.outerDiameter,
        product.specs?.width,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [activeCategory, normalizedQuery, products]);

  const totalStock = useMemo(
    () => products.reduce((sum, product) => sum + product.stock, 0),
    [products]
  );
  const featuredProducts = filteredProducts.slice(0, 3);
  const isInitialLoading = loading && products.length === 0;
  const shouldShowFeatured = isInitialLoading || featuredProducts.length > 0;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-end">
        <div className="max-w-3xl py-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            Bearing procurement
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.02] text-white text-balance sm:text-5xl lg:text-6xl">
            快速筛选可交付轴承型号
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400 text-pretty">
            面向工厂备件、维修和小批量采购，按型号、尺寸、分类和库存快速定位可下单产品。
          </p>

          <div className="mt-7 grid max-w-2xl grid-cols-3 gap-3">
            {[
              { label: "在售型号", value: isInitialLoading ? "..." : products.length },
              { label: "现货库存", value: isInitialLoading ? "..." : totalStock },
              {
                label: "产品分类",
                value: isInitialLoading ? "..." : Math.max(cats.length - 1, 0),
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="font-mono text-xl font-semibold text-white">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {shouldShowFeatured && (
          <div className="grid grid-cols-3 gap-3 lg:pb-2">
            {isInitialLoading
              ? [0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className={`text-left ${item === 1 ? "mt-8" : ""}`}
                  >
                    <div className="aspect-[3/4] animate-pulse rounded-lg border border-white/10 bg-white/[0.055]" />
                    <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/10" />
                  </div>
                ))
              : featuredProducts.map((product, index) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => onProductClick(product)}
                    className={`group text-left transition duration-300 hover:-translate-y-1 active:translate-y-0 ${
                      index === 1 ? "mt-8" : ""
                    }`}
                  >
                    <ProductImage
                      src={product.image}
                      alt={localized(product.name)}
                      className="aspect-[3/4] rounded-lg border border-white/10"
                      imageClassName="transition duration-500 group-hover:scale-105"
                      sizes="(max-width: 1024px) 30vw, 180px"
                      priority
                    />
                    <span className="mt-2 block truncate text-xs font-medium text-neutral-300">
                      {product.model}
                    </span>
                  </button>
                ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">产品目录</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {isInitialLoading ? "..." : filteredProducts.length} 个结果
              {query ? ` · 搜索 "${query}"` : ""}
            </p>
          </div>

          <label className="relative block w-full lg:w-[360px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                />
              </svg>
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("product.searchPlaceholder")}
              className="h-11 w-full rounded-md border border-white/10 bg-white/[0.045] pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition focus:border-amber-400/70 focus:bg-white/[0.07]"
            />
          </label>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-px scrollbar-none">
          {cats.map((category) => {
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => onCategoryChange?.(category)}
                className={`relative shrink-0 px-4 py-2.5 text-sm transition ${
                  isActive
                    ? "text-amber-300"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
              >
                {category === "全部" ? allCategoriesLabel : category}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-amber-300" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {isInitialLoading ? (
        <ProductGridSkeleton />
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.025] px-6 py-14 text-center">
          <h3 className="text-base font-semibold text-white">没有匹配的产品</h3>
          <p className="mt-2 text-sm text-neutral-500">
            换一个型号、尺寸或分类关键词再试。
          </p>
          {(query || activeCategory !== "全部") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onCategoryChange?.("全部");
              }}
              className="mt-5 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-95"
            >
              清除筛选
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product, index) => {
            const inStock = product.stock > 0;
            return (
              <article
                key={product.id}
                className="group overflow-hidden rounded-lg border border-white/10 bg-neutral-900/80 shadow-[0_22px_70px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-1 hover:border-amber-400/30 hover:bg-neutral-900"
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onProductClick(product)}
                >
                  <ProductImage
                    src={product.image}
                    alt={localized(product.name)}
                    className="aspect-[4/3]"
                    imageClassName="transition duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    priority={index < 3}
                  />
                </button>

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => onProductClick(product)}
                    >
                      <h3 className="truncate text-sm font-semibold text-neutral-100 transition group-hover:text-amber-200">
                        {localized(product.name)}
                      </h3>
                      <p className="mt-1 font-mono text-xs text-neutral-500">
                        {product.model}
                      </p>
                    </button>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                        inStock
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-red-400/10 text-red-300"
                      }`}
                    >
                      {inStock ? `${t("product.stock")} ${product.stock}` : "缺货"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
                    <span className="rounded-md bg-white/[0.035] px-2 py-1.5">
                      {t("product.innerDiameter")} {product.specs?.innerDiameter}
                    </span>
                    <span className="rounded-md bg-white/[0.035] px-2 py-1.5">
                      {t("product.outerDiameter")} {product.specs?.outerDiameter}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="font-mono text-lg font-semibold text-amber-300">
                      ¥{product.price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddToCart(product)}
                      disabled={!inStock}
                      className="rounded-md bg-amber-400 px-3 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
                    >
                      {t("product.addToCart")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
