import Groq from "groq-sdk";
import type { ZodType } from "zod";
import { ConfigError } from "./hindsight";

let groq: Groq | null = null;

function getGroq(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new ConfigError("GROQ_API_KEY is not set. Add it to .env.local (free key at console.groq.com).");
  }
  // Retries are handled below so rate limits and model fallback follow one policy.
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0, timeout: 40_000 });
  return groq;
}

export const PRIMARY_MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const FALLBACK_MODEL = () => process.env.GROQ_FALLBACK_MODEL || "qwen/qwen3.8-27b";

/**
 * Keep hidden reasoning short: it counts against the per-minute token quota and
 * the brief needs structure, not a long chain of thought.
 */
function reasoningEffort(model: string): "low" | "none" | undefined {
  if (model.startsWith("openai/gpt-oss")) return "low";
  if (model.startsWith("qwen/")) return "none";
  return undefined;
}

/** Longest rate-limit wait we sit through before moving on to the fallback model. */
const MAX_RATE_LIMIT_WAIT_MS = 8_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1_500;

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** Pull the first JSON object out of a model reply (handles <think> blocks and code fences). */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model reply contained no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Milliseconds to wait for a 429, from its retry-after header; null when the error is not a rate limit. */
export function rateLimitWaitMs(err: unknown): number | null {
  if (!(err instanceof Groq.APIError) || err.status !== 429) return null;
  const header = err.headers?.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : DEFAULT_RATE_LIMIT_WAIT_MS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Groq's own sentence ("The model x does not exist...") rather than the raw JSON body. */
function describe(err: unknown): string {
  if (err instanceof Groq.APIError) {
    const body = err.error as { error?: { message?: unknown } } | undefined;
    const inner = typeof body?.error?.message === "string" ? body.error.message : err.message;
    return `${err.status ?? "network error"}: ${inner}`.slice(0, 200);
  }
  return err instanceof Error ? err.message.slice(0, 200) : String(err);
}

/**
 * Ask for JSON and validate it. Open-weight models occasionally return malformed
 * JSON or drop a field, so: try the primary model twice, then the fallback model once.
 * A 429 waits for retry-after (when short) before the next attempt; a long wait skips
 * straight to the fallback model, which has its own quota.
 */
export async function completeJson<T>(
  system: string,
  user: string,
  schema: ZodType<T>
): Promise<{ data: T; model: string }> {
  const client = getGroq();
  const attempts = [PRIMARY_MODEL(), PRIMARY_MODEL(), FALLBACK_MODEL()];
  const exhausted = new Set<string>();
  let lastError: unknown;

  for (const model of attempts) {
    if (exhausted.has(model)) continue;
    try {
      const res = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 1500,
        reasoning_effort: reasoningEffort(model),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return { data: parsed.data, model };
      lastError = new Error(`schema mismatch from ${model}: ${parsed.error.message.slice(0, 200)}`);
      console.warn(`[clinic-desk] ${describe(lastError)}`);
    } catch (err) {
      if (err instanceof Groq.APIError && (err.status === 401 || err.status === 403)) {
        throw new ConfigError("Groq rejected GROQ_API_KEY. Check the key in .env.local (console.groq.com/keys).");
      }
      lastError = err;
      console.warn(`[clinic-desk] ${model} attempt failed: ${describe(err)}`);
      // A model this key cannot use will not appear on retry.
      if (err instanceof Groq.APIError && err.status === 404) exhausted.add(model);
      const wait = rateLimitWaitMs(err);
      if (wait !== null) {
        if (wait <= MAX_RATE_LIMIT_WAIT_MS) await sleep(wait);
        else exhausted.add(model);
      }
    }
  }
  throw new LlmError(`The language model did not return a usable brief after several attempts (${describe(lastError)}). Try again in a moment.`);
}
