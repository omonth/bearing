/** @type {import('next').NextConfig} */
const defaultApiUrl = 'http://localhost:3001/api';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const apiUrl = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/images/**'
      }
    ],
  },
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400'
          }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`
      },
      {
        source: '/images/:path*',
        destination: 'http://localhost:3001/images/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
