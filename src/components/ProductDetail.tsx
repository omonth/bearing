import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    onAddToCart(product, quantity);
    alert(`已添加 ${quantity} 件 ${localized(product.name)} 到购物车`);
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 px-4 py-2 text-sm text-neutral-400 hover:text-amber-400 transition-colors"
      >
        {t("product.backToList")}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <img
            src={product.image || "/placeholder.svg"}
            alt={localized(product.name)}
            className="w-full aspect-square object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {localized(product.name)}
            </h1>
            <p className="text-sm text-neutral-400">{product.category}</p>
          </div>

          <div className="flex items-center justify-between py-4 border-y border-neutral-800">
            <span className="text-[28px] font-bold text-amber-400">
              ¥{product.price.toFixed(2)}
            </span>
            <span className="text-sm text-neutral-500">
              库存 {product.stock} 件
            </span>
          </div>

          {/* Specs table */}
          <div>
            <h3 className="text-sm font-medium text-neutral-300 mb-3">
              {t("product.specs")}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between py-2 px-3 bg-neutral-900 rounded">
                <span className="text-neutral-400">{t("product.model")}</span>
                <span className="font-mono text-neutral-200">{product.model}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-neutral-900 rounded">
                <span className="text-neutral-400">{t("product.innerDiameter")}</span>
                <span className="text-neutral-200">{product.specs?.innerDiameter}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-neutral-900 rounded">
                <span className="text-neutral-400">{t("product.outerDiameter")}</span>
                <span className="text-neutral-200">{product.specs?.outerDiameter}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-neutral-900 rounded">
                <span className="text-neutral-400">{t("product.width")}</span>
                <span className="text-neutral-200">{product.specs?.width}</span>
              </div>
            </div>
          </div>

          {product.description && (
            <div>
              <h3 className="text-sm font-medium text-neutral-300 mb-2">
                {t("product.description")}
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                {localized(product.description)}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 items-end">
            <div className="flex items-center border border-neutral-700 rounded-md">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="px-3 py-2.5 text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors"
              >
                −
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                }
                min="1"
                max={product.stock}
                className="w-14 text-center bg-transparent text-sm font-medium text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() =>
                  setQuantity(Math.min(product.stock, quantity + 1))
                }
                disabled={quantity >= product.stock}
                className="px-3 py-2.5 text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors"
              >
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              className="flex-1 py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
            >
              {t("product.addToCart")}
            </button>
          </div>

          {/* Similar products */}
          {similarProducts.length > 0 && (
            <div className="pt-6 border-t border-neutral-800">
              <h3 className="text-sm font-medium text-neutral-300 mb-3">
                {t("product.similarProducts")}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {similarProducts.map((p) => (
                  <div
                    key={p.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-md p-2.5 cursor-pointer hover:border-neutral-700 transition-colors"
                  >
                    <img
                      src={p.image || "/placeholder.svg"}
                      alt={localized(p.name)}
                      className="w-full aspect-square object-cover rounded mb-2"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                    <p className="text-xs text-neutral-400 line-clamp-1">
                      {localized(p.name)}
                    </p>
                    <p className="text-sm font-bold text-amber-400 mt-1">
                      ¥{p.price.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
