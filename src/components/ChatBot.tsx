"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useCartStore } from "@/store/cartStore";
import type { Bearing } from "@/types";

interface ProductCard {
  id: number;
  name: string;
  model: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  specs: {
    inner_diameter: number | string;
    outer_diameter: number | string;
    width: number | string;
  };
  score: number;
}

interface Message {
  role: "user" | "bot";
  content: string;
  products?: ProductCard[];
  suggestions?: string[];
  timestamp?: string;
}

const STORAGE_KEY = "bearing-chat-history";
const MAX_HISTORY = 50;

function loadHistory(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
  } catch {}
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadHistory();
    if (saved.length > 0) return saved;
    return [
      {
        role: "bot",
        content: "您好！我是智能客服，可以帮您查询产品、订单和库存。试试输入轴承型号或需求描述。",
        suggestions: ["深沟球轴承", "M30 轴承", "耐高温轴承", "帮助"],
        timestamp: new Date().toISOString(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; model: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // ── Search suggestions (debounced) ──────────────────────────────────────

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch {}
    }, 300);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    fetchSuggestions(val);
  };

  const selectSuggestion = (model: string) => {
    setInput(model);
    setShowSuggestions(false);
    send(model);
  };

  // ── Add product to cart ─────────────────────────────────────────────────

  const handleAddToCart = (product: ProductCard) => {
    const bearing: Bearing = {
      id: product.id,
      name: { zh: product.name, en: "" },
      model: product.model,
      price: product.price,
      image: product.image,
      category: product.category,
      specs: {
        innerDiameter: product.specs.inner_diameter,
        outerDiameter: product.specs.outer_diameter,
        width: product.specs.width,
      },
      stock: product.stock,
      description: { zh: "", en: "" },
    };
    addItem(bearing, 1);
  };

  // ── Send message ────────────────────────────────────────────────────────

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", content: msg, timestamp: new Date().toISOString() }]);
    setInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let botMsg = "";
        let products: ProductCard[] | undefined;
        setMessages((prev) => [...prev, { role: "bot", content: "", timestamp: new Date().toISOString() }]);

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
                // Product cards arrive as a special event
                if (parsed.type === "products") {
                  products = parsed.products;
                  continue;
                }
                if (parsed.content) {
                  botMsg += parsed.content;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = {
                      role: "bot",
                      content: botMsg,
                      products,
                      timestamp: new Date().toISOString(),
                    };
                    return copy;
                  });
                }
              } catch {}
            }
          }
        }

        // Final update with products if not already set
        if (products) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last.role === "bot" && !last.products) {
              copy[copy.length - 1] = { ...last, products };
            }
            return copy;
          });
        }
      } else {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content: data.message,
            suggestions: data.suggestions,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "抱歉，服务暂时不可用，请稍后再试。", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── Clear history ───────────────────────────────────────────────────────

  const clearHistory = () => {
    const welcome: Message = {
      role: "bot",
      content: "聊天记录已清空。有什么可以帮您的？",
      suggestions: ["深沟球轴承", "M30 轴承", "帮助"],
      timestamp: new Date().toISOString(),
    };
    setMessages([welcome]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Product card component ──────────────────────────────────────────────

  const ProductCardView = ({ product }: { product: ProductCard }) => (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 mt-2 flex gap-3">
      {product.image && (
        <img
          src={product.image}
          alt={product.name}
          className="w-16 h-16 object-cover rounded-md flex-shrink-0"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-200 truncate">{product.name}</p>
        <p className="text-xs text-neutral-400">{product.model} · {product.category}</p>
        {(product.specs.inner_diameter || product.specs.outer_diameter || product.specs.width) && (
          <p className="text-xs text-neutral-500 mt-0.5">
            {product.specs.inner_diameter && `Φ${product.specs.inner_diameter}`}
            {product.specs.outer_diameter && ` × Φ${product.specs.outer_diameter}`}
            {product.specs.width && ` × ${product.specs.width}`}
          </p>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm font-semibold text-amber-400">¥{product.price}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${product.stock > 0 ? "text-green-400" : "text-red-400"}`}>
              {product.stock > 0 ? `库存${product.stock}` : "缺货"}
            </span>
            {product.stock > 0 && (
              <button
                onClick={() => handleAddToCart(product)}
                className="text-xs px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded transition-colors"
              >
                加入购物车
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Toggle button ─────────────────────────────────────────────── */}
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

      {/* ── Chat panel ────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] h-[580px] max-h-[70vh] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-200">智能客服</span>
            <div className="flex items-center gap-2">
              <button onClick={clearHistory} className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors" title="清空聊天记录">
                清空
              </button>
              <span className="text-[10px] text-neutral-500">AI 助手</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] ${m.role === "user" ? "" : "w-full"}`}>
                  {/* Text bubble */}
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      m.role === "user"
                        ? "bg-amber-500 text-neutral-950 rounded-br-sm"
                        : "bg-neutral-800 text-neutral-200 rounded-bl-sm"
                    }`}
                  >
                    {m.role === "bot" ? (
                      m.content ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : loading && i === messages.length - 1 ? (
                        <span className="text-neutral-500">思考中…</span>
                      ) : null
                    ) : (
                      m.content
                    )}
                  </div>

                  {/* Product cards */}
                  {m.products && m.products.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {m.products.map((p) => (
                        <ProductCardView key={p.id} product={p} />
                      ))}
                    </div>
                  )}

                  {/* Suggestion chips */}
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

          {/* Input area */}
          <div className="px-4 py-3 border-t border-neutral-800 relative">
            {/* Search suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mx-4 mb-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(s.model)}
                    className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors flex items-center gap-2"
                  >
                    <span className="text-neutral-500 text-xs">{s.model}</span>
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    setShowSuggestions(false);
                    send(input);
                  }
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="输入轴承型号或需求描述…"
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => { setShowSuggestions(false); send(input); }}
                disabled={loading || !input.trim()}
                className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md transition-colors"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
