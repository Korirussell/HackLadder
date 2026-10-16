import { Button } from "./bits";
import { SearchHoldingWindow } from "./search-window";

/** Unknown, hidden and removed profiles all land here (§12: hidden people are 404 with noindex). */
export function NotFoundBody() {
  return (
    <div className="grid max-w-[720px] gap-8 py-10">
      <h1 className="display text-section">Nothing here.</h1>
      <p className="text-sub max-w-[30ch] text-muted">That page doesn&apos;t exist, or the person asked to be removed.</p>
      <SearchHoldingWindow />
      <div>
        <Button href="/">Go to the homepage</Button>
      </div>
    </div>
  );
}
