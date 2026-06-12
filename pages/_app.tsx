import "@/index.css";
import "@/lib/i18n";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div>
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <Component {...pageProps} />
    </div>
  );
}
