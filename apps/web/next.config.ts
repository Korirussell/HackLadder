import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Turbopack's persistent cache kept serving the old globals.css (through the Tailwind loader
    // below) after the redesign, in `next dev` and on Vercel, which restores .next/cache.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
    // Prerendering runs many workers against one small database; retry a page that times out.
    staticGenerationRetryCount: 2,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
