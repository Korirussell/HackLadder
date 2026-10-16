import { SiteChrome } from "@/components/os/site-chrome";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
