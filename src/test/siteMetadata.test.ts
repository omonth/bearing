import { describe, expect, it } from 'vitest';
import { renderRobots, renderSitemap, resolvePublicOrigin } from '@/lib/siteMetadata';

describe('site metadata', () => {
  it('uses one canonical HTTPS origin for robots and sitemap', () => {
    const origin = resolvePublicOrigin('https://shop.example.com/', true);

    expect({
      origin,
      robots: renderRobots(origin),
      sitemap: renderSitemap(origin, [2, 1, 2, -1]),
    }).toEqual({
      origin: 'https://shop.example.com',
      robots: expect.stringContaining('Sitemap: https://shop.example.com/sitemap.xml'),
      sitemap: expect.stringContaining('<loc>https://shop.example.com/product/1</loc>'),
    });
  });

  it('fails closed for a missing or unsafe production origin', () => {
    expect(() => resolvePublicOrigin(undefined, true)).toThrow(/required/i);
    expect(() => resolvePublicOrigin('http://shop.example.com', true)).toThrow(/HTTPS/i);
    expect(() => resolvePublicOrigin('https://user:secret@shop.example.com', true)).toThrow(/credentials/i);
    expect(() => resolvePublicOrigin('https://shop.example.com/path', true)).toThrow(/path/i);
  });
});
