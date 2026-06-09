import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      localStorage.setItem("ai_token", data.token);
      localStorage.setItem("ai_user", JSON.stringify(data.user));
      router.replace("/admin");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>AI 管理后台 - 登录</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
            <div className="text-center mb-6">
              <h1 className="text-lg font-semibold text-neutral-200">AI 管理后台</h1>
              <p className="text-xs text-neutral-500 mt-1">轴承销售系统</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full py-2.5 text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
              >
                {loading ? "登录中…" : "登录"}
              </button>
            </form>

            <p className="text-[10px] text-neutral-600 text-center mt-4">
              默认账户: ai_admin / admin123
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
