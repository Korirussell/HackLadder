"use client";

import { useSyncExternalStore } from "react";

import { toTheme, type ThemeId, USE_MINE_KEY, viewerTheme } from "./theme";

// The theme lives on <html data-theme>, set before first paint by HEAD_SCRIPT. This store keeps
// React in step with it: the viewer's own theme, and an optional profile owner's theme (§4.7).

type State = { viewer: ThemeId; owner: ThemeId | null; useMine: boolean };

const listeners = new Set<() => void>();
let state: State | null = null;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the choice still applies to this page.
  }
}

function current(): State {
  state ??= {
    viewer: viewerTheme(matchMedia("(prefers-color-scheme: dark)").matches),
    owner: null,
    useMine: read(USE_MINE_KEY) === "1",
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

/** A profile page shows its owner's theme until the viewer says "use mine". */
export function setOwnerTheme(theme: string | null) {
  update({ owner: toTheme(theme) });
}

export function setUseMine(useMine: boolean) {
  write(USE_MINE_KEY, useMine ? "1" : null);
  update({ useMine });
}

const SERVER: State = { viewer: "sakura", owner: null, useMine: false };

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
