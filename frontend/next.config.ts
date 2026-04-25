import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // In production (Vercel) BACKEND_URL points to Railway.
    // Locally it falls back to localhost:8000.
    // All /api/* requests are proxied — no CORS needed.
    const backendUrl =
      process.env.BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
