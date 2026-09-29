import { HindsightError } from "@vectorize-io/hindsight-client";
import { CLINIC_BANK, ConfigError, PATIENT_BANK, bankStats, explainHindsightError } from "./hindsight";
import { PRIMARY_MODEL, FALLBACK_MODEL } from "./llm";
import type { BankHealth, HealthReport, ServiceState } from "./types";

/**
 * Health is measured by *calling* Hindsight, not by checking that an env var is
 * non-empty. A key that is set but rejected, a URL that is set but unreachable, and
 * a bank that exists but was never seeded are three different problems, and the
 * setup state can only name the real one if we actually try the connection.
 */

/** The host, so the UI can confirm which server it reached. The API key is never returned. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 60);
  }
}

function classify(err: unknown): { state: ServiceState; message: string } {
  const e = explainHindsightError(err);
  const message = e instanceof Error ? e.message : String(e);
  if (err instanceof HindsightError && (err.statusCode === 401 || err.statusCode === 403)) {
    return { state: "rejected", message };
  }
  if (err instanceof HindsightError && err.statusCode === 404) return { state: "unseeded", message };
  if (e instanceof ConfigError) {
    if (/rejected/i.test(message)) return { state: "rejected", message };
    if (/do not exist yet|seed/i.test(message)) return { state: "unseeded", message };
    return { state: "unreachable", message };
  }
  return { state: "unreachable", message };
}

async function checkBank(id: string): Promise<BankHealth> {
  try {
    const stats = await bankStats(id);
    // A reachable but empty bank is honestly "unseeded", never reported as healthy data.
    return {
      id,
      state: stats.total_nodes > 0 ? "ok" : "unseeded",
      memories: stats.total_nodes,
      error: stats.total_nodes > 0 ? null : "This bank is reachable but holds no memories yet. Run `npm run seed`.",
    };
  } catch (err) {
    const { state, message } = classify(err);
    return { id, state, memories: null, error: message };
  }
}

/** The worst of the two bank states, since the app needs both to work. */
function worst(a: ServiceState, b: ServiceState): ServiceState {
  const rank: ServiceState[] = ["missing", "rejected", "unreachable", "unseeded", "ok"];
  return rank.indexOf(a) <= rank.indexOf(b) ? a : b;
}

export async function healthReport(): Promise<HealthReport> {
  const baseUrl = process.env.HINDSIGHT_BASE_URL;
  const baseUrlSet = Boolean(baseUrl);
  const apiKeySet = Boolean(process.env.HINDSIGHT_API_KEY);
  const groqKeySet = Boolean(process.env.GROQ_API_KEY);

  const groq = { apiKeySet: groqKeySet, model: PRIMARY_MODEL(), fallbackModel: FALLBACK_MODEL() };
  const checkedAt = new Date().toISOString();

  // No URL means there is nothing to call: say so instead of probing and timing out.
  if (!baseUrlSet) {
    const missing: BankHealth = { id: "", state: "missing", memories: null, error: null };
    return {
      hindsight: {
        baseUrlSet: false,
        apiKeySet,
        host: null,
        state: "missing",
        error: "HINDSIGHT_BASE_URL is not set. Copy .env.example to .env.local and add your Hindsight Cloud URL and API key.",
        banks: { patient: { ...missing, id: PATIENT_BANK }, clinic: { ...missing, id: CLINIC_BANK } },
      },
      groq,
      checkedAt,
    };
  }

  const [patient, clinic] = await Promise.all([checkBank(PATIENT_BANK), checkBank(CLINIC_BANK)]);
  const state = worst(patient.state, clinic.state);

  return {
    hindsight: {
      baseUrlSet: true,
      apiKeySet,
      host: hostOf(baseUrl),
      state,
      error: state === "ok" ? null : patient.error ?? clinic.error,
      banks: { patient, clinic },
    },
    groq,
    checkedAt,
  };
}
