/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for app/instrumentation.ts to run (starts the scheduler)
  experimental: { instrumentationHook: true },
  // Silence punycode deprecation warning from exceljs
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, punycode: false };
    return config;
  },
};

module.exports = nextConfig;
