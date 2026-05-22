import { useMemo } from "react";
import type { Bearing } from "@/types";

interface ProductListProps {
  products: Bearing[];
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  onProductClick: (product: Bearing) => void;
  onAddToCart: (product: Bearing) => void;
}

export default function ProductList({
  products,
  categories,
  activeCategory,
  onCategoryChange,
  onProductClick,
  onAddToCart,
}: ProductListProps) {
  const cats = useMemo(
    () =>
      categories || [
        "全部",
        ...Array.from(new Set(products.map((p) => p.category))),
      ],
    [categories, products]
  );

  const filteredProducts = useMemo(
    () =>
      !activeCategory || activeCategory === "全部"
        ? products
        : products.filter((p) => p.category === activeCategory),
    [activeCategory, products]
  );

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-px mb-8 border-b border-neutral-800 scrollbar-none">
        {cats.map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              onClick={() => onCategoryChange?.(category)}
              className={`relative px-4 py-2.5 text-sm whitespace-nowrap transition-colors shrink-0 ${
                isActive
                  ? "text-amber-400 font-medium"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {category}
              {isActive && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-amber-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Product grid — 3 cols on desktop, 2 on tablet, 1 on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className="group bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-700 transition-colors"
          >
            {/* Image */}
            <div
              className="relative aspect-[4/3] cursor-pointer bg-neutral-950"
              onClick={() => onProductClick(product)}
            >
              <img
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
              <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] text-neutral-400 bg-neutral-950/80 rounded">
                库存 {product.stock}
              </span>
            </div>

            {/* Info */}
            <div className="p-3.5 space-y-2">
              <h3
                className="text-sm font-medium text-neutral-200 cursor-pointer hover:text-amber-400 transition-colors line-clamp-1"
                onClick={() => onProductClick(product)}
              >
                {product.name}
              </h3>

              <p className="text-xs font-mono text-neutral-400">
                {product.model}
              </p>

              <div className="flex gap-3 text-[11px] text-neutral-400">
                <span>内径 {product.specs?.innerDiameter}</span>
                <span>外径 {product.specs?.outerDiameter}</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                <span className="text-base font-bold text-amber-400">
                  ¥{product.price.toFixed(2)}
                </span>
                <button
                  onClick={() => onAddToCart(product)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  加入购物车
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
