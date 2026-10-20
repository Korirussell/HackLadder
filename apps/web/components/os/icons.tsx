import type { IconName } from "./nav";

// Desktop icon glyphs from design/reference.html.
export function Icon({ name }: { name: IconName }) {
  const common = { viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": true } as const;
  switch (name) {
    case "hackers":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M7 3v18M17 3v18M7 8h10M7 14h10" />
        </svg>
      );
    case "schools":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.2V16c0 1.7 2.7 4 6 4s6-2.3 6-4v-3.8l-6 3.3-6-3.3Z" />
        </svg>
      );
    case "events":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
        </svg>
      );
    case "crews":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="8" cy="8" r="3.5" />
          <circle cx="16.5" cy="9" r="3" />
          <path d="M1.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2h-13Zm14 0c0-2-.6-3.8-1.7-5.1.8-.4 1.7-.6 2.7-.6 3 0 5 2.2 5 5.7h-6Z" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      );
  }
}
