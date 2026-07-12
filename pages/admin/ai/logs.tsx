import { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

interface LogEntry {
  id: number;
  admin_username: string;
  action: string;
  target_table: string;
  target_id: number;
  before_value: string;
  after_value: string;
  reason: string;
  status: string;
  created_at: string;
  executed_at: string;
}

const actionLabels: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  query: "查询",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "待执行", color: "text-amber-400 bg-amber-400/10" },
  executed: { label: "已执行", color: "text-green-400 bg-green-400/10" },
  cancelled: { label: "已取消", color: "text-neutral-400 bg-neutral-400/10" },
  rolled_back: { label: "已回滚", color: "text-red-400 bg-red-400/10" },
};

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("ai_token");
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterAction) params.set("action", filterAction);
      if (filterStatus) params.set("status", filterStatus);

      const res = await fetch(`/api/ai/auth/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (logId: number) => {
    if (!confirm("确定要回滚此操作吗？")) return;
    try {
      const token = localStorage.getItem("ai_token");
      const res = await fetch(`/api/ai/auth/logs/${logId}/rollback`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        fetchLogs();
      } else {
        alert(data.error || "回滚失败");
      }
    } catch {
      alert("回滚请求失败");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("ai_token");
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (filterAction) params.set("action", filterAction);
        if (filterStatus) params.set("status", filterStatus);

        const res = await fetch(`/api/ai/auth/logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) {
          setLogs(data.data || []);
          setTotal(data.total || 0);
        }
      } catch {
        if (!cancelled) { /* silent fail */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [page, filterAction, filterStatus]);

  const parseJson = (val: string | null) => {
    if (!val) return null;
    try { return JSON.parse(val); } catch { return val; }
  };

  return (
    <>
      <Head>
        <title>操作日志 - AI 管理后台</title>
      </Head>
      <AdminLayout title="操作日志">
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-neutral-300 focus:outline-none focus:border-amber-500"
            >
              <option value="">全部操作</option>
              <option value="create">创建</option>
              <option value="update">更新</option>
              <option value="delete">删除</option>
              <option value="query">查询</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-neutral-300 focus:outline-none focus:border-amber-500"
            >
              <option value="">全部状态</option>
              <option value="pending">待执行</option>
              <option value="executed">已执行</option>
              <option value="cancelled">已取消</option>
              <option value="rolled_back">已回滚</option>
            </select>
            <span className="text-xs text-neutral-500 self-center">共 {total} 条</span>
          </div>

          {/* Log list */}
          {loading ? (
            <div className="text-neutral-500 text-sm">加载中…</div>
          ) : logs.length === 0 ? (
            <div className="text-neutral-600 text-sm text-center py-12">暂无操作日志</div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const st = statusLabels[log.status] || { label: log.status, color: "text-neutral-400" };
                const isOpen = expanded === log.id;
                return (
                  <div key={log.id} className="bg-neutral-900 border border-neutral-800 rounded-lg">
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500">#{log.id}</span>
                        <span className="text-sm text-neutral-300">
                          {actionLabels[log.action] || log.action}
                        </span>
                        {log.target_table && (
                          <span className="text-xs text-neutral-500">{log.target_table}#{log.target_id}</span>
                        )}
                        {log.reason && (
                          <span className="text-xs text-neutral-400 truncate max-w-xs">{log.reason}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-neutral-600">{log.created_at?.slice(0, 16)}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-3 border-t border-neutral-800 pt-2 space-y-2">
                        <div className="flex gap-4 text-xs text-neutral-500 items-center">
                          <span>操作者: {log.admin_username}</span>
                          {log.executed_at && <span>执行时间: {log.executed_at}</span>}
                          {log.status === "executed" && log.action === "update" && (
                            <button
                              onClick={() => handleRollback(log.id)}
                              className="ml-auto text-xs px-2 py-0.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                            >
                              回滚
                            </button>
                          )}
                        </div>
                        {log.before_value && (
                          <div>
                            <p className="text-xs text-neutral-500 mb-1">修改前:</p>
                            <pre className="text-xs text-neutral-400 bg-neutral-800 rounded p-2 overflow-x-auto">
                              {JSON.stringify(parseJson(log.before_value), null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.after_value && (
                          <div>
                            <p className="text-xs text-neutral-500 mb-1">修改后:</p>
                            <pre className="text-xs text-neutral-400 bg-neutral-800 rounded p-2 overflow-x-auto">
                              {JSON.stringify(parseJson(log.after_value), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 rounded"
              >
                上一页
              </button>
              <span className="text-xs text-neutral-500 self-center">{page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={logs.length < 20}
                className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 rounded"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
