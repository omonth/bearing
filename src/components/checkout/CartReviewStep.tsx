import { useMemo } from "react";
import Image from "next/image";
import type { CartItem, CustomerCoupon } from "@/types/index";
import { localized } from "@/lib/utils";
import { inputClass, primaryBtnClass, secondaryBtnClass } from "./shared";

interface CartReviewStepProps {
  items: CartItem[];
  authenticated: boolean;
  coupons: CustomerCoupon[];
  selectedCoupon: string;
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
  onRemoveItem: (id: number) => void;
  onUpdateQuantity: (id: number, qty: number) => void;
  onSelectCoupon: (code: string) => void;
  onBackToCart: () => void;
  onProceed: () => void;
}

export default function CartReviewStep({
  items,
  authenticated,
  coupons,
  selectedCoupon,
  totalPrice,
  discountAmount,
  finalPrice,
  onRemoveItem,
  onUpdateQuantity,
  onSelectCoupon,
  onBackToCart,
  onProceed,
}: CartReviewStepProps) {
  const itemCount = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items]
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">确认商品</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            data-testid="checkout-cart-item"
            className="flex gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-4"
          >
            <Image
              src={item.image || "/placeholder.svg"}
              alt={localized(item.name)}
              width={80}
              height={80}
              className="w-20 h-20 object-cover rounded-md shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-neutral-200 line-clamp-1">
                {localized(item.name)}
              </h4>
              <p className="text-xs font-mono text-neutral-500 mt-0.5">
                {item.model}
              </p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button
                    data-testid="checkout-cart-decrease"
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                  >
                    −
                  </button>
                  <span className="text-sm font-medium text-white w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    data-testid="checkout-cart-increase"
                    onClick={() =>
                      onUpdateQuantity(item.id, Math.min(item.stock, item.quantity + 1))
                    }
                    disabled={item.quantity >= item.stock}
                    className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                  >
                    +
                  </button>
                </div>
                <button
                  data-testid="checkout-cart-remove"
                  onClick={() => onRemoveItem(item.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-amber-400" suppressHydrationWarning>
                ¥{item.price.toFixed(2)}
              </p>
              <p className="text-xs text-neutral-500 mt-1" suppressHydrationWarning>
                小计 ¥{(item.price * item.quantity).toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Coupon selector */}
      {authenticated && coupons.length > 0 && (
        <div>
          <label className="block text-xs text-neutral-400 mb-1.5">优惠券</label>
          <select
            value={selectedCoupon}
            onChange={(e) => onSelectCoupon(e.target.value)}
            className={inputClass}
          >
            <option value="">不使用优惠券</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.code}>
                {c.coupon_name || c.code} (
                {c.type === "fixed" ? `¥${c.discount_value}` : `${c.discount_value}%`}
                {c.min_order_amount > 0 ? ` 满¥${c.min_order_amount}` : ""})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Price summary */}
      <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
        <span className="text-sm text-neutral-400">共 {itemCount} 件</span>
        <div className="flex flex-col items-end gap-1">
          {discountAmount > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-400">小计</span>
                <span className="text-neutral-400" suppressHydrationWarning>
                  ¥{totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-emerald-400">优惠</span>
                <span className="text-emerald-400">-¥{discountAmount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-400">合计</span>
            <span className="text-xl font-bold text-amber-400" suppressHydrationWarning>
              ¥{finalPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button onClick={onBackToCart} className={secondaryBtnClass}>
          继续购物
        </button>
        <button data-testid="checkout-proceed-to-address" onClick={onProceed} className={primaryBtnClass}>
          下一步
        </button>
      </div>
    </div>
  );
}
