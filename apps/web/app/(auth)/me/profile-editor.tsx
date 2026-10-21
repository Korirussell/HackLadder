"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/site/avatar";
import { altButtonClass, buttonClass, fieldClass } from "@/components/site/bits";
import { tierLabel } from "@/lib/format";
import type { HackerEvent, Trophy } from "@/lib/pages";
import { arrangeTrophies, MAX_PINNED, PROJECT_LAYOUTS, type ProjectLayout, readLayout } from "@/lib/profile-layout";

import { type FormState, removePhoto, saveLayout, saveSchool, searchSchools, uploadPhoto } from "./actions";

const IDLE: FormState = { status: "idle" };

function Result({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "" : "text-muted"}>
      {state.message}
    </p>
  );
}

// ---------------------------------------------------------------- photo

const PHOTO_SIZE = 512;

/** Center-crops to a square and re-encodes as WebP: small, and drops EXIF data such as GPS. */
async function squareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(PHOTO_SIZE, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", 0.86));
}

export function PhotoForm({ name, path }: { name: string; path: string | null }) {
  const [state, setState] = useState<FormState>(IDLE);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pick(file: File | undefined) {
    if (!file) return;
    start(async () => {
      let blob: Blob;
      try {
        blob = await squareWebp(file);
      } catch {
        setState({ status: "error", message: "That file couldn't be read as an image." });
        return;
      }
      setPreview(URL.createObjectURL(blob));
      const data = new FormData();
      data.set("photo", new File([blob], "photo.webp", { type: "image/webp" }));
      setState(await uploadPhoto(IDLE, data));
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-5 p-[22px]">
      {preview ? (
        // A local blob preview of the upload until the page refreshes with the stored photo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" width={96} height={96} className="size-24 rounded-[22%] border border-line object-cover" />
      ) : (
        <Avatar name={name} path={path} size={96} />
      )}
      <div className="grid gap-2.5">
        <div className="flex flex-wrap gap-2.5">
          <label className={`${buttonClass} cursor-pointer`}>
            {pending ? "Uploading" : path || preview ? "Change photo" : "Upload a photo"}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={pending}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
          {(path || preview) && (
            <button
              type="button"
              className={altButtonClass}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setPreview(null);
                  setState(await removePhoto());
                })
              }
            >
              Remove
            </button>
          )}
        </div>
        <span className="sys text-[11px] text-muted">Square-cropped to 512px. Only shown once your profile is claimed.</span>
        <Result state={state} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- layout

const LAYOUT_LABEL: Record<ProjectLayout, string> = { list: "List", cards: "Cards", compact: "Compact" };

function move<T>(xs: T[], from: number, to: number): T[] {
  if (to < 0 || to >= xs.length || from === to) return xs;
  const next = [...xs];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Arrange the trophy cabinet (drag, or the arrow buttons), pin up to 3 projects, hide projects
 * and pick how projects are shown. Saved as one layout; display only, ratings never change.
 */
export function LayoutEditor({ trophies, events, layout }: { trophies: Trophy[]; events: HackerEvent[]; layout: unknown }) {
  const initial = readLayout(layout);
  const [order, setOrder] = useState(() => arrangeTrophies(trophies, { ...initial, hidden: [] }).map((t) => t.key));
  const [pinned, setPinned] = useState<number[]>(initial.pinned);
  const [hidden, setHidden] = useState<number[]>(initial.hidden);
  const [projects, setProjects] = useState<ProjectLayout>(initial.projects);
  const [dragging, setDragging] = useState<number | null>(null);
  const [state, setState] = useState<FormState>(IDLE);
  const [pending, start] = useTransition();

  const byKey = new Map(trophies.map((t) => [t.key, t]));
  const hiddenSet = new Set(hidden);
  const toggle = (xs: number[], id: number) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);

  const save = () =>
    start(async () => {
      setState(await saveLayout({ projects, trophies: order, pinned: pinned.filter((id) => !hiddenSet.has(id)), hidden }));
    });

  return (
    <div className="grid gap-6 p-[22px]">
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold">Show projects as</legend>
        <div className="flex flex-wrap gap-2">
          {PROJECT_LAYOUTS.map((l) => (
            <label key={l} className="sys cursor-pointer rounded-full border border-line px-3 py-1 has-checked:border-select has-checked:bg-select has-checked:text-select-ink">
              <input type="radio" name="projects" value={l} checked={projects === l} onChange={() => setProjects(l)} className="sr-only" />
              {LAYOUT_LABEL[l]}
            </label>
          ))}
        </div>
      </fieldset>

      {order.length > 0 && (
        <div className="grid gap-2">
          <p className="font-semibold">Trophy cabinet order</p>
          <p className="text-[14px] text-muted">Drag to rearrange, or use the arrows. The first ones are what visitors see first.</p>
          <ol className="grid gap-1.5">
            {order.map((key, i) => {
              const t = byKey.get(key);
              if (!t) return null;
              const off = hiddenSet.has(t.project_id);
              return (
                <li
                  key={key}
                  draggable
                  onDragStart={() => setDragging(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragging !== null && dragging !== i) {
                      setOrder((o) => move(o, dragging, i));
                      setDragging(i);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={`flex cursor-grab items-center gap-3 rounded-lg border border-line bg-win px-3 py-2 ${dragging === i ? "outline-2 outline-select" : ""} ${off ? "opacity-50" : ""}`}
                >
                  <span aria-hidden="true" className="sys text-muted">
                    ⋮⋮
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-semibold">{t.prize}</b>
                    <span className="sys block truncate text-[11px] text-muted">
                      {tierLabel(t.tier)} · {t.event}
                      {off ? " · hidden with its project" : ""}
                    </span>
                  </span>
                  <button type="button" className="sys rounded-md border border-line px-2 py-0.5 disabled:opacity-40" aria-label={`Move ${t.prize} up`} disabled={i === 0} onClick={() => setOrder((o) => move(o, i, i - 1))}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="sys rounded-md border border-line px-2 py-0.5 disabled:opacity-40"
                    aria-label={`Move ${t.prize} down`}
                    disabled={i === order.length - 1}
                    onClick={() => setOrder((o) => move(o, i, i + 1))}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {events.length > 0 && (
        <div className="grid gap-2">
          <p className="font-semibold">Projects</p>
          <p className="text-[14px] text-muted">
            Pin up to {MAX_PINNED} to show first. Hiding a project only takes it off your profile; it still counts for your rating.
          </p>
          <ul className="grid gap-1.5">
            {events.map((e) => {
              const isPinned = pinned.includes(e.project_id) && !hiddenSet.has(e.project_id);
              const isHidden = hiddenSet.has(e.project_id);
              return (
                <li key={e.project_id} className={`flex flex-wrap items-center gap-3 rounded-lg border border-line bg-win px-3 py-2 ${isHidden ? "opacity-50" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-semibold">{e.project}</b>
                    <span className="sys block truncate text-[11px] text-muted">
                      {e.title} · {e.prize ?? tierLabel(e.tier)}
                    </span>
                  </span>
                  <label className="sys flex items-center gap-1.5 text-[12px]">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      disabled={isHidden || (!isPinned && pinned.filter((id) => !hiddenSet.has(id)).length >= MAX_PINNED)}
                      onChange={() => setPinned((p) => toggle(p, e.project_id))}
                    />
                    pin
                  </label>
                  <label className="sys flex items-center gap-1.5 text-[12px]">
                    <input type="checkbox" checked={isHidden} onChange={() => setHidden((h) => toggle(h, e.project_id))} />
                    hide
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className={buttonClass}>
          {pending ? "Saving" : "Save layout"}
        </button>
        <Result state={state} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- school

type SchoolHit = { id: number; name: string; country: string | null };

/** Search ~10k universities by any words of the name; anything missing goes to an admin. */
export function SchoolPicker({ current }: { current: { id: number; name: string } | null }) {
  const [state, action, pending] = useActionState(saveSchool, IDLE);
  const [requesting, setRequesting] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SchoolHit[]>([]);
  const [chosen, setChosen] = useState<{ id: number; name: string } | null>(current);
  const [, startSearch] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const timer = setTimeout(() => startSearch(async () => setHits(await searchSchools(term))), 200);
    return () => clearTimeout(timer);
  }, [q]);

  const shown = q.trim().length >= 2 ? hits : [];

  return (
    <form action={action} className="grid gap-4 p-[22px]">
      {requesting ? (
        <label className="grid gap-1.5">
          <span className="font-semibold">Your school&apos;s full name</span>
          <input name="new_school" required placeholder="University of Example" className={fieldClass} />
        </label>
      ) : (
        <div className="grid gap-1.5">
          <span className="font-semibold">School</span>
          <input type="hidden" name="school_id" value={chosen?.id ?? ""} />
          {chosen ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg border border-line bg-win px-3 py-2">{chosen.name}</span>
              <button type="button" className="sys text-[12px] text-muted underline" onClick={() => setChosen(null)}>
                change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search, e.g. georgia tech"
                aria-label="Search for your school"
                autoComplete="off"
                className={`${fieldClass} w-full`}
              />
              {shown.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-win shadow-win">
                  {shown.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-chrome"
                        onClick={() => {
                          setChosen({ id: s.id, name: s.name });
                          setQ("");
                        }}
                      >
                        <span>{s.name}</span>
                        <span className="sys shrink-0 text-[11px] text-muted">{s.country}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving" : requesting ? "Request it" : chosen ? "Save school" : "Save: no school"}
        </button>
        <button type="button" onClick={() => setRequesting(!requesting)} className={altButtonClass}>
          {requesting ? "Search the list" : "My school isn't listed"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}
