import { NextResponse } from "next/server";
import { retainVisit } from "@/lib/memory";
import { jsonError, optionalString, readJson, requirePatient, requireString } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const patient = requirePatient(body.patientId);
    const complaint = requireString(body.complaint, "complaint", 1000);
    const notes = optionalString(body.notes, "notes", 1000);
    const plan = requireString(body.plan, "plan", 1000);
    const patientReceipt = await retainVisit(patient, { complaint, notes, plan });
    // 502 when Hindsight refused the write: the UI must never claim the chart was updated.
    if (!patientReceipt.ok) {
      return NextResponse.json({ error: patientReceipt.error ?? "The visit could not be written to memory." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, patient: patientReceipt });
  } catch (err) {
    return jsonError(err);
  }
}
