/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['*']
    }
  }
};

export default nextConfig;
