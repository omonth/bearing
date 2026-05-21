/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'via.placeholder.com'],
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api'
  },
  async rewrites() {
    return [
      {
        source: '/images/:path*',
        destination: 'http://localhost:3001/images/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
