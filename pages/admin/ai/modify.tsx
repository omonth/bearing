import { useState } from "react";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

interface ModifyPreview {
  id: number;
  name: string;
  model: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export default function AdminModify() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ModifyPreview | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setPreview(null);

    try {
      const token = localStorage.getItem("ai_token");
      const res = await fetch("/api/ai/modify-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: input, dryRun: true }),
      });
      const data = await res.json();

      if (data.error) {
        setResult(`错误: ${data.error}`);
      } else if (data.preview) {
        setPreview(data.preview);
      } else {
        setResult(data.message || "无法解析修改意图");
      }
    } catch {
      setResult("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const confirmModify = async () => {
    if (!preview) return;
    setLoading(true);

    try {
      const token = localStorage.getItem("ai_token");
      const res = await fetch("/api/ai/modify-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: input, dryRun: false }),
      });
      const data = await res.json();

      if (data.error) {
        setResult(`错误: ${data.error}`);
      } else {
        setResult(data.message || "修改已执行");
        setPreview(null);
      }
    } catch {
      setResult("执行失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>智能修改产品 - AI 管理后台</title>
      </Head>
      <AdminLayout title="智能修改产品">
        <div className="max-w-2xl space-y-6">
          {/* Input */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">输入修改指令</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={'例如:\n把 M30 轴承的价格调到 85 元\n把缺货的深沟球轴承标记为下架\n6205 轴承库存改为 100'}
              rows={4}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={analyze}
                disabled={loading || !input.trim()}
                className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
              >
                {loading ? "分析中…" : "分析修改"}
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-neutral-900 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-400 mb-3">修改预览</h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-neutral-500 w-16">产品</span>
                  <span className="text-neutral-200">{preview.name} ({preview.model})</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-neutral-500 w-16">字段</span>
                  <span className="text-neutral-200">{preview.field}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-neutral-500 w-16">原值</span>
                  <span className="text-neutral-400">{preview.oldValue}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-neutral-500 w-16">新值</span>
                  <span className="text-green-400">{preview.newValue}</span>
                </div>
                {preview.reason && (
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-16">原因</span>
                    <span className="text-neutral-400">{preview.reason}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={confirmModify}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
                >
                  确认修改
                </button>
                <button
                  onClick={() => { setPreview(null); setResult("已取消"); }}
                  className="px-4 py-2 text-sm font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-md transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`text-sm rounded-lg px-4 py-3 ${
              result.startsWith("错误") ? "bg-red-400/10 text-red-400" : "bg-green-400/10 text-green-400"
            }`}>
              {result}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-neutral-300 mb-2">使用说明</h3>
            <ul className="text-xs text-neutral-500 space-y-1.5">
              <li>• AI 会解析你的修改指令，生成预览</li>
              <li>• 所有修改必须经过「确认」才会执行</li>
              <li>• 每次修改都会记录到操作日志</li>
              <li>• 仅 editor 和 admin 角色可以执行修改</li>
              <li>• 支持修改: 价格、库存、描述、类别等字段</li>
            </ul>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
