"use client";

import { useEffect, useState } from "react";

import { BOOT_KEY } from "@/lib/theme";

/**
 * The one orchestrated moment (§4.5): about a second of "loading..." over the first page of a
 * session. HEAD_SCRIPT adds html.booting before paint, so the page renders underneath and this
 * only covers it; without that class (seen this session, reduced motion) it never shows.
 */
export function BootScreen({ hackers, hackathons }: { hackers: string; hackathons: string }) {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("booting")) return;
    try {
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {
      // Without storage it may show again next page; that's acceptable.
    }
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + 3 + Math.floor(Math.random() * 7));
      setPct(p);
      if (p === 100) {
        clearInterval(timer);
        setDone(true);
        setTimeout(() => html.classList.remove("booting"), 650);
      }
    }, 45);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`boot sys fixed inset-0 z-[100] place-items-center bg-bg text-[13px] ${done ? "done" : ""}`}
    >
      <div className="w-[min(360px,80vw)]">
        <div className="mb-2.5 flex justify-between">
          <span>hackladder</span>
          <span>loading... {pct}%</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-sm bg-line">
          <i className="block h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between text-muted">
          <span>{hackers}</span>
          <span>{hackathons}</span>
        </div>
      </div>
    </div>
  );
}
