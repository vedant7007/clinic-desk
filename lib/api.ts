import { NextResponse } from "next/server";
import { getPatient } from "@/data/patients";
import { ConfigError, explainHindsightError } from "./hindsight";
import type { Patient } from "./types";

export class BadRequest extends Error {}

/** 400 for bad input, 503 for setup problems (missing or rejected keys), 502 for upstream failures. */
export function jsonError(err: unknown) {
  const e = explainHindsightError(err);
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof BadRequest ? 400 : e instanceof ConfigError ? 503 : 502;
  if (status === 502) console.error("[clinic-desk]", err);
  return NextResponse.json({ error: message }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequest("Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequest("Request body must be a JSON object");
  return body as Record<string, unknown>;
}

export function requireString(v: unknown, field: string, max = 2000): string {
  if (v === undefined || v === null) throw new BadRequest(`${field} is required`);
  if (typeof v !== "string") throw new BadRequest(`${field} must be a string`);
  if (!v.trim()) throw new BadRequest(`${field} cannot be empty`);
  if (v.length > max) throw new BadRequest(`${field} is too long (${v.length} characters, max ${max})`);
  return v.trim();
}

export function optionalString(v: unknown, field: string, max = 2000): string {
  if (v === undefined || v === null || v === "") return "";
  return requireString(v, field, max);
}

export function requirePatient(v: unknown): Patient {
  const id = requireString(v, "patientId", 20);
  const patient = getPatient(id);
  if (!patient) throw new BadRequest(`Unknown patient "${id}"`);
  return patient;
}
