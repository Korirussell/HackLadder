import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hackladder.com";
const AI_CRAWLERS = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "CCBot",
  "Google-Extended", "Bytespider", "Amazonbot", "Applebot-Extended", "meta-externalagent",
  "FacebookBot", "PerplexityBot", "Diffbot", "cohere-ai", "Omgilibot", "ImagesiftBot", "Timpibot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/me", "/claim", "/sign-in", "/auth", "/api", "/corrections", "/search"] },
      // AI crawlers: no search traffic in return, and every page they fetch is a regeneration (§15 2026-10-23).
      { userAgent: AI_CRAWLERS, disallow: "/" },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
