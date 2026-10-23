import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Rating data only changes when the pipeline publishes, and it then revalidates by tag
  // (/api/revalidate). Time-based regeneration on top of that just costs ISR writes (§15 2026-10-23).
  cacheLife: {
    published: { stale: 300, revalidate: 60 * 60 * 24 * 7, expire: 60 * 60 * 24 * 30 },
  },
  partialPrefetching: true,
  experimental: {
    // Turbopack's persistent cache kept serving the old globals.css (through the Tailwind loader
    // below) after the redesign, in `next dev` and on Vercel, which restores .next/cache.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
    // Prerendering runs many workers against one small database; retry a page that times out.
    staticGenerationRetryCount: 2,
  },
  // Duos became crews (groups of two or more); keep old links working.
  async redirects() {
    return [{ source: "/duos", destination: "/crews", permanent: true }];
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
