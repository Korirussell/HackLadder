"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { GROUP_LABEL, groupHits, hitDetail, hitHref, normalizeQuery, type SearchHit } from "@/lib/search";

type Status = "idle" | "loading" | "done" | "error";

/**
 * search.app (§4.4): an instant dropdown, 150ms debounce, top 8 grouped as hackers, schools and
 * events. ⌘K / Ctrl+K focuses it from anywhere. Without JS the form still submits to /search.
 */
export function SearchBox({ placeholder = "Your name or Devpost username", autoFocus = false }: { placeholder?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const query = normalizeQuery(q);
    if (!query) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { hits?: SearchHit[] };
        if (!res.ok) throw new Error();
        setHits(body.hits ?? []);
        setActive(-1);
        setStatus("done");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const groups = groupHits(hits);
  const flat = groups.flatMap((g) => g.hits);
  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hitHref(hit));
  };
  const showList = open && normalizeQuery(q) !== null && status !== "idle";
  // Hits for an older query stay until the new one answers; an emptied box just hides the list.

  return (
    <form
      role="search"
      action="/search"
      className="relative flex items-center gap-2.5 p-3.5 max-[980px]:flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        const pick = flat[active] ?? flat[0];
        if (pick && status === "done") go(pick);
        else if (normalizeQuery(q)) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="flex flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-bg px-3.5 py-3 focus-within:border-select focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--select)_25%,transparent)] max-[980px]:basis-full">
        <span className="sr-only">Search hackers, schools and events</span>
        <input
          ref={input}
          name="q"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[18px] text-ink placeholder:text-muted focus:outline-none"
        />
        <kbd className="sys rounded-[5px] border border-line px-1.5 py-px text-[11px] text-muted max-[980px]:hidden">⌘K</kbd>
      </label>
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-button bg-ink px-4 py-[11px] text-[15px] font-bold text-bg hover:opacity-90 max-[980px]:flex-1"
      >
        Find me
      </button>

      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-3.5 top-[calc(100%-6px)] z-30 max-h-[420px] overflow-auto rounded-[10px] border border-line bg-win shadow-win"
        >
          {status === "loading" && !flat.length && <p className="sys px-3.5 py-3 text-muted">searching…</p>}
          {status === "error" && <p className="px-3.5 py-3">Search didn&apos;t answer. Try again in a moment.</p>}
          {status === "done" && !flat.length && (
            <p className="px-3.5 py-3">
              No results for &lsquo;{q.trim()}&rsquo;. Try your Devpost username.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.kind} role="group" aria-label={GROUP_LABEL[g.kind]}>
              <div className="sys border-b border-line bg-chrome px-3.5 py-1.5 text-[11px] text-muted">{GROUP_LABEL[g.kind]}</div>
              {g.hits.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <div
                    key={`${h.kind}-${h.slug}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className="flex cursor-pointer items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 aria-selected:bg-select aria-selected:text-select-ink"
                  >
                    <span className="truncate font-semibold">{h.name}</span>
                    <span className="sys shrink-0 text-[11px] opacity-75">{hitDetail(h)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
