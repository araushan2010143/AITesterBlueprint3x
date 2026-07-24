import type { NextConfig } from "next";

// All API calls go through /proxy/* → Render backend (account 2).
// This eliminates browser CORS entirely — calls are same-origin to Vercel,
// which rewrites server-side to Render. Render cold-start 503s are readable
// by the browser (same-origin) instead of silently dropped (cross-origin CORS block).
const RENDER_URL = "https://qa-intelligence-api-1tcq.onrender.com";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/proxy/:path*",
        destination: `${RENDER_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
