import Groq from "groq-sdk";
import type { ZodType } from "zod";
import { ConfigError } from "./hindsight";

let groq: Groq | null = null;

function getGroq(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new ConfigError("GROQ_API_KEY is not set. Add it to .env.local (free key at console.groq.com).");
  }
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

export const PRIMARY_MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const FALLBACK_MODEL = () => process.env.GROQ_FALLBACK_MODEL || "qwen/qwen3-32b";

/** Pull the first JSON object out of a model reply (handles <think> blocks and code fences). */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model reply contained no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Ask for JSON and validate it. Open-weight models occasionally return malformed
 * JSON or drop a field, so: try the primary model twice, then the fallback model once.
 */
export async function completeJson<T>(
  system: string,
  user: string,
  schema: ZodType<T>
): Promise<{ data: T; model: string }> {
  const client = getGroq();
  const attempts = [PRIMARY_MODEL(), PRIMARY_MODEL(), FALLBACK_MODEL()];
  let lastError: unknown;

  for (const model of attempts) {
    try {
      const res = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return { data: parsed.data, model };
      lastError = new Error(`Schema mismatch from ${model}: ${parsed.error.message.slice(0, 300)}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM call failed");
}
