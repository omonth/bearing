import "@/index.css";
import { StorefrontLanguageProvider } from "@/lib/storefrontLanguage";
import Head from "next/head";
import type { AppProps } from "next/app";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23f59e0b'/%3E%3Ccircle cx='16' cy='16' r='9' fill='%23171717'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%23f59e0b'/%3E%3C/svg%3E";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <StorefrontLanguageProvider>
      <Head>
        <link rel="icon" href={FAVICON} />
      </Head>
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <Component {...pageProps} />
    </StorefrontLanguageProvider>
  );
}
