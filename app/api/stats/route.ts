import { NextResponse } from "next/server";
import { memoryStats } from "@/lib/memory";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await memoryStats());
  } catch (err) {
    return jsonError(err);
  }
}
