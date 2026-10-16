import type { ReactNode } from "react";

/** h2 on the left, a short graphite explainer on the right (§4.3). */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 pt-16 pb-6 min-[900px]:flex-row min-[900px]:items-end">
      <h1 className="display text-[clamp(44px,5vw,80px)]">{title}</h1>
      {children && <p className="max-w-[44ch] text-muted min-[900px]:text-right">{children}</p>}
    </div>
  );
}

export function Loading() {
  return <p className="py-10 text-muted">Loading</p>;
}
