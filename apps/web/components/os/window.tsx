import type { ReactNode } from "react";

import { MINI_WARP } from "@/lib/warp";

/**
 * Every block of content lives in a window (§4.3): a title bar with three lights (the first in
 * accent), a file-style title and right-aligned meta, and an optional OS-style status bar.
 */
export function Win({
  title,
  meta,
  status,
  featured,
  className = "",
  bodyClassName = "",
  children,
  labelledBy,
  clip = true,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: [ReactNode, ReactNode?];
  featured?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  labelledBy?: string;
  /** Off for windows with a dropdown that must overflow them (search.app). */
  clip?: boolean;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      aria-label={!labelledBy && typeof title === "string" ? title : undefined}
      className={`relative ${clip ? "overflow-hidden" : ""} rounded-win border border-line bg-win shadow-win ${featured ? "outline-2 -outline-offset-1 outline-accent" : ""} ${className}`}
    >
      <TitleBar title={title} meta={meta} id={labelledBy} />
      <div className={bodyClassName}>{children}</div>
      {status && <StatusBar left={status[0]} right={status[1]} />}
    </section>
  );
}

export function TitleBar({ title, meta, id }: { title: ReactNode; meta?: ReactNode; id?: string }) {
  return (
    <div className="sys flex h-[34px] items-center gap-2.5 rounded-t-[13px] border-b border-line bg-chrome px-3">
      <span className="flex gap-1.5" aria-hidden="true">
        <i className="size-[11px] rounded-full bg-accent" />
        <i className="size-[11px] rounded-full border border-line bg-chrome-2" />
        <i className="size-[11px] rounded-full border border-line bg-chrome-2" />
      </span>
      <span id={id} className="truncate">
        {title}
      </span>
      {meta && <span className="ml-auto shrink-0 text-muted">{meta}</span>}
    </div>
  );
}

export function StatusBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="sys flex min-h-7 items-center justify-between gap-3 rounded-b-[13px] border-t border-line bg-[color-mix(in_srgb,var(--chrome)_50%,var(--win))] px-3 py-1 text-[11px] text-muted">
      <span>{left}</span>
      {right && <span className="text-right">{right}</span>}
    </div>
  );
}

/** A media-player screen: the small warped grid behind big content. */
export function Screen({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-[10px] border border-line bg-bg ${className}`}>
      <svg
        className="warp absolute inset-0 size-full"
        viewBox={`0 0 ${MINI_WARP.width} ${MINI_WARP.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {MINI_WARP.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** h2 on the left, a short muted explainer on the right (§4.3). */
export function SectionHead({ title, children, as = "h2" }: { title: ReactNode; children?: ReactNode; as?: "h1" | "h2" }) {
  const H = as;
  return (
    <div
      className={`mb-[22px] flex flex-col items-start justify-between gap-4 min-[981px]:flex-row min-[981px]:items-end min-[981px]:gap-6 ${as === "h1" ? "min-[981px]:pt-16" : ""}`}
    >
      <H className="display text-section">{title}</H>
      {children && <p className="max-w-[34ch] text-muted min-[981px]:text-right">{children}</p>}
    </div>
  );
}

export function Chip({ accent, children, href }: { accent?: boolean; children: ReactNode; href?: string }) {
  const cls = `sys inline-flex items-center rounded-full border px-2.5 py-1 ${accent ? "border-transparent bg-accent text-accent-ink" : "border-line bg-win"}`;
  return href ? (
    <a className={`${cls} hover:border-ink`} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  );
}
