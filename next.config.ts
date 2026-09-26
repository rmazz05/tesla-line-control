import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Runtime session data is not a build dependency or distributable asset.
  outputFileTracingExcludes: {
    "/*": ["./.manager-workspaces/**/*", "./.audience-demo/**/*"],
  },
  devIndicators: false,
  allowedDevOrigins: ["*.trycloudflare.com", "*.trycloudflare.app"],
};

export default nextConfig;
