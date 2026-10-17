import Link from "next/link";

import type { EventBoardRow, LadderRow, SchoolRow } from "@/lib/data";
import { fileName, isoDate, num, odds, plural } from "@/lib/format";

import { Screen } from "../os/window";
import { Change } from "./bits";

/**
 * The ladder as a file list (§4.4): mono headers, the first row shown selected with a big
 * numeral, the rating in mono with the monthly change beneath it.
 */
export function LadderTable({ rows, selectFirst = true }: { rows: LadderRow[]; selectFirst?: boolean }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="sys text-left text-[11px] text-muted [&>th]:border-b [&>th]:border-line [&>th]:bg-[color-mix(in_srgb,var(--chrome)_40%,var(--win))] [&>th]:px-3.5 [&>th]:py-2 [&>th]:font-medium">
          <th scope="col">rank</th>
          <th scope="col">name</th>
          <th scope="col" className="max-[980px]:hidden">
            best win
          </th>
          <th scope="col" className="text-right">
            rating
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const sel = selectFirst && i === 0;
          return (
            <tr
              key={r.slug}
              className={`group border-b border-line last:border-b-0 ${sel ? "bg-select text-select-ink" : "hover:bg-[color-mix(in_srgb,var(--chrome)_50%,transparent)]"}`}
              aria-selected={sel || undefined}
            >
              <td
                className={`numeral w-[120px] px-3.5 py-3.5 align-middle max-[980px]:w-16 ${sel ? "text-[96px] max-[980px]:text-[56px]" : "text-[44px] max-[980px]:text-[32px]"}`}
              >
                {r.rank}
              </td>
              <td className="px-3.5 py-3.5 align-middle">
                <Link href={`/h/${r.slug}`} className="text-[20px] font-bold tracking-[-0.03em] hover:underline max-[980px]:text-[17px]">
                  {r.display_name}
                </Link>
                <div className={`text-[13px] ${sel ? "opacity-75" : "text-muted"}`}>
                  {[r.school_name, plural(r.events, "event"), r.tier].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="px-3.5 py-3.5 align-middle text-[15px] max-[980px]:hidden">
                {r.best_event_slug ? (
                  <Link href={`/e/${r.best_event_slug}`} className="hover:underline">
                    {r.best_event_title}
                    {r.best_prize ? `, ${r.best_prize}` : ""}
                  </Link>
                ) : (
                  <span className={sel ? "opacity-75" : "text-muted"}>no placement yet</span>
                )}
              </td>
              <td className="sys px-3.5 py-3.5 text-right align-middle text-[15px] font-semibold whitespace-nowrap">
                {num(r.score)}
                <div className={`text-[13px] font-normal ${sel ? "opacity-75" : ""}`}>
                  {sel ? (
                    <span>{signedMonth(r.month_change)}</span>
                  ) : (
                    <Change value={r.month_change} />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function signedMonth(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${num(Math.abs(n))} this month`;
}

/** School rows: rank, name, a 6px track and the value (§4.4). */
export function BarList({ rows, max }: { rows: SchoolRow[]; max: number }) {
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.slug}
          className="grid grid-cols-[28px_1fr_120px_56px] items-center gap-3.5 border-b border-line px-3.5 py-[11px] last:border-b-0 max-[980px]:grid-cols-[24px_1fr_52px]"
        >
          <span className="sys text-muted">{r.rank}</span>
          <Link href={`/s/${r.slug}`} className="truncate font-semibold hover:underline">
            {r.name}
          </Link>
          <span className="h-1.5 rounded-[3px] bg-chrome max-[980px]:hidden" aria-hidden="true">
            <i className="block h-full rounded-[3px] bg-ink" style={{ width: `${Math.max(4, (100 * r.rating) / max)}%` }} />
          </span>
          <span className="sys text-right font-semibold">{num(r.rating)}</span>
        </div>
      ))}
    </div>
  );
}

/** The media-player event card (§4.4); the featured card gets the accent outline. */
export function PlayerCard({ e, featured }: { e: EventBoardRow; featured?: boolean }) {
  return (
    <Link
      href={`/e/${e.slug}`}
      className={`block overflow-hidden rounded-win border border-line bg-win shadow-win hover:border-ink ${featured ? "outline-2 -outline-offset-1 outline-accent" : ""}`}
    >
      <div className="sys flex h-[34px] items-center gap-2.5 border-b border-line bg-chrome px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-[11px] rounded-full bg-accent" />
          <i className="size-[11px] rounded-full border border-line bg-chrome-2" />
          <i className="size-[11px] rounded-full border border-line bg-chrome-2" />
        </span>
        <span className="truncate">{fileName(e.title, "mov")}</span>
        <span className="ml-auto text-muted">#{e.rank}</span>
      </div>
      <Screen className="m-3 h-[150px]">
        <span className="stat absolute bottom-3.5 left-3.5 text-[56px]">{odds(e.win_odds)}</span>
      </Screen>
      <h3 className="px-3.5 text-[22px] font-extrabold tracking-[-0.04em]">{e.title}</h3>
      <p className="px-3.5 pt-0.5 text-[13px] text-muted">
        {[e.is_online ? "Online" : e.location, plural(e.teams, "team"), `${num(e.elite)} elite`].filter(Boolean).join(" · ")}
      </p>
      <div className="sys flex items-center gap-2.5 px-3.5 pt-3 pb-3.5 text-[11.5px] text-muted">
        <span className="grid size-[26px] place-items-center rounded-full bg-ink text-bg" aria-hidden="true">
          ▶
        </span>
        <span>{isoDate(e.ends_on)}</span>
        <span className="relative h-1 flex-1 rounded-sm bg-chrome" aria-hidden="true">
          <i className="absolute inset-y-0 left-0 w-full rounded-sm bg-accent" />
        </span>
      </div>
    </Link>
  );
}
