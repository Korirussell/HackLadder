import "server-only";

/** Starts a GitHub Actions workflow on main. Needs GITHUB_DISPATCH_TOKEN (server-only). */
export async function dispatchWorkflow(
  workflow: string,
  inputs?: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY ?? "Korirussell/HackLadder";
  if (!token) return { ok: false, error: "GitHub Actions isn't connected: set GITHUB_DISPATCH_TOKEN (a fine-grained token with Actions: write)." };
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", ...(inputs && { inputs }) }),
  });
  if (res.status !== 204) return { ok: false, error: `GitHub didn't start the run (HTTP ${res.status}): ${await res.text()}` };
  return { ok: true };
}
