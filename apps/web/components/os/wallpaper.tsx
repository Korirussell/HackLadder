"use client";

import { useEffect, useState } from "react";

import { warpPaths } from "@/lib/warp";

/** The warped grid behind everything (§4.3), redrawn to the viewport on resize. */
export function Wallpaper() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize({ w: innerWidth, h: innerHeight }));
    };
    measure();
    addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", measure);
    };
  }, []);
  const { w, h } = size ?? { w: 1440, h: 900 };
  return (
    <svg
      aria-hidden="true"
      className="warp pointer-events-none fixed inset-0 z-0 size-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      {warpPaths(w, h, 56, 0.22).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
