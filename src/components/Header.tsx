"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
}

export default function Header({ cartCount, onCartClick }: HeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors"
        >
          轴承商城
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/account"
            aria-label="账户"
            className="p-2 text-neutral-400 hover:text-amber-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </Link>

          <button
            onClick={onCartClick}
            aria-label="购物车"
            className="relative p-2 text-neutral-400 hover:text-amber-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 003 3h4.5a3 3 0 003-3H18m-13.5 0h11.386c.51 0 .955-.343 1.087-.835l1.917-7.188A1.125 1.125 0 0019.803 5.25H6.375m-1.125 9a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zm12.75 0a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z"
              />
            </svg>
            {mounted && cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-neutral-950 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-[4px] flex items-center justify-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
