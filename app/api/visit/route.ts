import { NextResponse } from "next/server";
import { getPatient } from "@/data/patients";
import { retainVisit } from "@/lib/memory";
import { BadRequest, jsonError, optionalString, readJson, requireString } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patient = getPatient(requireString(body.patientId, "patientId", 20));
    if (!patient) throw new BadRequest("Unknown patient");
    const complaint = requireString(body.complaint, "complaint", 1000);
    const notes = optionalString(body.notes, "notes");
    const plan = requireString(body.plan, "plan");
    await retainVisit(patient, { complaint, notes, plan });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
