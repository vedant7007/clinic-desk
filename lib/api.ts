import { NextResponse } from "next/server";
import { ConfigError } from "./hindsight";

export function jsonError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof ConfigError ? 503 : err instanceof BadRequest ? 400 : 502;
  if (status === 502) console.error("[clinic-desk]", err);
  return NextResponse.json({ error: message }, { status });
}

export class BadRequest extends Error {}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequest("Request body must be JSON");
  }
}

export function requireString(v: unknown, field: string, max = 2000): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`${field} is required`);
  if (v.length > max) throw new BadRequest(`${field} is too long (max ${max} characters)`);
  return v.trim();
}

export function optionalString(v: unknown, field: string, max = 2000): string {
  if (v === undefined || v === null || v === "") return "";
  return requireString(v, field, max);
}
