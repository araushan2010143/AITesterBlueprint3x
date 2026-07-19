import type { NextConfig } from "next";

// All API calls go through /proxy/* → Render backend.
// This eliminates browser CORS entirely — calls are same-origin to Vercel,
// which rewrites server-side to Render. No env vars needed.
const RENDER_URL = "https://qa-intelligence-api.onrender.com";

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
