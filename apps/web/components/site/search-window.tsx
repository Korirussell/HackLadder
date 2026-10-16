import type { ReactNode } from "react";

import { Win } from "../os/window";
import { SearchBox } from "./search-box";

/** The search.app window: the homepage hero and /search. */
export function SearchHoldingWindow({
  meta,
  status,
  autoFocus,
}: {
  meta?: ReactNode;
  status?: [ReactNode, ReactNode?];
  autoFocus?: boolean;
}) {
  return (
    <Win title="search.app" meta={meta} status={status} clip={false}>
      <SearchBox autoFocus={autoFocus} />
    </Win>
  );
}
