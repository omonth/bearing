import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Header from "@/components/Header";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { getCustomerOrders, getCustomerCoupons } from "@/lib/api";

type Tab = "orders" | "coupons";

const statusLabels: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  paid: "bg-blue-500/20 text-blue-400",
  shipped: "bg-purple-500/20 text-purple-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

const levelLabels: Record<string, string> = {
  bronze: "铜牌会员",
  silver: "银牌会员",
  gold: "金牌会员",
  platinum: "铂金会员",
  diamond: "钻石会员",
};

const levelColors: Record<string, string> = {
  bronze: "bg-amber-900/20 text-amber-600",
  silver: "bg-neutral-700/20 text-neutral-400",
  gold: "bg-amber-500/20 text-amber-400",
  platinum: "bg-blue-500/20 text-blue-400",
  diamond: "bg-purple-500/20 text-purple-400",
};

const couponStatusLabel: Record<string, string> = {
  unused: "可用",
  used: "已使用",
  expired: "已过期",
};

const couponStatusColor: Record<string, string> = {
  unused: "text-emerald-400",
  used: "text-neutral-500",
  expired: "text-red-400",
};

export default function AccountPage() {
  const router = useRouter();
  const { user, token, loading, fetchMe, logout, _rehydrated } = useAuthStore();
  const { getTotalCount, toggleCart } = useCartStore();
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = () => {
    if (!token) return;
    setFetching(true);
    setFetchError(false);
    if (tab === "orders") {
      getCustomerOrders()
        .then((data) => setOrders(data))
        .catch(() => setFetchError(true))
        .finally(() => setFetching(false));
    } else {
      getCustomerCoupons()
        .then((data) => setCoupons(data))
        .catch(() => setFetchError(true))
        .finally(() => setFetching(false));
    }
  };

  useEffect(() => {
    if (!_rehydrated) return;
    if (!token) {
      router.push("/login");
      return;
    }
    fetchMe();
  }, [token, _rehydrated]);

  useEffect(() => {
    fetchData();
  }, [tab, token]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (!_rehydrated || !token) return null;

  return (
    <>
      <Head>
        <title>个人中心 - 轴承商城</title>
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={getTotalCount()} onCartClick={toggleCart} />
        <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* User info card */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">
                {user?.name || user?.phone}
              </h2>
              <p className="text-sm text-neutral-400 mb-2">
                手机号: {user?.phone}
              </p>
              <p className="text-sm">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    levelColors[user?.level || "bronze"] || levelColors.bronze
                  }`}
                >
                  {levelLabels[user?.level || "bronze"] || user?.level}
                </span>
                <span className="text-neutral-400 ml-3">
                  积分:{" "}
                  <strong className="text-neutral-200">
                    {user?.points || 0}
                  </strong>
                </span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-red-400 border border-red-400 rounded-md hover:bg-red-400/10 transition-colors"
            >
              退出登录
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-neutral-800">
            {[
              { key: "orders", label: "我的订单" },
              { key: "coupons", label: "我的优惠券" },
            ].map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as Tab)}
                  className={`relative flex-1 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-amber-400"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {t.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {fetching ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-8 h-8 border-2 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-neutral-400 text-sm">加载中...</p>
            </div>
          ) : fetchError ? (
            <div className="text-center py-16 bg-neutral-900 border border-neutral-800 rounded-lg">
              <p className="text-sm text-red-400 mb-4">加载失败，请重试</p>
              <button
                onClick={fetchData}
                className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
              >
                重试
              </button>
            </div>
          ) : tab === "orders" ? (
            orders.length === 0 ? (
              <div className="text-center py-16 bg-neutral-900 border border-neutral-800 rounded-lg">
                <p className="text-neutral-500 text-sm mb-4">暂无订单</p>
                <button
                  onClick={() => router.push("/")}
                  className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  去逛逛
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg p-5"
                  >
                    <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                      <div>
                        <span className="text-xs text-neutral-500">订单号 </span>
                        <strong className="text-sm text-white">
                          #{order.id}
                        </strong>
                      </div>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[order.status] || statusColors.cancelled
                        }`}
                      >
                        {statusLabels[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-400 mb-3">
                      {order.province} {order.city} {order.address_detail}
                    </p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-neutral-600">
                        {order.created_at}
                      </span>
                      <span className="text-lg font-bold text-amber-400">
                        ¥{order.total_price?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : coupons.length === 0 ? (
            <div className="text-center py-16 bg-neutral-900 border border-neutral-800 rounded-lg">
              <p className="text-neutral-500 text-sm">暂无优惠券</p>
            </div>
          ) : (
            <div className="space-y-3">
              {coupons.map((c: any) => (
                <div
                  key={c.id}
                  className="flex justify-between items-center flex-wrap gap-3 bg-neutral-900 border border-neutral-800 rounded-lg p-5"
                >
                  <div>
                    <strong className="text-sm text-white">
                      {c.coupon_name || c.code}
                    </strong>
                    <p className="text-xs text-neutral-400 mt-1">
                      {c.type === "fixed"
                        ? `¥${c.discount_value} 直减`
                        : `${c.discount_value}% 折扣`}
                      {c.min_order_amount > 0
                        ? ` · 满¥${c.min_order_amount}可用`
                        : ""}
                    </p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      有效期: {c.valid_from || "即日"} ~{" "}
                      {c.valid_until || "长期"}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      couponStatusColor[c.status] || couponStatusColor.unused
                    }`}
                  >
                    {couponStatusLabel[c.status] || c.status || "可用"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
