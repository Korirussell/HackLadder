// What the bio-code functions return, as copy (§4.6: say what happened and how to fix it).
// Shared by claiming (§11) and "remove me" (§9.4).

export type BioCode = { code: string; expiresAt: string; username: string; displayName: string };

export const DEVPOST_USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** "devpost.com/jane-doe", "https://devpost.com/jane-doe/", "@jane-doe" -> "jane-doe". */
export function parseUsername(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?devpost\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return DEVPOST_USERNAME.test(s) ? s : null;
}

export function claimResultMessage(result: string): { ok: boolean; message: string } {
  switch (result) {
    case "claimed":
      return { ok: true, message: "It's yours. You can delete the code from your Devpost bio now." };
    case "merged":
      return { ok: true, message: "Verified. That account's results now count on your profile. You can delete the code from that bio." };
    case "code_missing":
      return {
        ok: false,
        message: "The code isn't in that Devpost bio yet. Save your Devpost profile with the code in the bio, then press Verify again.",
      };
    case "profile_missing":
      return {
        ok: false,
        message: "Devpost says that profile doesn't exist or is private. Make it public for a minute, or send a correction for an admin to check.",
      };
    default:
      return { ok: false, message: "That didn't work. Try again in a minute." };
  }
}

export function removalResultMessage(result: string): { ok: boolean; message: string } {
  switch (result) {
    case "removed":
      return { ok: true, message: "Done. Your profile is hidden everywhere on HackLadder. You can delete the code from your bio." };
    case "code_missing":
      return { ok: false, message: "The code isn't in that Devpost bio yet. Save it in your bio, then press Verify again." };
    case "profile_missing":
      return { ok: false, message: "Devpost says that profile doesn't exist or is private. Make it public for a minute, then try again." };
    default:
      return { ok: false, message: "That didn't work. Try again in a minute." };
  }
}

/** Database errors raised on purpose carry a sentence for the user; anything else gets a generic line. */
export function friendlyError(error: { message: string; code?: string } | null): string {
  if (!error) return "Something went wrong. Try again in a minute.";
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "42501") return "Sign in first.";
  return "Something went wrong on our side. Try again in a minute.";
}
