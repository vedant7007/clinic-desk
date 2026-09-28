import { NextResponse } from "next/server";
import { getPatient } from "@/data/patients";
import { retainOutcome } from "@/lib/memory";
import type { Outcome } from "@/lib/types";
import { BadRequest, jsonError, optionalString, readJson, requireString } from "@/lib/api";

const OUTCOMES: Outcome[] = ["resolved", "improved", "no_change", "worse"];

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patient = getPatient(requireString(body.patientId, "patientId", 20));
    if (!patient) throw new BadRequest("Unknown patient");
    const outcome = body.outcome as Outcome;
    if (!OUTCOMES.includes(outcome)) throw new BadRequest("outcome must be one of " + OUTCOMES.join(", "));
    const result = await retainOutcome(patient, {
      problem: requireString(body.problem, "problem", 300),
      treatment: requireString(body.treatment, "treatment", 500),
      outcome,
      detail: optionalString(body.detail, "detail", 1000),
    });
    return NextResponse.json({ ok: true, sharedText: result.sharedText });
  } catch (err) {
    return jsonError(err);
  }
}
