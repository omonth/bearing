"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
}

export default function Header({ cartCount, onCartClick }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-2 text-neutral-400 hover:text-white transition-colors"
            aria-label="菜单"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"} />
            </svg>
          </button>

          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors"
          >
            {t("header.title")}
          </Link>
        </div>

        {/* Mobile nav overlay */}
        {menuOpen && (
          <div className="sm:hidden absolute top-16 left-0 right-0 bg-neutral-900 border-b border-neutral-800 shadow-xl p-4 flex flex-col gap-3">
            <Link href="/account" onClick={() => setMenuOpen(false)} className="text-sm text-neutral-300 hover:text-amber-400 py-2">
              {t("header.account")}
            </Link>
            <Link href="/" onClick={() => setMenuOpen(false)} className="text-sm text-neutral-300 hover:text-amber-400 py-2">
              浏览产品
            </Link>
            <button onClick={toggleLang} className="text-left text-sm text-neutral-400 hover:text-amber-400 py-2">
              {mounted ? (i18n.language === 'zh' ? 'English' : '中文') : 'English'}
            </button>
          </div>
        )}

        <nav className="hidden sm:flex items-center gap-2">
          <button onClick={toggleLang} className="text-xs font-medium text-neutral-500 hover:text-amber-400 transition-colors px-2 py-1 rounded border border-neutral-700">
            {mounted ? (i18n.language === 'zh' ? 'EN' : '中文') : 'EN'}
          </button>

          <Link href="/account" aria-label={t("header.account")} className="p-2 text-neutral-400 hover:text-amber-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </nav>

        {/* Cart + account on mobile */}
        <div className="flex sm:hidden items-center gap-1">
          <Link href="/account" className="p-2 text-neutral-400 hover:text-amber-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
          <button onClick={onCartClick} aria-label={t("header.cart")} className="relative p-2 text-neutral-400 hover:text-amber-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 003 3h4.5a3 3 0 003-3H18m-13.5 0h11.386c.51 0 .955-.343 1.087-.835l1.917-7.188A1.125 1.125 0 0019.803 5.25H6.375m-1.125 9a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zm12.75 0a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
            </svg>
            {mounted && cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-neutral-950 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-[4px] flex items-center justify-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
