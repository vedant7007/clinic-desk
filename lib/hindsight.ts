import {
  DEFAULT_USER_AGENT,
  HindsightClient,
  HindsightError,
  createClient,
  createConfig,
  sdk,
  type Client,
} from "@vectorize-io/hindsight-client";

/**
 * Clinic Desk keeps two memory banks on purpose:
 *
 *  - PATIENT bank: everything about individual patients (visits, allergies,
 *    medications, what was tried and whether it worked). Every memory is tagged
 *    `patient:<id>` so a recall for one patient can never leak another's chart.
 *
 *  - CLINIC bank: anonymised case outcomes across the whole practice. This is
 *    the clinic's collective experience: "what actually worked for people like
 *    this". No names, no ids, just age band, context, treatment and result.
 *
 * The agent recalls from both and reasons over them together.
 */

export const PATIENT_BANK = process.env.PATIENT_BANK_ID || "clinicdesk-patients";
export const CLINIC_BANK = process.env.CLINIC_BANK_ID || "clinicdesk-clinic";

let client: HindsightClient | null = null;
let api: Client | null = null;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function hindsightConfigured(): boolean {
  return Boolean(process.env.HINDSIGHT_BASE_URL);
}

function connection() {
  if (!process.env.HINDSIGHT_BASE_URL) {
    throw new ConfigError(
      "HINDSIGHT_BASE_URL is not set. Copy .env.example to .env.local and add your Hindsight Cloud URL and API key."
    );
  }
  return { baseUrl: process.env.HINDSIGHT_BASE_URL, apiKey: process.env.HINDSIGHT_API_KEY || undefined };
}

export function getHindsight(): HindsightClient {
  const { baseUrl, apiKey } = connection();
  if (!client) client = new HindsightClient({ baseUrl, apiKey, userAgent: "clinic-desk/1.0" });
  return client;
}

/**
 * Low-level API client for the endpoints HindsightClient does not wrap with the
 * options we need (tag-filtered memory listing, bank stats). Same auth as above.
 */
function getApi(): Client {
  const { baseUrl, apiKey } = connection();
  if (!api) {
    const headers: Record<string, string> = { "User-Agent": `clinic-desk/1.0 ${DEFAULT_USER_AGENT}` };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    api = createClient(createConfig({ baseUrl, headers }));
  }
  return api;
}

/** Unwrap a low-level SDK result the same way HindsightClient does. */
function unwrap<T>(res: { data?: T; error?: unknown; response?: Response }, operation: string): T {
  if (res.data !== undefined) return res.data;
  const err = res.error as { detail?: unknown; message?: unknown } | undefined;
  const details = err?.detail ?? err?.message ?? err;
  throw new HindsightError(`${operation} failed: ${JSON.stringify(details)}`, res.response?.status, details);
}

export type BankStats = NonNullable<Awaited<ReturnType<typeof sdk.getAgentStats>>["data"]>;

export async function bankStats(bankId: string): Promise<BankStats> {
  return unwrap(await sdk.getAgentStats({ client: getApi(), path: { bank_id: bankId } }), "stats");
}

export type MemoryUnit = NonNullable<Awaited<ReturnType<typeof sdk.listMemories>>["data"]>["items"][number];

/** List memory units filtered by tags (the high-level listMemories has no tag filter). */
export async function listMemoriesByTags(
  bankId: string,
  tags: string[],
  tagsMatch: "any_strict" | "all_strict",
  limit: number
): Promise<{ items: MemoryUnit[]; total: number }> {
  const res = await sdk.listMemories({
    client: getApi(),
    path: { bank_id: bankId },
    query: { tags, tags_match: tagsMatch, limit, state: "valid" },
  });
  return unwrap(res, "listMemories");
}

/**
 * Turn any Hindsight failure into a message a doctor can act on.
 * Auth and connection problems become ConfigError (HTTP 503 in the API).
 */
export function explainHindsightError(err: unknown): unknown {
  if (err instanceof ConfigError) return err;
  if (err instanceof HindsightError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new ConfigError("Hindsight rejected HINDSIGHT_API_KEY. Check the key in .env.local.");
    }
    if (err.statusCode === 404 && /bank/i.test(err.message)) {
      return new ConfigError("The Hindsight memory banks do not exist yet. Run `npm run seed` first.");
    }
  }
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(text)) {
    return new ConfigError(
      `Cannot reach Hindsight at ${process.env.HINDSIGHT_BASE_URL}. Check HINDSIGHT_BASE_URL and your connection.`
    );
  }
  return err;
}

/** Idempotent: createBank is create-or-update on the Hindsight API. */
export async function ensureBanks(): Promise<void> {
  const hs = getHindsight();
  await hs.createBank(PATIENT_BANK, {
    reflectMission:
      "I am the clinical memory of a family practice. I keep an accurate, dated record of each patient: " +
      "complaints, diagnoses, allergies, current medications, treatments tried and whether they worked. " +
      "I never guess. If the record does not say something, I say it is not recorded.",
    retainMission:
      "Extract clinically relevant facts: symptoms and their duration, diagnoses, allergies and reactions, " +
      "medications with start or stop dates, treatments tried, outcomes, and patient preferences. " +
      "Keep dates. Ignore small talk.",
  });
  await hs.createBank(CLINIC_BANK, {
    reflectMission:
      "I am the collective experience of a family practice. I hold anonymised case outcomes and report " +
      "which treatments worked for which kinds of patients, with how many cases support each pattern. " +
      "I never identify patients.",
    retainMission:
      "Extract anonymised patterns: patient profile (age band, sex, relevant conditions and medications), " +
      "presenting problem, treatment tried, and the outcome. Do not store names or identifiers.",
  });
}
