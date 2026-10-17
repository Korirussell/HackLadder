// Where the menu bar, desktop icons and dock point (§4.3).

export const MENU = [
  { href: "/hackers", label: "Hackers" },
  { href: "/schools", label: "Schools" },
  { href: "/events", label: "Events" },
  { href: "/duos", label: "Duos" },
  { href: "/how-ratings-work", label: "Method" },
] as const;

export type IconName = "hackers" | "schools" | "events" | "duos" | "profile";

export const DESKTOP: { href: string; label: IconName }[] = [
  { href: "/hackers", label: "hackers" },
  { href: "/schools", label: "schools" },
  { href: "/events", label: "events" },
  { href: "/duos", label: "duos" },
  { href: "/me", label: "profile" },
];

export const DOCK = [
  { href: "/", label: "home" },
  { href: "/hackers", label: "ladder" },
  { href: "/events", label: "events" },
  { href: "/me", label: "me" },
] as const;

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
