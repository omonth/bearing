"use client";

import { useRouter } from "next/router";
import ProductImage from "@/components/ProductImage";
import { useStorefrontLanguage } from "@/lib/storefrontLanguage";
import type { CartItem } from "@/types";
import { localized } from "@/lib/utils";

interface CartProps {
  items: CartItem[];
  onClose: () => void;
  onRemove: (productId: number) => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  totalPrice: number;
}

export default function Cart({
  items,
  onClose,
  onRemove,
  onUpdateQuantity,
  totalPrice,
}: CartProps) {
  const { language, text } = useStorefrontLanguage();
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/68 backdrop-blur-sm max-sm:items-end"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-[460px] max-w-full flex-col border-l border-white/10 bg-neutral-950 shadow-[0_0_80px_rgba(0,0,0,0.38)] max-sm:h-[86dvh] max-sm:w-full max-sm:rounded-t-lg max-sm:border-l-0 max-sm:border-t"
        onClick={(event) => event.stopPropagation()}
        aria-label={text.cart.title}
        data-testid="storefront-cart"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{text.cart.title}</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {items.length > 0 ? `${items.length} 个商品` : "等待添加商品"}
            </p>
          </div>
          <button
            type="button"
            data-testid="storefront-cart-close"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white active:scale-95"
            aria-label={text.cart.close}
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.025] px-6 text-center">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-md bg-amber-400/10 text-amber-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25h8.386c.51 0 .955-.343 1.087-.835l1.917-7.188A1.125 1.125 0 0 0 17.803 4.75H5.25"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-300">{text.cart.empty}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/");
                }}
                className="mt-5 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-95"
              >
                浏览产品
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid="storefront-cart-item"
                  className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-white/10 pb-4"
                >
                  <ProductImage
                    src={item.image}
                    alt={localized(item.name, language)}
                    className="h-[72px] w-[72px] rounded-md"
                    sizes="72px"
                  />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-neutral-100">
                          {localized(item.name, language)}
                        </h3>
                        <p className="mt-0.5 font-mono text-xs text-neutral-600">
                          {item.model}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="storefront-cart-remove"
                        onClick={() => onRemove(item.id)}
                        className="text-xs font-medium text-red-300 transition hover:text-red-200"
                      >
                        {text.common.cancel}
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-amber-300">
                        ¥{item.price.toFixed(2)}
                      </span>
                      <div className="inline-flex h-8 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
                        <button
                          type="button"
                          data-testid="storefront-cart-decrease"
                          onClick={() =>
                            onUpdateQuantity(item.id, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                          className="w-8 text-sm text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:text-neutral-700"
                          aria-label="减少数量"
                        >
                          -
                        </button>
                        <span className="grid w-9 place-items-center text-sm font-semibold text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          data-testid="storefront-cart-increase"
                          onClick={() =>
                            onUpdateQuantity(
                              item.id,
                              Math.min(item.stock, item.quantity + 1)
                            )
                          }
                          disabled={item.quantity >= item.stock}
                          className="w-8 text-sm text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:text-neutral-700"
                          aria-label="增加数量"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-white/10 bg-neutral-900/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-neutral-400">{text.cart.total}</span>
              <span className="font-mono text-xl font-semibold text-amber-300">
                ¥{totalPrice.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              data-testid="storefront-cart-checkout"
              onClick={() => {
                onClose();
                router.push("/checkout");
              }}
              className="h-11 w-full rounded-md bg-amber-400 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 active:scale-[0.99]"
            >
              {text.cart.checkout}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
