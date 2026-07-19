import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Header from "@/components/Header";
import CartReviewStep from "@/components/checkout/CartReviewStep";
import AddressFormStep from "@/components/checkout/AddressFormStep";
import PaymentStep from "@/components/checkout/PaymentStep";
import { useCartStore, useTotalPrice, useTotalCount } from "@/store/cartStore";
import { useCheckoutStore, useCities, useAllProvinces, useFinalPrice } from "@/store/checkoutStore";
import { useAuthStore } from "@/store/authStore";
import { createCustomerAddress, getCustomerAddresses, getCustomerCoupons } from "@/lib/api";
import type { CustomerAddress, CustomerCoupon } from "@/types";

const steps = ["确认商品", "收货地址", "支付"];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, toggleCart, clearCart } = useCartStore();

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
    clearPolling,
  } = useCheckoutStore();

  const isAuthenticated = useAuthStore((state) => state.authenticated);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [savingAddress, setSavingAddress] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reactive selectors — only re-render when their specific slice changes
  const totalPrice = useTotalPrice();
  const totalCount = useTotalCount();
  const cities = useCities();
  const provinces = useAllProvinces();

  // Load coupons
  useEffect(() => {
    if (isAuthenticated) {
      getCustomerCoupons()
        .then((data) => setCoupons(data || []))
        .catch(() => {});
      getCustomerAddresses()
        .then((data) => setSavedAddresses(data || []))
        .catch(() => {});
    } else {
      queueMicrotask(() => {
        setCoupons([]);
        setSavedAddresses([]);
      });
    }
  }, [isAuthenticated]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  // Redirect to home if cart is empty and not in payment step
  useEffect(() => {
    if (items.length === 0 && checkoutStep === "cart") {
      router.push("/");
    }
  }, [items.length, checkoutStep, router]);

  const stepIndex = checkoutStep === "cart" ? 0 : checkoutStep === "form" ? 1 : 2;

  const handleSubmitOrder = async () => {
    setFormError(null);
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(customerPhone)) {
      setFormError("请输入正确的手机号");
      return;
    }
    if (!customerName.trim()) {
      setFormError("请填写收货人姓名");
      return;
    }
    if (!province || !city) {
      setFormError("请选择省份和城市");
      return;
    }
    if (!addressDetail.trim()) {
      setFormError("请填写详细地址");
      return;
    }
    try {
      await submitOrder(items);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "下单失败");
    }
  };

  const selectSavedAddress = (addressId: number) => {
    const address = savedAddresses.find((item) => item.id === addressId);
    if (!address) return;
    setProvince(address.province);
    setField("customerName", address.recipientName);
    setField("customerPhone", address.recipientPhone);
    setField("city", address.city);
    setField("district", address.district);
    setField("addressDetail", address.addressDetail);
  };

  const saveAddress = async () => {
    if (!isAuthenticated) return;
    setSavingAddress(true);
    setFormError(null);
    try {
      const address = await createCustomerAddress({
        recipientName: customerName,
        recipientPhone: customerPhone,
        province,
        city,
        district,
        addressDetail,
        isDefault: savedAddresses.length === 0,
      });
      setSavedAddresses((current) => [address, ...current.filter((item) => item.id !== address.id)]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "地址保存失败");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleComplete = () => {
    resetCheckout();
    if (paymentStatus === "paid" || paymentMethod === "cod") {
      clearCart();
    }
    router.push("/account");
  };

  const finalPrice = useFinalPrice(totalPrice);
  const discountAmount = totalPrice - finalPrice;

  const addressValues = {
    customerName,
    customerPhone,
    province,
    city,
    district,
    addressDetail,
    paymentMethod,
  };

  return (
    <>
      <Head>
        <title>结账 - 轴承商城</title>
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={totalCount} onCartClick={toggleCart} />

        <main className="max-w-3xl mx-auto px-6 py-8">
          {/* Step progress bar */}
          <div className="flex items-center mb-10">
            {steps.map((label, i) => {
              const isActive = i === stepIndex;
              const isDone = i < stepIndex;
              return (
                <div key={label} className="flex-1 flex items-center">
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
                        isActive ? "text-amber-400 font-medium" : isDone ? "text-neutral-400" : "text-neutral-600"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
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

          {/* Step 1: Cart review */}
          {checkoutStep === "cart" && (
            <CartReviewStep
              items={items}
              authenticated={isAuthenticated}
              coupons={coupons}
              selectedCoupon={selectedCoupon}
              totalPrice={totalPrice}
              discountAmount={discountAmount}
              finalPrice={finalPrice}
              onRemoveItem={removeItem}
              onUpdateQuantity={updateQuantity}
              onSelectCoupon={setSelectedCoupon}
              onBackToCart={() => router.push("/")}
              onProceed={() => setCheckoutStep("form")}
            />
          )}

          {/* Step 2: Address form */}
          {checkoutStep === "form" && (
            <AddressFormStep
              values={addressValues}
              provinces={provinces}
              cities={cities}
              finalPrice={finalPrice}
              discountAmount={discountAmount}
              submitting={submitting}
               formError={formError}
               savedAddresses={savedAddresses}
               onSelectSavedAddress={selectSavedAddress}
               onSaveAddress={isAuthenticated ? () => void saveAddress() : undefined}
               savingAddress={savingAddress}
              onChangeField={setField}
              onSelectProvince={setProvince}
              onSelectPaymentMethod={setPaymentMethod}
              onSubmit={handleSubmitOrder}
              onBack={() => { setFormError(null); setCheckoutStep("cart"); }}
            />
          )}

          {/* Step 3: Payment */}
          {checkoutStep === "payment" && (
            <PaymentStep
              paymentStatus={paymentStatus}
              paymentInfo={paymentInfo}
              paymentMethod={paymentMethod}
              onComplete={handleComplete}
            />
          )}
        </main>
      </div>
    </>
  );
}
