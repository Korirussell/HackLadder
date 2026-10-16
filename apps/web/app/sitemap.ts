import type { MetadataRoute } from "next";

import { getSitemapEntries } from "@/lib/data";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hackladder.com";
const PREFIX = { hacker: "h", school: "s", event: "e", series: "series" } as const;
const PAGES = ["/", "/hackers", "/schools", "/events", "/duos", "/how-ratings-work", "/upcoming", "/remove"];

// Every non-hidden rated person, school, rated event and series (§12). Hidden people never appear.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return [
    ...PAGES.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const })),
    ...entries.map((e) => ({
      url: `${SITE}/${PREFIX[e.kind]}/${e.slug}`,
      ...(e.updated_at ? { lastModified: e.updated_at } : {}),
      changeFrequency: "weekly" as const,
    })),
  ];
}
