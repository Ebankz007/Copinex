import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship compiled ESM — transpile for safety.
  transpilePackages: ["@copinex/engine"],
  async rewrites() {
    // Proxy API calls to the backend on :4000 — same-origin, no CORS.
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;