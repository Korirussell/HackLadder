// Where the menu bar, desktop icons and mobile menu point (§4.3).

export const MENU = [
  { href: "/hackers", label: "Hackers" },
  { href: "/schools", label: "Schools" },
  { href: "/events", label: "Events" },
  { href: "/crews", label: "Crews" },
  { href: "/how-ratings-work", label: "Method" },
] as const;

export type IconName = "hackers" | "schools" | "events" | "crews" | "profile";

export const DESKTOP: { href: string; label: IconName }[] = [
  { href: "/hackers", label: "hackers" },
  { href: "/schools", label: "schools" },
  { href: "/events", label: "events" },
  { href: "/crews", label: "crews" },
  { href: "/me", label: "profile" },
];

/** Whether a nav item is the current section: "/" only on the homepage, others by prefix. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const sections: Record<string, string[]> = {
    "/hackers": ["/hackers", "/h/"],
    "/schools": ["/schools", "/s/"],
    "/events": ["/events", "/e/", "/series/", "/upcoming"],
    "/me": ["/me", "/claim"],
  };
  return (sections[href] ?? [href]).some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}
