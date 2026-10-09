import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build (bundles only the deps actually used) — what the
  // Dockerfile's runtime stage copies out. See docs/deployment.md.
  output: "standalone",
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Browsers only ever use this site over HTTPS (ignored on plain-http localhost).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Can't be framed by another site (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Back office and portal, not marketing pages: never belongs in a search engine.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
