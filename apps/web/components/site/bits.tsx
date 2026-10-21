import Link from "next/link";
import type { ReactNode } from "react";

import { changeTone, num, signed } from "@/lib/format";

/** A rating change: up in accent, down and unchanged in muted (§4.1). */
export function Change({ value, suffix, className = "" }: { value: number | null | undefined; suffix?: string; className?: string }) {
  const tone = changeTone(value);
  return (
    <span className={`${tone === "up" ? "text-accent" : "text-muted"} ${className}`}>
      {signed(value)}
      {suffix}
    </span>
  );
}

/** Empty states say what to do (§4.4). */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid gap-3 p-6">
      <p className="max-w-[60ch]">{children}</p>
      {action}
    </div>
  );
}

export function Button({
  href,
  children,
  alt,
  external,
}: {
  href: string;
  children: ReactNode;
  alt?: boolean;
  external?: boolean;
}) {
  const cls = alt
    ? "inline-flex items-center gap-2 rounded-button border border-line px-4 py-[11px] text-[15px] font-bold text-ink hover:border-ink"
    : "inline-flex items-center gap-2 rounded-button bg-ink px-4 py-[11px] text-[15px] font-bold text-bg hover:opacity-90";
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-button bg-ink px-4 py-[11px] text-[15px] font-bold text-bg hover:opacity-90 disabled:opacity-60";
export const altButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-button border border-line px-4 py-[11px] text-[15px] font-bold text-ink hover:border-ink disabled:opacity-60";
export const fieldClass =
  "w-full rounded-button border border-line bg-bg px-3.5 py-3 text-[16px] text-ink placeholder:text-muted focus:border-select focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--select)_25%,transparent)] focus:outline-none";

/** Page through a list: "page 2 / 8", with previous and next links. */
export function Pager({ page, last, href }: { page: number; last: number; href: (page: number) => string }) {
  if (last <= 1) return <span>page 1 / 1</span>;
  return (
    <span className="flex items-center gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className="hover:text-ink" rel="prev">
          prev
        </Link>
      ) : (
        <span className="opacity-40">prev</span>
      )}
      <span>
        page {num(page)} / {num(last)}
      </span>
      {page < last ? (
        <Link href={href(page + 1)} className="hover:text-ink" rel="next">
          next
        </Link>
      ) : (
        <span className="opacity-40">next</span>
      )}
    </span>
  );
}

/** A label/value row in a "properties" window. */
export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-3.5 py-[11px] text-[14px] last:border-b-0">
      <span className="sys shrink-0 text-muted">{label}</span>
      <b className="text-right font-semibold">{children}</b>
    </div>
  );
}

export function PageTitle({ children, chips, avatar }: { children: ReactNode; chips?: ReactNode; avatar?: ReactNode }) {
  const title = <h1 className="display text-title break-words max-[980px]:text-[clamp(44px,14vw,96px)]">{children}</h1>;
  return (
    <div className="mb-7">
      {avatar ? (
        <div className="flex items-end gap-5 max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-3">
          {avatar}
          <div className="min-w-0">{title}</div>
        </div>
      ) : (
        title
      )}
      {chips && <div className="mt-[18px] flex flex-wrap gap-2">{chips}</div>}
    </div>
  );
}
