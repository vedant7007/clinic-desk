import { NextResponse } from "next/server";
import { PATIENTS } from "@/data/patients";
import { hindsightConfigured } from "@/lib/hindsight";

export async function GET() {
  return NextResponse.json({
    patients: PATIENTS,
    configured: {
      hindsight: hindsightConfigured(),
      groq: Boolean(process.env.GROQ_API_KEY),
    },
  });
}
