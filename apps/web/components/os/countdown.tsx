"use client";

import { useSyncExternalStore } from "react";

import { timecode } from "@/lib/format";

// One shared clock that ticks each second while anything is subscribed.
const clock = {
  subscribe(onTick: () => void) {
    const t = setInterval(onTick, 1000);
    return () => clearInterval(t);
  },
  now: () => Math.floor(Date.now() / 1000),
  // Rendered empty on the server: the time left depends on when the page is viewed.
  server: () => null,
};

/** The menu-bar countdown to the next big event, in DD:HH:MM:SS, ticking every second (§4.3). */
export function Countdown({ name, startsAt, href }: { name: string; startsAt: string; href: string | null }) {
  const now = useSyncExternalStore(clock.subscribe, clock.now, clock.server);
  const left = now === null ? null : Date.parse(startsAt) - now * 1000;
  const label = left === null ? "--:--:--:--" : timecode(left);
  const body = (
    <>
      <span className="size-[7px] rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]" />
      <span className="max-w-[16ch] truncate max-[560px]:hidden">{name}</span>
      <b className="font-semibold">
        <time dateTime={startsAt}>{label}</time>
      </b>
    </>
  );
  const title = `Next MLH event: ${name}`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline" title={title}>
      {body}
    </a>
  ) : (
    <span className="flex items-center gap-2" title={title}>
      {body}
    </span>
  );
}
