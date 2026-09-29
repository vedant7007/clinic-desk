import { NextResponse } from "next/server";
import { browseMemories } from "@/lib/analytics";
import { BadRequest, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const scope = params.get("scope") ?? "all";
    if (scope !== "patient" && scope !== "clinic" && scope !== "all") {
      throw new BadRequest('scope must be "patient", "clinic" or "all"');
    }
    const query = params.get("q") ?? undefined;
    const patientId = params.get("patientId") ?? undefined;
    const result = await browseMemories({ scope, query, patientId, limit: 200 });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
