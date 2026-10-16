import { SiteChrome } from "@/components/os/site-chrome";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
