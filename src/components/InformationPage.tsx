import Head from 'next/head';
import Link from 'next/link';

export interface InformationSection {
  title: string;
  paragraphs: string[];
}

interface InformationPageProps {
  title: string;
  description: string;
  sections: InformationSection[];
}

export default function InformationPage({ title, description, sections }: InformationPageProps) {
  return (
    <>
      <Head>
        <title>{title} | 轴承商城</title>
        <meta name="description" content={description} />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-white/10 bg-neutral-950/95">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="font-semibold text-white hover:text-amber-300">
              轴承商城
            </Link>
            <Link href="/support" className="text-sm text-neutral-400 hover:text-amber-300">
              联系客服
            </Link>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            生效日期：2026 年 7 月 19 日
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">{title}</h1>
          <p className="mt-4 max-w-3xl leading-7 text-neutral-400">{description}</p>
          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section key={section.title} className="rounded-xl border border-white/10 bg-white/[0.025] p-6">
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-neutral-300">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <nav className="mt-10 flex flex-wrap gap-4 border-t border-white/10 pt-6 text-sm text-neutral-400">
            <Link href="/privacy" className="hover:text-amber-300">隐私政策</Link>
            <Link href="/terms" className="hover:text-amber-300">用户协议</Link>
            <Link href="/policies" className="hover:text-amber-300">支付、退款与售后政策</Link>
            <Link href="/support" className="hover:text-amber-300">客服与异常订单</Link>
          </nav>
        </main>
      </div>
    </>
  );
}
