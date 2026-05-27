import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Header from "@/components/Header";
import { localized } from "@/lib/utils";
import { useCartStore } from "@/store/cartStore";
import { useCheckoutStore } from "@/store/checkoutStore";
import { useAuthStore } from "@/store/authStore";
import { getCustomerCoupons } from "@/lib/api";

const steps = ["确认商品", "收货地址", "支付"];

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items,
    removeItem,
    updateQuantity,
    getTotalPrice,
    getTotalCount,
    toggleCart,
    clearCart,
  } = useCartStore();

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
    couponDiscount,
    setField,
    setProvince,
    setPaymentMethod,
    setCheckoutStep,
    setSelectedCoupon,
    submitOrder,
    resetCheckout,
    clearPolling,
    getCities,
    getAllProvinces,
    getFinalPrice,
  } = useCheckoutStore();

  const { token } = useAuthStore();
  const [coupons, setCoupons] = useState<any[]>([]);

  const totalPrice = getTotalPrice();
  const cities = useMemo(() => getCities(), [province]);

  // Load coupons
  useEffect(() => {
    if (token) {
      getCustomerCoupons()
        .then((data) => setCoupons(data || []))
        .catch(() => {});
    }
  }, [token]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

  // Redirect to home if cart is empty and not in payment step
  useEffect(() => {
    if (items.length === 0 && checkoutStep === "cart") {
      router.push("/");
    }
  }, [items.length, checkoutStep]);

  const stepIndex = checkoutStep === "cart" ? 0 : checkoutStep === "form" ? 1 : 2;

  const handleSubmitOrder = async () => {
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(customerPhone)) {
      alert("请输入正确的手机号");
      return;
    }
    if (!customerName.trim()) {
      alert("请填写收货人姓名");
      return;
    }
    if (!province || !city) {
      alert("请选择省份和城市");
      return;
    }
    if (!addressDetail.trim()) {
      alert("请填写详细地址");
      return;
    }
    try {
      await submitOrder(items, totalPrice);
    } catch (error: any) {
      alert(error.message || "下单失败");
    }
  };

  const handleComplete = () => {
    resetCheckout();
    if (paymentStatus === "paid") {
      clearCart();
    }
    router.push("/account");
  };

  const finalPrice = useMemo(() => getFinalPrice(totalPrice), [totalPrice, getFinalPrice, couponDiscount]);
  const discountAmount = totalPrice - finalPrice;

  const inputClass =
    "w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors";

  return (
    <>
      <Head>
        <title>结账 - 轴承商城</title>
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />

        <main className="max-w-3xl mx-auto px-6 py-8">
          {/* Step progress bar */}
          <div className="flex items-center mb-10">
            {steps.map((label, i) => {
              const isActive = i === stepIndex;
              const isDone = i < stepIndex;
              return (
                <div key={label} className="flex-1 flex items-center">
                  {/* Step circle */}
                  <div className="flex flex-col items-center relative">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                        isDone
                          ? "bg-amber-500 text-neutral-950"
                          : isActive
                            ? "bg-amber-500/20 border-2 border-amber-500 text-amber-400"
                            : "bg-neutral-800 border-2 border-neutral-700 text-neutral-600"
                      }`}
                    >
                      {isDone ? "✓" : i + 1}
                    </div>
                    <span
                      className={`mt-2 text-xs whitespace-nowrap ${
                        isActive
                          ? "text-amber-400 font-medium"
                          : isDone
                            ? "text-neutral-400"
                            : "text-neutral-600"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-2 mt-[-16px] ${
                        i < stepIndex ? "bg-amber-500" : "bg-neutral-800"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step 1: Review items */}
          {checkoutStep === "cart" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white">确认商品</h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-4"
                  >
                    <img
                      src={item.image}
                      alt={localized(item.name)}
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
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            disabled={item.quantity <= 1}
                            className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                          >
                            −
                          </button>
                          <span className="text-sm font-medium text-white w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                Math.min(item.stock, item.quantity + 1)
                              )
                            }
                            disabled={item.quantity >= item.stock}
                            className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white disabled:text-neutral-700 transition-colors text-sm"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
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

              {/* Coupon */}
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

              <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
                <span className="text-sm text-neutral-400">
                  共 {items.reduce((s, i) => s + i.quantity, 0)} 件
                </span>
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
                        <span className="text-emerald-400">
                          -¥{discountAmount.toFixed(2)}
                        </span>
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

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => router.push("/")}
                  className="px-5 py-2.5 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  继续购物
                </button>
                <button
                  onClick={() => setCheckoutStep("form")}
                  className="px-8 py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  下一步
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Address form */}
          {checkoutStep === "form" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white">收货信息</h2>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1.5">
                      收货人 *
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
                      手机号 *
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) =>
                        setField("customerPhone", e.target.value)
                      }
                      placeholder="请输入手机号"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1.5">
                      省份 *
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
                      城市 *
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
                      区/县 *
                    </label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setField("district", e.target.value)}
                      placeholder="请输入区/县"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1.5">
                    详细地址 *
                  </label>
                  <textarea
                    value={addressDetail}
                    onChange={(e) => setField("addressDetail", e.target.value)}
                    placeholder="街道、门牌号等详细信息"
                    rows={2}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-2">
                    支付方式
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "alipay", label: "支付宝" },
                      { value: "wechat", label: "微信" },
                      { value: "unionpay", label: "银联" },
                      { value: "cod", label: "货到付款" },
                    ].map((m) => (
                      <label
                        key={m.value}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border cursor-pointer text-sm transition-colors ${
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
                          onChange={() =>
                            setPaymentMethod(m.value as any)
                          }
                          className="accent-amber-500"
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-between">
                <button
                  onClick={() => setCheckoutStep("cart")}
                  className="px-5 py-2.5 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  ← 返回
                </button>
                <div className="text-right">
                  {discountAmount > 0 && (
                    <p className="text-xs text-emerald-400 mb-0.5">
                      已优惠 ¥{discountAmount.toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-neutral-500 mb-1" suppressHydrationWarning>
                    合计 ¥{finalPrice.toFixed(2)}
                  </p>
                  <button
                    onClick={handleSubmitOrder}
                    disabled={submitting}
                    className="px-8 py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
                  >
                    {submitting ? "提交中..." : "确认下单"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {checkoutStep === "payment" && paymentInfo && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white">支付</h2>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-4">
                {paymentStatus === "paid" ? (
                  <>
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
                  </>
                ) : (
                  <>
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
                          <form method="POST" action={paymentInfo.payUrl}>
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
                  </>
                )}
                <button
                  onClick={handleComplete}
                  className="w-full py-3 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  {paymentStatus === "paid" ? "查看订单" : "取消支付"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
