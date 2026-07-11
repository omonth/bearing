import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Header from "@/components/Header";
import { useCartStore, useTotalCount } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const { items: cart, toggleCart } = useCartStore();
  const totalCount = useTotalCount();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!phone || !password) {
      setError("请填写手机号和密码");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(phone, password);
      } else {
        await register({ name: name || undefined, phone, password });
      }
      window.location.href = "/account";
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors";

  return (
    <>
      <Head>
        <title>
          {mode === "login" ? "登录" : "注册"} - 轴承商城
        </title>
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={totalCount} onCartClick={toggleCart} />
        <main className="max-w-[420px] mx-auto px-6 py-16">
          {/* Tab switcher */}
          <div className="flex mb-8">
            {(["login", "register"] as const).map((m) => {
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  className={`relative flex-1 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-amber-400"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {m === "login" ? "登录" : "注册"}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-5"
          >
            {mode === "register" && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5">
                  姓名（选填）
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                手机号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
            >
              {submitting
                ? "请稍候..."
                : mode === "login"
                  ? "登录"
                  : "注册"}
            </button>
          </form>
        </main>
      </div>
    </>
  );
}
