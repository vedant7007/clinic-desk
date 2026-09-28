import { NextResponse } from "next/server";
import { getPatient } from "@/data/patients";
import { buildBrief } from "@/lib/brief";
import { BadRequest, jsonError, readJson, requireString } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ patientId?: string; complaint?: string; compare?: boolean }>(req);
    const patient = getPatient(requireString(body.patientId, "patientId", 20));
    if (!patient) throw new BadRequest("Unknown patient");
    const complaint = requireString(body.complaint, "complaint", 1000);
    const result = await buildBrief(patient, complaint, body.compare !== false);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
