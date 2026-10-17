/**
 * The H-ladder glyph (design/logo/mark.py). In the site it takes the theme's --rail and --rung,
 * so the top rung matches the theme accent (§4.8 in-site exception). Never put it in a headline.
 */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={`block flex-none ${className ?? ""}`}>
      <g transform="translate(10.628 0) skewX(-12)">
        <rect x="20" y="8" width="19" height="84" rx="3" fill="var(--rail)" />
        <rect x="61" y="8" width="19" height="84" rx="3" fill="var(--rail)" />
        <rect x="38" y="54" width="24" height="12" fill="var(--rail)" />
        <rect x="38" y="24" width="24" height="12" fill="var(--rung)" />
      </g>
    </svg>
  );
}
