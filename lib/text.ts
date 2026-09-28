/** Client-safe text helpers (no server imports). */

/**
 * Hindsight appends structured context to a fact ("... | When: ... | Involving: ...").
 * The brief model reads the full text; people read the fact itself.
 */
export function displayText(text: string): string {
  return text.split(" | ")[0].trim();
}

/** True when an ISO timestamp falls on today's date in the viewer's timezone. */
export function isToday(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === now.toDateString();
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
