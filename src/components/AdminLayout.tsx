"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

interface AdminUser {
  id: number;
  username: string;
  role: string;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

const navItems = [
  { href: "/admin", label: "数据看板", icon: "📊" },
  { href: "/admin/ai", label: "AI 智能问答", icon: "💬" },
  { href: "/admin/ai/modify", label: "智能修改", icon: "✏️" },
  { href: "/admin/ai/logs", label: "操作日志", icon: "📋" },
];

const roleLabels: Record<string, string> = {
  viewer: "只读",
  editor: "编辑",
  admin: "管理员",
};

function readAdminUser(): AdminUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("ai_user");
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object"
      && parsed !== null
      && "id" in parsed
      && "username" in parsed
      && "role" in parsed
      && typeof parsed.id === "number"
      && typeof parsed.username === "string"
      && typeof parsed.role === "string"
    ) {
      return {
        id: parsed.id,
        username: parsed.username,
        role: parsed.role,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function readAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ai_token");
}

function subscribeToAdminSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("admin-session-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("admin-session-change", onStoreChange);
  };
}

const serverAdminSession = () => null;

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const user = useSyncExternalStore(subscribeToAdminSession, readAdminUser, serverAdminSession);
  const token = useSyncExternalStore(subscribeToAdminSession, readAdminToken, serverAdminSession);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!token || !user) {
      router.replace("/admin/login");
    }
  }, [router, token, user]);

  const handleLogout = () => {
    localStorage.removeItem("ai_token");
    localStorage.removeItem("ai_user");
    window.dispatchEvent(new Event("admin-session-change"));
    router.replace("/admin/login");
  };

  if (!token || !user) {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-56" : "w-16"
        } bg-neutral-900 border-r border-neutral-800 flex flex-col transition-all duration-200`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-neutral-800">
          {sidebarOpen ? (
            <span className="text-sm font-semibold text-amber-400">轴承管理系统</span>
          ) : (
            <span className="text-lg">⚙</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-amber-500/10 text-amber-400 border-r-2 border-amber-500"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-neutral-800">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">{user.username}</p>
                <p className="text-[10px] text-neutral-600">{roleLabels[user.role] || user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
              >
                退出
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="text-xs text-neutral-500 hover:text-red-400" title="退出">
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-neutral-900 border-b border-neutral-800 flex items-center px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-neutral-400 hover:text-neutral-200"
          >
            ☰
          </button>
          <h1 className="text-sm font-medium text-neutral-200">{title}</h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
