"use client";

import { useSyncExternalStore } from "react";

import { isTheme, THEME_KEY, type ThemeId, USE_MINE_KEY, viewerTheme } from "./theme";

// The theme lives on <html data-theme>, set before first paint by HEAD_SCRIPT. This store keeps
// React in step with it: the viewer's own theme, and an optional profile owner's theme (§4.7).

type State = { viewer: ThemeId; owner: ThemeId | null; useMine: boolean };

const listeners = new Set<() => void>();
let state: State | null = null;

function read(key: string, storage: "local" | "session"): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null, storage: "local" | "session") {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the choice still applies to this page.
  }
}

function current(): State {
  state ??= {
    viewer: viewerTheme(read(THEME_KEY, "local"), matchMedia("(prefers-color-scheme: dark)").matches),
    owner: null,
    useMine: read(USE_MINE_KEY, "session") === "1",
  };
  return state;
}

export function effectiveTheme(s: State): ThemeId {
  return s.owner && !s.useMine ? s.owner : s.viewer;
}

function update(patch: Partial<State>) {
  state = { ...current(), ...patch };
  document.documentElement.dataset.theme = effectiveTheme(state);
  for (const l of listeners) l();
}

/** The dock swatches: the viewer picks their own theme, which also wins over an owner's. */
export function chooseTheme(theme: ThemeId) {
  write(THEME_KEY, theme, "local");
  const s = current();
  if (s.owner) write(USE_MINE_KEY, "1", "session");
  update({ viewer: theme, useMine: s.owner ? true : s.useMine });
}

/** A profile page shows its owner's theme until the viewer says "use mine". */
export function setOwnerTheme(theme: string | null) {
  update({ owner: isTheme(theme) ? theme : null });
}

export function setUseMine(useMine: boolean) {
  write(USE_MINE_KEY, useMine ? "1" : null, "session");
  update({ useMine });
}

const SERVER: State = { viewer: "paper", owner: null, useMine: false };

export function useTheme(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => SERVER,
  );
}
