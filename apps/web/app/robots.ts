import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hackladder.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/me", "/claim", "/sign-in", "/auth", "/api", "/corrections", "/search"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
