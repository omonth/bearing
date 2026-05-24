"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "bot";
  content: string;
  suggestions?: string[];
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", content: "您好！我是智能客服，可以帮您查询产品、订单和库存。", suggestions: ["查看产品", "查询订单", "帮助"] },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        // SSE streaming
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let botMsg = "";
        setMessages((prev) => [...prev, { role: "bot", content: "" }]);

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
                const { content } = JSON.parse(data);
                if (content) {
                  botMsg += content;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "bot", content: botMsg };
                    return copy;
                  });
                }
              } catch {}
            }
          }
        }
      } else {
        const data = await res.json();
        setMessages((prev) => [...prev, {
          role: "bot",
          content: data.message,
          suggestions: data.suggestions,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "bot", content: "抱歉，服务暂时不可用，请稍后再试。" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-lg flex items-center justify-center transition-colors"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[60vh] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-200">智能客服</span>
            <span className="text-[10px] text-neutral-500">AI 助手</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                  m.role === "user"
                    ? "bg-amber-500 text-neutral-950 rounded-br-sm"
                    : "bg-neutral-800 text-neutral-200 rounded-bl-sm"
                }`}>
                  {m.content || (loading && i === messages.length - 1 ? "思考中…" : "")}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => send(s)}
                          className="text-[11px] px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded-full text-neutral-300 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="输入您的问题…"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
