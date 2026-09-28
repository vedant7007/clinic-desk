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

/** Lower-case the first letter unless the first word is an acronym (ACE, UTI, GERD). */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

const FILLER = /\b(again|now|still|just|really|also|since|very|lately|recently)\b/gi;
const MAX_PROBLEM_WORDS = 8;

/**
 * A short problem label from the reception note, used only when the brief did not
 * provide one. Keeps the leading clauses of the first sentence, drops filler words,
 * and stops before the label gets long: "Dry cough again, now more than 3 months."
 * becomes "dry cough, more than 3 months".
 */
export function problemFromComplaint(complaint: string): string {
  const sentence = complaint.split(/[.!?;\n]/).find((s) => s.trim()) ?? "";
  const clauses = sentence
    .split(",")
    .map((c) => c.replace(FILLER, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const kept: string[] = [];
  let words = 0;
  for (const c of clauses) {
    const n = c.split(" ").length;
    if (kept.length > 0 && words + n > MAX_PROBLEM_WORDS) break;
    kept.push(c);
    words += n;
  }
  const label = kept.join(", ").split(" ").slice(0, MAX_PROBLEM_WORDS).join(" ");
  return lowerFirst(label);
}

/** Prefer the brief's own problem label; fall back to the complaint. */
export function suggestProblem(briefProblem: string | undefined, complaint: string): string {
  const fromBrief = briefProblem?.trim().replace(/[.\s]+$/, "") ?? "";
  if (fromBrief && fromBrief.split(/\s+/).length <= 12) return lowerFirst(fromBrief);
  return problemFromComplaint(complaint);
}
