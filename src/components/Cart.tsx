"use client";

import { useEffect, useState, useMemo } from "react";
import { useCheckoutStore } from "@/store/checkoutStore";
import { useAuthStore } from "@/store/authStore";
import { getCustomerCoupons } from "@/lib/api";
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
  const {
    customerName,
    customerPhone,
    province,
    city,
    district,
    addressDetail,
    paymentMethod,
    checkoutStep,
    paymentInfo,
    submitting,
    paymentStatus,
    selectedCoupon,
    setField,
    setProvince,
    setPaymentMethod,
    setCheckoutStep,
    setSelectedCoupon,
    submitOrder,
    resetCheckout,
    getCities,
    getAllProvinces,
  } = useCheckoutStore();

  const { token } = useAuthStore();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);

  useEffect(() => {
    if (checkoutStep === "form" && token && !couponsLoaded) {
      getCustomerCoupons()
        .then((data) => {
          setCoupons(data || []);
          setCouponsLoaded(true);
        })
        .catch(() => setCouponsLoaded(true));
    }
    if (checkoutStep !== "form") {
      setCouponsLoaded(false);
    }
  }, [checkoutStep, token, couponsLoaded]);

  useEffect(() => {
    return () => {
      useCheckoutStore.getState().clearPolling();
    };
  }, []);

  const cities = useMemo(() => getCities(), [getCities]);

  const handleCheckout = async () => {
    if (checkoutStep === "cart") {
      setCheckoutStep("form");
      return;
    }
    if (checkoutStep === "form") {
      try {
        await submitOrder(items, totalPrice);
      } catch (error: any) {
        alert(error.message || "下单失败");
      }
    }
  };

  const stepTitle =
    checkoutStep === "cart"
      ? "购物车"
      : checkoutStep === "form"
        ? "填写收货信息"
        : "支付";

  const inputClass =
    "w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors";

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
          <h2 className="text-base font-semibold text-white">{stepTitle}</h2>
          <button
            onClick={onClose}
            aria-label="关闭购物车"
            className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step: Cart */}
        {checkoutStep === "cart" && (
          <>
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
                              onUpdateQuantity(item.id, Math.min(item.stock, item.quantity + 1))
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

            {items.length > 0 && (
              <div className="p-5 border-t border-neutral-800 bg-neutral-950/50">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-neutral-400">总计</span>
                  <span className="text-xl font-bold text-amber-400">
                    ¥{totalPrice.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={handleCheckout}
                  className="w-full py-3 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  去结算
                </button>
              </div>
            )}
          </>
        )}

        {/* Step: Form */}
        {checkoutStep === "form" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                收货人
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setField("customerName", e.target.value)}
                placeholder="请输入收货人姓名"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                手机号
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setField("customerPhone", e.target.value)}
                placeholder="请输入手机号"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                省份
              </label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className={inputClass}
              >
                <option value="">请选择省份</option>
                {getAllProvinces().map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                城市
              </label>
              <select
                value={city}
                onChange={(e) => setField("city", e.target.value)}
                disabled={!province}
                className={inputClass}
              >
                <option value="">请选择城市</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                区/县
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setField("district", e.target.value)}
                placeholder="请输入区/县（选填）"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                详细地址
              </label>
              <textarea
                value={addressDetail}
                onChange={(e) => setField("addressDetail", e.target.value)}
                placeholder="街道、门牌号等详细信息"
                rows={3}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                支付方式
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "alipay", label: "支付宝" },
                  { value: "wechat", label: "微信支付" },
                  { value: "unionpay", label: "银联/银行卡" },
                  { value: "cod", label: "货到付款" },
                ].map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm transition-colors ${
                      paymentMethod === m.value
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={m.value}
                      checked={paymentMethod === m.value}
                      onChange={() => setPaymentMethod(m.value as any)}
                      className="accent-amber-500"
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            {token && coupons.length > 0 && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5">
                  优惠券
                </label>
                <select
                  value={selectedCoupon}
                  onChange={(e) => setSelectedCoupon(e.target.value)}
                  className={inputClass}
                >
                  <option value="">不使用优惠券</option>
                  {coupons.map((c: any) => (
                    <option key={c.id} value={c.code}>
                      {c.coupon_name || c.code} (
                      {c.type === "fixed"
                        ? `¥${c.discount_value}`
                        : `${c.discount_value}%`}
                      {c.min_order_amount > 0
                        ? ` 满¥${c.min_order_amount}`
                        : ""}
                      )
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCheckoutStep("cart")}
                className="px-5 py-2.5 text-sm text-neutral-400 bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors shrink-0"
              >
                返回购物车
              </button>
              <button
                onClick={handleCheckout}
                disabled={submitting}
                className="flex-1 py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
              >
                {submitting
                  ? "提交中..."
                  : `确认支付 ¥${totalPrice.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {checkoutStep === "payment" && paymentInfo && (
          <div className="flex-1 overflow-y-auto p-5 text-center">
            {paymentStatus === "paid" ? (
              <div className="space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">支付成功</h3>
                <p className="text-sm text-neutral-400">
                  订单号: {paymentInfo.orderNo}
                </p>
                <p className="text-sm text-neutral-400">
                  支付金额: ¥
                  {paymentInfo.amount?.toFixed(2) || totalPrice.toFixed(2)}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white">等待支付</h3>
                <p className="text-sm text-neutral-400">
                  订单号: {paymentInfo.orderNo}
                </p>
                {paymentInfo.qrUrl && (
                  <div>
                    <p className="text-sm text-neutral-400 mb-3">
                      请使用
                      {paymentMethod === "alipay" ? "支付宝" : "微信"}
                      扫码支付:
                    </p>
                    <img
                      src={paymentInfo.qrUrl}
                      alt="支付二维码"
                      className="w-[200px] h-[200px] border border-neutral-800 rounded-lg mx-auto"
                    />
                  </div>
                )}
                {paymentInfo.paymentMethod === "unionpay" &&
                  paymentInfo.formParams && (
                    <div>
                      <p className="text-sm text-neutral-400 mb-3">
                        点击下方按钮跳转到银联支付页面:
                      </p>
                      <form
                        method="POST"
                        action={paymentInfo.payUrl}
                      >
                        {Object.entries(paymentInfo.formParams).map(
                          ([key, value]) => (
                            <input
                              key={key}
                              type="hidden"
                              name={key}
                              value={value as string}
                            />
                          )
                        )}
                        <button
                          type="submit"
                          className="w-full py-3 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                        >
                          前往银联支付
                        </button>
                      </form>
                    </div>
                  )}
                {paymentInfo.sandbox && (
                  <p className="text-xs text-amber-400">
                    沙箱模式 - {paymentInfo.message}
                  </p>
                )}
                <p className="text-xs text-neutral-600">
                  支付完成后页面将自动更新...
                </p>
              </div>
            )}
            <button
              onClick={resetCheckout}
              className="w-full py-3 mt-6 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
            >
              {paymentStatus === "paid" ? "完成" : "取消支付"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
