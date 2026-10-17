// Validation for what owners edit on /me (§7.7: links, bio, school, theme, hidden).

export const BIO_MAX = 280;

type Field = { ok: true; value: string | null } | { ok: false; error: string };

/** An https link, optionally on one of the given hosts. Empty clears it. */
export function cleanUrl(raw: string, label: string, hosts?: string[]): Field {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, error: `${label} isn't a link. Paste the full address.` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: `${label} has to be a web link.` };
  const host = url.hostname.replace(/^www\./, "");
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`)))
    return { ok: false, error: `${label} should be a ${hosts[0]} link.` };
  url.protocol = "https:";
  return { ok: true, value: url.toString().slice(0, 300) };
}

export function cleanBio(raw: string): Field {
  const s = raw.replace(/\r\n/g, "\n").trim();
  if (s.length > BIO_MAX) return { ok: false, error: `Keep the bio under ${BIO_MAX} characters (it's ${s.length}).` };
  return { ok: true, value: s || null };
}
