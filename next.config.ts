import type { NextConfig } from "next";

// Exact hostnames allowed to post forms through a reverse proxy (e.g. your `tailscale serve` address).
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Database drivers load native/WASM assets at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // 2 MB: room for a downscaled meal photo sent to the assistant.
  experimental: { serverActions: { allowedOrigins, bodySizeLimit: "2mb" } },
  // Allow phones/laptops on the LAN or tailnet to load dev assets.
  allowedDevOrigins: ["*.local", "*.ts.net", "192.168.*.*", "10.*.*.*"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
