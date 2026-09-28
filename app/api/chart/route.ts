import { NextResponse } from "next/server";
import { listChart } from "@/lib/memory";
import { jsonError, requirePatient } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const patient = requirePatient(new URL(req.url).searchParams.get("patientId"));
    return NextResponse.json(await listChart(patient));
  } catch (err) {
    return jsonError(err);
  }
}
