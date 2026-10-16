"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "./icons";
import { DESKTOP, DOCK, isCurrent, MENU } from "./nav";

// usePathname suspends on routes whose params aren't known at build time, so every nav that
// marks the current page renders a plain version as its fallback (Next docs: usePathname).

function Menu({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex gap-1 max-[980px]:hidden">
      {MENU.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          aria-current={pathname && isCurrent(m.href, pathname) ? "page" : undefined}
          className="rounded-md px-[9px] py-1 hover:bg-select hover:text-select-ink aria-[current=page]:bg-select aria-[current=page]:text-select-ink"
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

function Desktop({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed top-[calc(var(--spacing-menu)+28px)] left-[18px] z-[5] flex flex-col gap-3.5 max-[980px]:hidden"
    >
      {DESKTOP.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          aria-current={pathname && isCurrent(d.href, pathname) ? "page" : undefined}
          className="group flex w-[84px] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center"
        >
          <span className="grid size-[52px] place-items-center rounded-tile border border-line bg-win text-ink shadow-[0_6px_14px_-8px_rgba(0,0,0,.35)] group-hover:border-ink group-aria-[current=page]:border-select group-aria-[current=page]:bg-select group-aria-[current=page]:text-select-ink">
            <Icon name={d.label} />
          </span>
          <span className="sys text-[11px] leading-tight">{d.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function DockLinks({ pathname }: { pathname: string | null }) {
  return (
    <>
      {DOCK.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          aria-current={pathname && isCurrent(d.href, pathname) ? "page" : undefined}
          className="sys flex items-center rounded-[10px] px-3 py-[7px] hover:bg-chrome aria-[current=page]:bg-ink aria-[current=page]:text-bg max-[980px]:px-2"
        >
          {d.label}
          <span className="max-[980px]:hidden">.app</span>
        </Link>
      ))}
    </>
  );
}

function withPathname(View: (p: { pathname: string | null }) => React.ReactNode) {
  function Active() {
    return <View pathname={usePathname()} />;
  }
  return function Nav() {
    return (
      <Suspense fallback={<View pathname={null} />}>
        <Active />
      </Suspense>
    );
  };
}

export const MenuLinks = withPathname(Menu);
export const DesktopIcons = withPathname(Desktop);
export const DockNav = withPathname(DockLinks);
