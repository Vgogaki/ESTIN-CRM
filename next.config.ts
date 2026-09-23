import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build (bundles only the deps actually used) — what the
  // Dockerfile's runtime stage copies out. See docs/deployment.md.
  output: "standalone",
};

export default nextConfig;
