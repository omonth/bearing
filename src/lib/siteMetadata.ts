const STATIC_SITEMAP_PATHS = [
  '/',
  '/privacy',
  '/terms',
  '/policies',
  '/support',
] as const;

export function resolvePublicOrigin(value: string | undefined, production: boolean): string {
  if (!value?.trim()) {
    if (production) {
      throw new Error('PUBLIC_SITE_URL is required in production');
    }
    return 'http://localhost:3000';
  }

  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PUBLIC_SITE_URL must be an HTTP(S) origin without credentials');
  }
  if (production && url.protocol !== 'https:') {
    throw new Error('PUBLIC_SITE_URL must use HTTPS in production');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_SITE_URL must not contain a path, query, or fragment');
  }

  return url.origin;
}

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /account',
    'Disallow: /checkout',
    'Disallow: /admin',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderSitemap(origin: string, productIds: number[] = []): string {
  const productPaths = [...new Set(productIds)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .map((id) => `/product/${id}`);
  const paths = [...STATIC_SITEMAP_PATHS, ...productPaths];
  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

export { STATIC_SITEMAP_PATHS };
