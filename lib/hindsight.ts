import { HindsightClient } from "@vectorize-io/hindsight-client";

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

export function hindsightConfigured(): boolean {
  return Boolean(process.env.HINDSIGHT_BASE_URL);
}

export function getHindsight(): HindsightClient {
  if (!process.env.HINDSIGHT_BASE_URL) {
    throw new ConfigError(
      "HINDSIGHT_BASE_URL is not set. Copy .env.example to .env.local and add your Hindsight Cloud URL and API key."
    );
  }
  if (!client) {
    client = new HindsightClient({
      baseUrl: process.env.HINDSIGHT_BASE_URL,
      apiKey: process.env.HINDSIGHT_API_KEY || undefined,
      userAgent: "clinic-desk/1.0",
    });
  }
  return client;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
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
