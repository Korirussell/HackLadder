"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MENU } from "./nav";

const ITEMS = [{ href: "/", label: "Home" }, ...MENU, { href: "/search", label: "Search" }, { href: "/me", label: "My profile" }];

/** The phone navigation (§4.3): a menu button in the top bar that opens a sheet of links. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-[981px]:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
        className="grid size-[26px] place-items-center rounded-md hover:bg-select hover:text-select-ink aria-expanded:bg-select aria-expanded:text-select-ink"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          {open ? (
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 top-[34px] z-40" onClick={() => setOpen(false)} />
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="fixed inset-x-4 top-[42px] z-50 grid rounded-xl border border-line bg-win p-1.5 font-sans text-[17px] shadow-win"
          >
            {ITEMS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 font-semibold tracking-[-0.01em] hover:bg-select hover:text-select-ink"
              >
                {m.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
