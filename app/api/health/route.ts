import { NextResponse } from "next/server";
import { healthReport } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Always 200: the report itself carries the verdict, so the UI can render the real
 * problem (missing / rejected / unreachable / unseeded) instead of a generic error.
 * Secrets never leave the server — only whether a key is set, and the host reached.
 */
export async function GET() {
  return NextResponse.json(await healthReport());
}
