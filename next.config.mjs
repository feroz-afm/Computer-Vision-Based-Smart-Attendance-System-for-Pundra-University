/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    return config;
  },
  experimental: {
    webpackBuildWorker: false,
  },
};

export default nextConfig;
