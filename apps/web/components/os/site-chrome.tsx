import Link from "next/link";
import type { ReactNode } from "react";

import { getNextEvent, getSiteStats } from "@/lib/data";
import { plural } from "@/lib/format";

import { BootScreen } from "./boot-screen";
import { Countdown } from "./countdown";
import { Mark } from "./mark";
import { MobileMenu } from "./mobile-menu";
import { DesktopIcons, MenuLinks } from "./nav-links";
import { Wallpaper } from "./wallpaper";

/** The OS around every public page (§4.3): menu bar (with the phone menu), desktop icons, claim button, wallpaper. */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const [stats, next] = await Promise.all([getSiteStats(), getNextEvent()]);
  return (
    <>
      <BootScreen hackers={plural(stats.hackers, "hacker")} hackathons={plural(stats.hackathons, "hackathon")} />
      <Wallpaper />
      <a
        href="#content"
        className="sys fixed top-1 left-1 z-[60] -translate-y-20 rounded-md bg-ink px-3 py-2 text-bg focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sys fixed inset-x-0 top-0 z-50 flex h-[34px] items-center gap-[22px] border-b border-line bg-[color-mix(in_srgb,var(--win)_82%,transparent)] px-4 text-[12.5px] backdrop-blur-[14px]">
        <Link href="/" aria-label="HackLadder home" className="flex items-center gap-2 font-sans text-[14px] font-extrabold tracking-[-0.03em]">
          <Mark size={20} />
          HackLadder
        </Link>
        <MenuLinks />
        <div className="ml-auto flex items-center gap-[18px]">
          {next && <Countdown name={next.name} startsAt={next.starts_at} href={next.website_url} />}
          <MobileMenu />
        </div>
      </header>

      <DesktopIcons />

      <Link
        href="/claim"
        className="fixed top-[calc(var(--spacing-menu)+16px)] right-5 z-20 inline-flex items-center rounded-xl bg-ink px-4 py-[11px] text-[15px] font-bold text-bg max-[980px]:top-[calc(var(--spacing-menu)+12px)] max-[980px]:right-4 max-[980px]:px-[13px] max-[980px]:py-[9px] max-[980px]:text-[14px]"
      >
        Claim your profile
      </Link>

      <main
        id="content"
        className="relative z-[2] mx-auto max-w-content pt-[calc(var(--spacing-menu)+28px)] pr-10 pb-16 pl-[140px] max-[980px]:px-4 max-[980px]:pt-[calc(var(--spacing-menu)+76px)] max-[980px]:pb-12"
      >
        {children}
        <footer className="sys mt-24 flex flex-wrap justify-between gap-x-8 gap-y-2 text-muted">
          <span>Ratings from public Devpost results. Updated every Monday.</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/how-ratings-work" className="hover:text-ink">method</Link>
            <Link href="/upcoming" className="hover:text-ink">upcoming</Link>
            <Link href="/remove" className="hover:text-ink">remove me</Link>
            <Link href="/bot" className="hover:text-ink">bot</Link>
          </span>
        </footer>
      </main>
    </>
  );
}
