/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'via.placeholder.com'],
    unoptimized: true
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/:path*`
      },
      {
        source: '/images/:path*',
        destination: 'http://localhost:3001/images/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
