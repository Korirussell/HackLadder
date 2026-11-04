import "server-only";

import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

import { type ThemeId } from "./theme";
import { warpPaths } from "./warp";

// 1200x630 share cards styled as an OS window on the warped grid (§10). Satori can't read CSS
// variables, so each theme's tokens are repeated here; tests/og.test.ts keeps them equal to
// globals.css. The mark always uses the official orange (§4.8).

type Palette = { bg: string; grid: string; win: string; chrome: string; ink: string; muted: string; line: string; accent: string; accentInk: string };

export const OG_PALETTES: Record<ThemeId, Palette> = {
  sakura: { bg: "#ECE8FA", grid: "#D3CBF0", win: "#FFFFFF", chrome: "#E4DEF8", ink: "#1B1530", muted: "#6C6488", line: "#DCD4F5", accent: "#FF3D7F", accentInk: "#FFFFFF" },
  midnight: { bg: "#050507", grid: "#1E1E2A", win: "#0F0F15", chrome: "#191922", ink: "#F3F1FA", muted: "#8E8AA3", line: "#26263A", accent: "#FF2E93", accentInk: "#0B0B0F" },
};

const W = 1200;
const H = 630;
const GRID = warpPaths(W, H, 56, 0.22);

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 800; style: "normal" };
let fonts: Promise<Font[]> | null = null;

/** Static instances from Google Fonts (Satori needs TTF/OTF, not variable woff2). */
async function loadFont(family: string, weight: 400 | 500 | 800, name: string): Promise<Font | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return { name, data: await (await fetch(url)).arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

function getFonts(): Promise<Font[]> {
  fonts ??= Promise.all([
    loadFont("Bricolage+Grotesque", 800, "Bricolage"),
    loadFont("Bricolage+Grotesque", 400, "Bricolage"),
    loadFont("IBM+Plex+Mono", 500, "Plex"),
  ]).then((f) => f.filter((x): x is Font => x !== null));
  return fonts;
}

export type Card = {
  file: string;
  meta?: string;
  numeral?: string;
  title: string;
  lines: string[];
  chip?: string;
  image?: string; // a claimed owner's photo (public URL)
  status: [string, string];
};

export async function renderCard(card: Card, theme: ThemeId = "sakura"): Promise<ImageResponse> {
  const p = OG_PALETTES[theme];
  const loaded = await getFonts();
  const sys = loaded.some((f) => f.name === "Plex") ? "Plex" : undefined;
  const display = loaded.some((f) => f.name === "Bricolage") ? "Bricolage" : undefined;
  const titleSize = card.title.length > 22 ? 76 : card.title.length > 14 ? 96 : 118;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: p.bg, position: "relative", fontFamily: display }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
          {GRID.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={p.grid} strokeWidth={1.2} />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 64,
            right: 64,
            bottom: 56,
            display: "flex",
            flexDirection: "column",
            background: p.win,
            border: `2px solid ${p.line}`,
            borderRadius: 22,
            overflow: "hidden",
          }}
        >
          <Bar p={p} sys={sys}>
            <span>{card.file}</span>
            {card.meta && <span style={{ marginLeft: "auto", color: p.muted }}>{card.meta}</span>}
          </Bar>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 44, padding: "0 52px" }}>
            {card.numeral && (
              <div style={{ fontSize: card.numeral.length > 4 ? 150 : 210, fontWeight: 800, letterSpacing: "-0.07em", color: p.ink, lineHeight: 1 }}>
                {card.numeral}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
              {(card.chip || card.image) && (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  {card.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
                    <img src={card.image} alt="" width={112} height={112} style={{ borderRadius: 26, border: `2px solid ${p.line}`, objectFit: "cover" }} />
                  )}
                  {card.chip && (
                    <span style={{ fontFamily: sys, fontSize: 24, background: p.accent, color: p.accentInk, borderRadius: 999, padding: "6px 18px" }}>
                      {card.chip}
                    </span>
                  )}
                </div>
              )}
              <div style={{ fontSize: titleSize, fontWeight: 800, letterSpacing: "-0.055em", color: p.ink, lineHeight: 0.92 }}>{card.title}</div>
              {card.lines.map((l) => (
                <div key={l} style={{ fontSize: 32, color: p.muted, fontWeight: 400 }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              borderTop: `2px solid ${p.line}`,
              background: p.chrome,
              fontFamily: sys,
              fontSize: 21,
              color: p.muted,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <MarkGlyph rail={p.ink} rung={p.accent} />
              {card.status[0]}
            </span>
            <span>{card.status[1]}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: loaded,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}

function Bar({ p, sys, children }: { p: Palette; sys?: string; children: ReactNode }) {
  return (
    <div
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 22px",
        background: p.chrome,
        borderBottom: `2px solid ${p.line}`,
        fontFamily: sys,
        fontSize: 22,
        color: p.ink,
      }}
    >
      <span style={{ display: "flex", gap: 10 }}>
        <span style={{ width: 18, height: 18, borderRadius: 9, background: p.accent }} />
        <span style={{ width: 18, height: 18, borderRadius: 9, background: p.line }} />
        <span style={{ width: 18, height: 18, borderRadius: 9, background: p.line }} />
      </span>
      {children}
    </div>
  );
}

function MarkGlyph({ rail, rung }: { rail: string; rung: string }) {
  return (
    <svg width={30} height={30} viewBox="0 0 100 100">
      <g transform="translate(10.628 0) skewX(-12)">
        <rect x="20" y="8" width="19" height="84" rx="3" fill={rail} />
        <rect x="61" y="8" width="19" height="84" rx="3" fill={rail} />
        <rect x="38" y="54" width="24" height="12" fill={rail} />
        <rect x="38" y="24" width="24" height="12" fill={rung} />
      </g>
    </svg>
  );
}
