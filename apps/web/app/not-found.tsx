import type { Metadata } from "next";

import { SiteChrome } from "@/components/os/site-chrome";
import { NotFoundBody } from "@/components/site/not-found-body";

export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

// URLs that match no route render outside the (site) layout, so this brings the chrome along.
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundBody />
    </SiteChrome>
  );
}
