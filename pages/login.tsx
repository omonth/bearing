import { useEffect, useState } from "react";
import Head from "next/head";
import Header from "@/components/Header";
import PasswordRecoveryPanel from "@/components/auth/PasswordRecoveryPanel";
import { useCartStore, useTotalCount } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const { toggleCart } = useCartStore();
  const totalCount = useTotalCount();
  const { login, register, _rehydrated } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register" | "request">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [resetTokenFromFragment, setResetTokenFromFragment] = useState<string>();
  const visibleMode = resetTokenFromFragment ? "reset" : mode;

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const resetToken = fragment.get('resetToken');

    // Recovery credentials must never remain in browser history, referrers, or
    // server-visible query strings. Legacy query parameters are discarded.
    url.hash = '';
    url.searchParams.delete('resetToken');
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    const frame = resetToken
      ? window.requestAnimationFrame(() => setResetTokenFromFragment(resetToken))
      : undefined;
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  const returnToLogin = () => {
    setMode("login");
    setError("");
    setResetTokenFromFragment(undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!_rehydrated) return;
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败");
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
          {`${visibleMode === "login" ? "登录" : visibleMode === "register" ? "注册" : "找回密码"} - 轴承商城`}
        </title>
      </Head>
      <div className="min-h-screen bg-neutral-950">
        <Header cartCount={totalCount} onCartClick={toggleCart} />
        <main className="max-w-[420px] mx-auto px-6 py-16">
          {(visibleMode === "login" || visibleMode === "register") && (
            <div className="flex mb-8">
              {(["login", "register"] as const).map((m) => {
                const isActive = visibleMode === m;
                return (
                  <button
                    key={m}
                    data-testid={`customer-auth-mode-${m}`}
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
          )}

          {visibleMode === "request" || visibleMode === "reset" ? (
            <PasswordRecoveryPanel
              mode={visibleMode}
              resetToken={visibleMode === "reset" ? resetTokenFromFragment : undefined}
              onBack={returnToLogin}
              onResetComplete={() => {
                setResetTokenFromFragment(undefined);
              }}
            />
          ) : <form
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
                  data-testid="customer-register-name"
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
                data-testid="customer-auth-phone"
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
                data-testid="customer-auth-password"
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
              data-testid="customer-auth-submit"
              disabled={submitting || !_rehydrated}
              className="w-full py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
            >
              {submitting
                ? "请稍候..."
                : mode === "login"
                  ? "登录"
                  : "注册"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("request");
                  setError("");
                }}
                className="w-full text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                忘记密码？
              </button>
            )}
          </form>}
        </main>
      </div>
    </>
  );
}
