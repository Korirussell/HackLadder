import "server-only";

import type { AddRequest } from "./add";
import { publicClient } from "./supabase/public";

/** The latest add-me request for a username, uncached: the status page polls it. */
export async function getAddRequest(username: string): Promise<AddRequest | null> {
  const supabase = publicClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("add_request_status", { p_username: username });
  if (error) throw new Error(`add_request_status: ${error.message}`);
  return (data ?? null) as AddRequest | null;
}
