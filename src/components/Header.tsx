"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStorefrontLanguage } from "@/lib/storefrontLanguage";

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
}

function CartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25h8.386c.51 0 .955-.343 1.087-.835l1.917-7.188A1.125 1.125 0 0 0 17.803 4.75H5.25m2.25 9.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm9 0a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z"
      />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0A17.93 17.93 0 0 1 12 21.75a17.93 17.93 0 0 1-7.5-1.632Z"
      />
    </svg>
  );
}

export default function Header({ cartCount, onCartClick }: HeaderProps) {
  const { language, setLanguage, text } = useStorefrontLanguage();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleLang = () => {
    setLanguage(language === "zh" ? "en" : "zh");
  };

  const catalogLabel = text.header.products;

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-neutral-800 bg-neutral-950/80 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          : "border-white/5 bg-neutral-950/64 backdrop-blur-lg"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-white active:scale-95 sm:hidden"
            aria-label={text.header.menu}
            aria-expanded={menuOpen}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.6}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={
                  menuOpen
                    ? "M6 18 18 6M6 6l12 12"
                    : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                }
              />
            </svg>
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 text-base font-extrabold tracking-tight text-white transition hover:text-amber-300"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-amber-500 text-sm font-extrabold text-neutral-950 shadow-[0_10px_30px_rgba(245,158,11,0.25)]">
              轴
            </span>
            {text.header.title}
          </Link>
        </div>

        {menuOpen && (
          <div className="absolute left-0 right-0 top-16 border-b border-neutral-800 bg-neutral-950/96 p-4 shadow-2xl backdrop-blur-xl sm:hidden">
            <div className="flex flex-col gap-1">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-amber-300"
              >
                {catalogLabel}
              </Link>
              <Link
                href="/account"
                prefetch={false}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-amber-300"
              >
                {text.header.account}
              </Link>
              <Link
                href="/support"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-amber-300"
              >
                联系客服
              </Link>
              <button
                type="button"
                onClick={toggleLang}
                className="rounded-md px-3 py-2 text-left text-sm text-neutral-400 transition hover:bg-white/5 hover:text-amber-300"
              >
                {mounted ? (language === "zh" ? "English" : "中文") : "English"}
              </button>
            </div>
          </div>
        )}

        <nav className="hidden items-center gap-1 sm:flex">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/5 hover:text-amber-300"
          >
            {catalogLabel}
          </Link>
          <Link
            href="/support"
            className="rounded-md px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/5 hover:text-amber-300"
          >
            联系客服
          </Link>
          <button
            type="button"
            onClick={toggleLang}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-neutral-400 transition hover:border-amber-400/40 hover:text-amber-300 active:scale-95"
          >
            {mounted ? (language === "zh" ? "EN" : "中文") : "EN"}
          </button>
          <Link
            href="/account"
            prefetch={false}
            aria-label={text.header.account}
            className="grid h-10 w-10 place-items-center rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-amber-300 active:scale-95"
          >
            <AccountIcon />
          </Link>
          <button
            type="button"
            onClick={onCartClick}
            aria-label={text.header.cart}
            className="relative grid h-10 w-10 place-items-center rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-amber-300 active:scale-95"
          >
            <CartIcon />
            {mounted && cartCount > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-neutral-950">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </nav>

        <div className="flex items-center gap-1 sm:hidden">
          <Link
            href="/account"
            prefetch={false}
            className="grid h-10 w-10 place-items-center rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-amber-300 active:scale-95"
            aria-label={text.header.account}
          >
            <AccountIcon />
          </Link>
          <button
            type="button"
            onClick={onCartClick}
            aria-label={text.header.cart}
            className="relative grid h-10 w-10 place-items-center rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-amber-300 active:scale-95"
          >
            <CartIcon />
            {mounted && cartCount > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-neutral-950">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
