"use client";

import { type FormEvent, startTransition, useEffect, useOptimistic, useState, useTransition } from "react";

import { type DevpostSearchResult, decideMlhMatches, searchDevpostEvents, undoMlhDecisions } from "@/app/admin/actions";
import { type Candidate, choices, type PriorMatch, type ReviewRow } from "@/lib/mlh-review";
import { button, ghostButton, input } from "@/lib/ui";

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
const gap = (days: number) => (days === 0 ? "same day" : `${days} day${days === 1 ? "" : "s"} off`);
const NAME_MATCH = { exact: "same name", contains: "name contains it", fuzzy: "similar name" } as const;
const prior = (r: ReviewRow): PriorMatch => ({
  mlh_event_id: r.mlh_event_id,
  hackathon_id: r.hackathon_id,
  score: r.score,
  status: r.status,
  note: r.note,
});
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
// Space already presses a focused button or link; don't also toggle the row.
const isPressable = (t: EventTarget | null) => t instanceof HTMLElement && ["BUTTON", "A"].includes(t.tagName);

/**
 * The /admin/mlh queue. Decided rows disappear at once (optimistically) and every decision can
 * be undone. "Likely right" rows start checked, so a batch of them is one click.
 * Keys: j/k move, 1-9 pick a candidate, c confirm the current match, x no Devpost event,
 * space check, / search, u undo.
 */
export function ReviewQueue({ likely, rest, restTitle }: { likely: ReviewRow[]; rest: ReviewRow[]; restTitle: string }) {
  const [hidden, hide] = useOptimistic(new Set<number>(), (s, ids: number[]) => new Set([...s, ...ids]));
  // Rows whose checkbox differs from its default (likely rows start checked, the rest don't), so
  // rows that come back after an undo or a refresh get their default again.
  const [toggled, setToggled] = useState<Set<number>>(() => new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ label: string; prior: PriorMatch[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [undoing, startUndo] = useTransition();

  const shownLikely = likely.filter((r) => !hidden.has(r.mlh_event_id));
  const shownRest = rest.filter((r) => !hidden.has(r.mlh_event_id));
  const all = [...shownLikely, ...shownRest];
  const likelyIds = new Set(likely.map((r) => r.mlh_event_id));
  const isChecked = (id: number) => likelyIds.has(id) !== toggled.has(id);
  const checkedRows = all.filter((r) => isChecked(r.mlh_event_id));
  const activeIndex = Math.max(0, all.findIndex((r) => r.mlh_event_id === activeId));
  const active = all.at(activeIndex);

  function toggle(id: number) {
    setToggled((t) => {
      const next = new Set(t);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function decide(rows: ReviewRow[], pick: (r: ReviewRow) => number | null, label: string) {
    if (!rows.length) return;
    // Keep the cursor where it is: move it to the row after the last decided one.
    const after = all.slice(all.indexOf(rows[rows.length - 1]) + 1).find((r) => !rows.includes(r));
    setActiveId(after?.mlh_event_id ?? null);
    setMessage(null);
    startTransition(async () => {
      hide(rows.map((r) => r.mlh_event_id));
      const res = await decideMlhMatches(rows.map((r) => ({ mlhEventId: r.mlh_event_id, hackathonId: pick(r) })));
      if (res.ok) {
        setUndo({ label, prior: rows.map(prior) });
        setToggled((t) => new Set([...t].filter((id) => !rows.some((r) => r.mlh_event_id === id))));
      } else setMessage(res.error);
    });
  }

  const confirmOne = (r: ReviewRow, hackathonId: number, title: string) =>
    decide([r], () => hackathonId, `${r.mlh_name} matched to ${title}.`);
  const rejectOne = (r: ReviewRow) => decide([r], () => null, `${r.mlh_name}: no Devpost event.`);
  const confirmChecked = () => {
    const rows = checkedRows.filter((r) => r.hackathon_id !== null);
    decide(rows, (r) => r.hackathon_id, `Confirmed ${rows.length} suggestion${rows.length === 1 ? "" : "s"}.`);
  };
  const rejectChecked = () =>
    decide(checkedRows, () => null, `Marked ${checkedRows.length} as having no Devpost event.`);

  function runUndo() {
    if (!undo) return;
    const { prior: rows } = undo;
    startUndo(async () => {
      const res = await undoMlhDecisions(rows);
      if (res.ok) {
        setUndo(null);
        setMessage("Undone.");
      } else setMessage(res.error);
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const move = (by: number) => {
        const next = all.at(Math.min(all.length - 1, Math.max(0, activeIndex + by)));
        if (next) setActiveId(next.mlh_event_id);
      };
      if (e.key === "j" || e.key === "ArrowDown") move(1);
      else if (e.key === "k" || e.key === "ArrowUp") move(-1);
      else if (e.key === "u") runUndo();
      else if (!active) return;
      else if (/^[1-9]$/.test(e.key)) {
        const c = choices(active).at(Number(e.key) - 1);
        if (c) confirmOne(active, c.hackathon_id, c.title);
      } else if (e.key === "c") {
        if (active.hackathon_id !== null) confirmOne(active, active.hackathon_id, active.hackathon_title ?? "it");
      } else if (e.key === "x") rejectOne(active);
      else if (e.key === " ") {
        if (isPressable(e.target)) return;
        toggle(active.mlh_event_id);
      }
      else if (e.key === "/") document.getElementById(`search-${active.mlh_event_id}`)?.focus();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (active) document.getElementById(`row-${active.mlh_event_id}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const section = (title: string, rows: ReviewRow[], explainer: string) =>
    rows.length > 0 && (
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
          <h2 className="text-[24px] font-bold tracking-[-0.02em]">
            {title} <span className="font-normal text-graphite">({rows.length})</span>
          </h2>
          <p className="max-w-[60ch] text-[14px] text-graphite">{explainer}</p>
        </div>
        <ul>
          {rows.map((r) => (
            <QueueRow
              key={r.mlh_event_id}
              row={r}
              active={r.mlh_event_id === active?.mlh_event_id}
              checked={isChecked(r.mlh_event_id)}
              onActivate={() => setActiveId(r.mlh_event_id)}
              onToggle={() => toggle(r.mlh_event_id)}
              onPick={(id, title) => confirmOne(r, id, title)}
              onReject={() => rejectOne(r)}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="pb-32">
      <p className="mt-6 text-[14px] text-graphite">
        Keys: <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>1</Kbd>–<Kbd>9</Kbd> pick a candidate · <Kbd>c</Kbd> confirm the
        outlined match · <Kbd>x</Kbd> no Devpost event · <Kbd>space</Kbd> check · <Kbd>/</Kbd> search Devpost ·{" "}
        <Kbd>u</Kbd> undo
      </p>
      {section(
        "Likely right",
        shownLikely,
        "Same or contained name, deadline within a day, no rival with a similar name. Checked for you: skim, uncheck any that are wrong, then confirm.",
      )}
      {section(restTitle, shownRest, "Pick the right Devpost event, or mark that it has none.")}
      {!all.length && <p className="mt-12">All done on this list.</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-4 px-4 py-3 min-[900px]:pl-[152px]">
          <span className="font-bold">{checkedRows.length} checked</span>
          <button type="button" className={button} disabled={!checkedRows.some((r) => r.hackathon_id !== null)} onClick={confirmChecked}>
            Confirm suggestions
          </button>
          <button type="button" className={ghostButton} disabled={!checkedRows.length} onClick={rejectChecked}>
            No Devpost event
          </button>
          <button type="button" className={ghostButton} disabled={!checkedRows.length}
            onClick={() => setToggled(new Set(all.filter((r) => likelyIds.has(r.mlh_event_id)).map((r) => r.mlh_event_id)))}>
            Uncheck all
          </button>
          <span role="status" className="ml-auto flex items-center gap-3 text-[15px] text-graphite">
            {message ?? undo?.label}
            {undo && (
              <button type="button" className={ghostButton} disabled={undoing} onClick={runUndo}>
                {undoing ? "Undoing" : "Undo"}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-[6px] bg-tile px-1.5 py-0.5 text-[13px] font-semibold text-ink">{children}</kbd>;
}

function QueueRow({
  row,
  active,
  checked,
  onActivate,
  onToggle,
  onPick,
  onReject,
}: {
  row: ReviewRow;
  active: boolean;
  checked: boolean;
  onActivate: () => void;
  onToggle: () => void;
  onPick: (hackathonId: number, title: string) => void;
  onReject: () => void;
}) {
  const [results, setResults] = useState<DevpostSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const offered = choices(row);

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "");
    startSearch(async () => {
      const res = await searchDevpostEvents(q, row.ends_at.slice(0, 10));
      setResults(res.results);
      setSearchError(res.error ?? null);
    });
  }

  return (
    <li
      id={`row-${row.mlh_event_id}`}
      aria-current={active ? "true" : undefined}
      // Clicking a control acts on the row; clicking anywhere else makes it the keyboard's row.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a, input, form")) onActivate();
      }}
      className={`grid scroll-mt-24 scroll-mb-28 gap-4 border-b border-rule px-3 py-4 min-[900px]:grid-cols-[auto_1fr_1.5fr] ${active ? "rounded-tile bg-tile" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Check ${row.mlh_name}`}
        className="mt-1.5 size-5 accent-ink"
      />
      <div>
        <p className="text-[19px] leading-tight font-bold tracking-[-0.01em]">
          {row.mlh_name}
          {row.is_high_school && (
            <span className="ml-2 rounded-[6px] border border-ink px-1.5 py-0.5 align-middle text-[13px] font-semibold">
              High school
            </span>
          )}
        </p>
        <p className="mt-1 text-[14px] text-graphite">
          MLH season {row.season} · {fmt(row.starts_at)} to {fmt(row.ends_at)} · {row.format}
          {row.location ? ` · ${row.location}` : ""}
        </p>
        {row.website_url && (
          <a href={row.website_url} className="text-[14px] break-all underline underline-offset-2" rel="noreferrer" target="_blank">
            {row.website_url}
          </a>
        )}
        <p className="mt-1 text-[13px] text-graphite">
          {row.status}
          {row.note ? `: ${row.note}` : ""}
        </p>
      </div>
      <div>
        {offered.length === 0 && <p className="text-[15px] text-graphite">No Devpost event within 3 days. Search below.</p>}
        <ol className="flex flex-col gap-1.5">
          {offered.map((c, i) => (
            <Choice key={c.hackathon_id} candidate={c} index={i + 1} current={c.hackathon_id === row.hackathon_id} onPick={onPick} />
          ))}
          {results?.map((r) => (
            <Choice key={`s${r.hackathon_id}`} candidate={r} current={r.hackathon_id === row.hackathon_id} onPick={onPick} />
          ))}
        </ol>
        {results?.length === 0 && <p className="mt-2 text-[14px] text-graphite">No Devpost events found.</p>}
        {searchError && <p role="alert" className="mt-2 text-[14px]">{searchError}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={ghostButton} onClick={onReject}>
            No Devpost event
          </button>
          <form onSubmit={search} className="flex min-w-[220px] flex-1 gap-2" role="search">
            <input
              id={`search-${row.mlh_event_id}`}
              name="q"
              aria-label={`Search Devpost for ${row.mlh_name}`}
              placeholder="Search Devpost by name"
              defaultValue={row.mlh_name}
              onFocus={(e) => e.currentTarget.select()}
              className={`${input} py-1.5 text-[15px]`}
            />
            <button type="submit" className={ghostButton} disabled={searching}>
              {searching ? "Searching" : "Search"}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function Choice({
  candidate: c,
  index,
  current,
  onPick,
}: {
  candidate: Candidate | DevpostSearchResult;
  index?: number;
  current: boolean;
  onPick: (hackathonId: number, title: string) => void;
}) {
  const detail =
    "name_match" in c
      ? `${NAME_MATCH[c.name_match]} · ${gap(c.days)}`
      : c.ends_on
        ? `deadline ${fmt(c.ends_on)}`
        : "";
  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => onPick(c.hackathon_id, c.title)}
        className={`flex flex-1 items-baseline gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[15px] hover:bg-ink hover:text-paper focus-visible:shadow-[0_0_0_3px_var(--color-signal)] focus-visible:outline-none ${current ? "ring-1 ring-ink" : ""}`}
      >
        {index !== undefined && index <= 9 && <Kbd>{String(index)}</Kbd>}
        <span>
          <b>{c.title}</b> <span className="opacity-70">({c.slug}) · {detail}</span>
          {current && <span className="opacity-70"> · current match</span>}
        </span>
      </button>
      <a href={`https://${c.slug}.devpost.com/`} target="_blank" rel="noreferrer" className="py-1.5 text-[14px] text-graphite underline underline-offset-2"
        onClick={(e) => e.stopPropagation()}>
        Open
      </a>
    </li>
  );
}
