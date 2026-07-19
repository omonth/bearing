import "@/index.css";
import { StorefrontLanguageProvider } from "@/lib/storefrontLanguage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Head from "next/head";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23f59e0b'/%3E%3Ccircle cx='16' cy='16' r='9' fill='%23171717'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%23f59e0b'/%3E%3C/svg%3E";

function CustomerSessionBootstrap() {
  const initialize = useAuthStore((state) => state.initialize);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <StorefrontLanguageProvider>
        <CustomerSessionBootstrap />
        <Head>
          <link rel="icon" href={FAVICON} />
        </Head>
        <a href="#main-content" className="skip-link">
          跳到主要内容
        </a>
        <Component {...pageProps} />
      </StorefrontLanguageProvider>
    </ErrorBoundary>
  );
}
