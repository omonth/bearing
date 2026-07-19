import type { GetServerSideProps } from 'next';
import { renderSitemap, resolvePublicOrigin } from '@/lib/siteMetadata';

interface BearingEnvelope {
  data?: Array<{ id?: unknown }>;
}

async function loadProductIds(): Promise<number[]> {
  const apiOrigin = process.env.INTERNAL_API_URL || 'http://backend:3001/api';
  const response = await fetch(`${apiOrigin.replace(/\/+$/, '')}/bearings`, {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Product API returned HTTP ${response.status}`);
  const envelope = await response.json() as BearingEnvelope;
  if (!Array.isArray(envelope.data)) throw new Error('Product API returned an invalid envelope');
  return envelope.data
    .map((item) => item.id)
    .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0);
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const origin = resolvePublicOrigin(process.env.PUBLIC_SITE_URL, process.env.NODE_ENV === 'production');
    const productIds = await loadProductIds();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
    res.write(renderSitemap(origin, productIds));
    res.end();
  } catch (error) {
    res.statusCode = 503;
    res.end(error instanceof Error ? error.message : 'Sitemap is unavailable');
  }
  return { props: {} };
};

export default function SitemapRoute() {
  return null;
}
