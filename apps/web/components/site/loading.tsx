import { Win } from "../os/window";

/** A window waiting for its contents: a Suspense fallback that keeps the layout steady. */
export function LoadingWin({ title, height = 320 }: { title: string; height?: number }) {
  return (
    <Win title={title} status={["loading…"]}>
      <div style={{ height }} aria-busy="true" />
    </Win>
  );
}
