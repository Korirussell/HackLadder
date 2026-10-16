import type { Metadata } from "next";

import { NotFoundBody } from "@/components/site/not-found-body";

export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return <NotFoundBody />;
}
