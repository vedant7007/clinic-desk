import { NextResponse } from "next/server";
import { askChart, askClinic } from "@/lib/memory";
import { BadRequest, jsonError, readJson, requirePatient, requireString } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const question = requireString(body.question, "question", 500);
    const scope = body.scope ?? "patient";
    if (scope !== "patient" && scope !== "clinic") throw new BadRequest('scope must be "patient" or "clinic"');
    if (scope === "clinic") return NextResponse.json(await askClinic(question));
    return NextResponse.json(await askChart(requirePatient(body.patientId), question));
  } catch (err) {
    return jsonError(err);
  }
}
