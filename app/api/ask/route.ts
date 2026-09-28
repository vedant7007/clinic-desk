import { NextResponse } from "next/server";
import { getPatient } from "@/data/patients";
import { askChart, askClinic } from "@/lib/memory";
import { BadRequest, jsonError, readJson, requireString } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ patientId?: string; question?: string; scope?: "patient" | "clinic" }>(req);
    const question = requireString(body.question, "question", 500);
    if (body.scope === "clinic") return NextResponse.json(await askClinic(question));
    const patient = getPatient(requireString(body.patientId, "patientId", 20));
    if (!patient) throw new BadRequest("Unknown patient");
    return NextResponse.json(await askChart(patient, question));
  } catch (err) {
    return jsonError(err);
  }
}
