import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploads (e.g. .xlsx) go through proxy/middleware buffering, which has its own body size limit (default 10MB).
    proxyClientMaxBodySize: "50mb",
    // Excel imports can be a few MB; default Server Actions body limit is 1MB.
    // Keep this reasonably small to avoid abuse, but large enough for typical .xlsx templates.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
