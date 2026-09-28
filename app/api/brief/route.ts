import { NextResponse } from "next/server";
import { buildBrief } from "@/lib/brief";
import { BadRequest, jsonError, readJson, requirePatient, requireString } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const patient = requirePatient(body.patientId);
    const complaint = requireString(body.complaint, "complaint", 1000);
    if (body.compare !== undefined && typeof body.compare !== "boolean") throw new BadRequest("compare must be true or false");
    return NextResponse.json(await buildBrief(patient, complaint, body.compare !== false));
  } catch (err) {
    return jsonError(err);
  }
}
