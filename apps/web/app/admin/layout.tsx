import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "../(auth)/actions";

export const metadata: Metadata = { title: "Admin · HackLadder", robots: { index: false, follow: false } };

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/prizes", label: "Prize tiers" },
  { href: "/admin/ranks", label: "Ranks and settings" },
  { href: "/admin/changes", label: "Change log" },
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto max-w-content px-4 pb-24 min-[900px]:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pt-10 pb-6">
        <Link href="/" className="text-[27px] leading-[0.82] font-extrabold tracking-[-0.05em]">
          Hack
          <br />
          Ladder
        </Link>
        <nav aria-label="Admin sections" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="hover:text-graphite">
              {s.label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className="font-semibold text-graphite hover:text-ink">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
