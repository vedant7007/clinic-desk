import { NextResponse } from "next/server";
import { overviewData } from "@/lib/analytics";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await overviewData());
  } catch (err) {
    return jsonError(err);
  }
}
