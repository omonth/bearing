"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import { useCheckoutStore } from "@/store/checkoutStore";
import type { CartItem } from "@/types";

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
  const router = useRouter();
  const { clearPolling } = useCheckoutStore();

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex justify-end z-50 animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="w-[450px] max-w-full bg-neutral-900 flex flex-col animate-[slideIn_0.25s_ease] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-base font-semibold text-white">购物车</h2>
          <button
            onClick={onClose}
            aria-label="关闭购物车"
            className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-neutral-600 text-sm">
              购物车是空的
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 pb-4 border-b border-neutral-800"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-[72px] h-[72px] object-cover rounded-md shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-neutral-200 line-clamp-1">
                      {item.name}
                    </h4>
                    <p className="text-xs font-mono text-neutral-600 mt-0.5">
                      {item.model}
                    </p>
                    <p className="text-sm font-bold text-amber-400 mt-1.5">
                      ¥{item.price.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center border border-neutral-700 rounded">
                      <button
                        onClick={() =>
                          onUpdateQuantity(item.id, item.quantity - 1)
                        }
                        disabled={item.quantity <= 1}
                        className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          onUpdateQuantity(
                            item.id,
                            Math.min(item.stock, item.quantity + 1)
                          )
                        }
                        disabled={item.quantity >= item.stock}
                        className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-5 border-t border-neutral-800 bg-neutral-950/50">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-neutral-400">总计</span>
              <span className="text-xl font-bold text-amber-400">
                ¥{totalPrice.toFixed(2)}
              </span>
            </div>
            <button
              onClick={() => {
                onClose();
                router.push("/checkout");
              }}
              className="w-full py-3 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
            >
              去结算
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
