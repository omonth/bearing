import "@/index.css";
import { StorefrontLanguageProvider } from "@/lib/storefrontLanguage";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <StorefrontLanguageProvider>
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <Component {...pageProps} />
    </StorefrontLanguageProvider>
  );
}
