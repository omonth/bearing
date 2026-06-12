"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const LazyChatBot = dynamic(() => import("@/components/ChatBot"), {
  ssr: false,
  loading: () => (
    <button
      type="button"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-neutral-950 shadow-[0_16px_44px_rgba(245,158,11,0.24)]"
      aria-label="正在加载智能客服"
    >
      <span className="h-5 w-5 animate-pulse rounded-full bg-neutral-950/70" />
    </button>
  ),
});

export default function ChatBotEntry() {
  const [enabled, setEnabled] = useState(false);

  if (enabled) {
    return <LazyChatBot initialOpen />;
  }

  return (
    <button
      type="button"
      onClick={() => setEnabled(true)}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-neutral-950 shadow-[0_16px_44px_rgba(245,158,11,0.24)] transition hover:bg-amber-300 active:scale-95"
      aria-label="打开智能客服"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-6 w-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
        />
      </svg>
    </button>
  );
}
