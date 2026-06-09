import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import ReactMarkdown from "react-markdown";
import AdminLayout from "@/components/AdminLayout";

interface Message {
  role: "user" | "bot";
  content: string;
  type?: "rag" | "sql" | "error";
  sql?: string;
  data?: Record<string, unknown>[];
  timestamp?: string;
}

export default function AdminAI() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      content: "您好！我是 AI 管理助手。可以问我：\n\n- **产品查询**：M30 轴承库存多少？\n- **数据分析**：上个月销售额是多少？\n- **客户分析**：哪个客户买得最多？",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getToken = () => localStorage.getItem("ai_token");

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { role: "user", content: msg, timestamp: new Date().toISOString() }]);
    setInput("");
    setLoading(true);

    try {
      const token = getToken();

      // Try RAG first (product queries)
      const ragRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
      });

      const contentType = ragRes.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        // RAG streaming response
        const reader = ragRes.body!.getReader();
        const decoder = new TextDecoder();
        let botMsg = "";
        setMessages((prev) => [...prev, { role: "bot", content: "", type: "rag", timestamp: new Date().toISOString() }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  botMsg += parsed.content;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "bot", content: botMsg, type: "rag", timestamp: new Date().toISOString() };
                    return copy;
                  });
                }
              } catch {}
            }
          }
        }
      } else {
        // Non-streaming (fastPath or fallback)
        const data = await ragRes.json();
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: data.message, type: "rag", timestamp: new Date().toISOString() },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "请求失败，请稍后重试。", type: "error", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // NL-to-SQL query
  const sendSQL = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { role: "user", content: `[SQL查询] ${msg}`, timestamp: new Date().toISOString() }]);
    setLoading(true);

    try {
      const token = getToken();
      const res = await fetch("/api/ai/admin-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: data.message,
          type: data.type === "error" ? "error" : "sql",
          sql: data.sql,
          data: data.data,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "SQL 查询失败", type: "error", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      if (e.shiftKey) {
        sendSQL(input);
      } else {
        send(input);
      }
    }
  };

  return (
    <>
      <Head>
        <title>AI 智能问答 - 管理后台</title>
      </Head>
      <AdminLayout title="AI 智能问答">
        <div className="flex flex-col h-[calc(100vh-8rem)]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${m.role === "user" ? "" : "w-full"}`}>
                  <div
                    className={`px-4 py-2.5 rounded-lg text-sm ${
                      m.role === "user"
                        ? "bg-amber-500 text-neutral-950 rounded-br-sm"
                        : "bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-bl-sm"
                    }`}
                  >
                    {m.role === "bot" ? (
                      m.content ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-table:text-xs">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : loading && i === messages.length - 1 ? (
                        <span className="text-neutral-500">思考中…</span>
                      ) : null
                    ) : (
                      m.content
                    )}
                  </div>

                  {/* SQL result table */}
                  {m.type === "sql" && m.data && m.data.length > 0 && (
                    <div className="mt-2 bg-neutral-900 border border-neutral-800 rounded-lg overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800">
                            {Object.keys(m.data[0]).map((key) => (
                              <th key={key} className="text-left px-3 py-2 text-neutral-500 font-medium">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.data.slice(0, 20).map((row, ri) => (
                            <tr key={ri} className="border-b border-neutral-800/50">
                              {Object.values(row).map((val, vi) => (
                                <td key={vi} className="px-3 py-1.5 text-neutral-300">
                                  {val === null ? "—" : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {m.data.length > 20 && (
                        <p className="text-[10px] text-neutral-600 px-3 py-1">仅显示前 20 条</p>
                      )}
                    </div>
                  )}

                  {/* SQL query display */}
                  {m.sql && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-neutral-600 cursor-pointer hover:text-neutral-400">
                        查看 SQL
                      </summary>
                      <pre className="text-[11px] text-neutral-400 bg-neutral-800 rounded p-2 mt-1 overflow-x-auto">
                        {m.sql}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题… (Enter=RAG查询, Shift+Enter=SQL查询)"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-4 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
              >
                RAG
              </button>
              <button
                onClick={() => sendSQL(input)}
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 text-sm font-medium bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-neutral-200 rounded-md transition-colors"
              >
                SQL
              </button>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1.5">
              RAG: 产品语义检索 + AI 回答 | SQL: 自然语言转数据查询（仅 SELECT）
            </p>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
