import '@/index.css';
import '@/App.css';
import '@/components/Header.css';
import '@/components/ProductList.css';
import '@/components/ProductDetail.css';
import '@/components/Cart.css';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
