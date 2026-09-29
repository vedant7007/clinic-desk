import { NextResponse } from "next/server";
import { insightsData } from "@/lib/analytics";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await insightsData());
  } catch (err) {
    return jsonError(err);
  }
}
