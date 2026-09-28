import Groq from "groq-sdk";
import { describe, expect, it } from "vitest";
import { extractJson, rateLimitWaitMs } from "@/lib/llm";

describe("extractJson", () => {
  it("parses a plain object", () => {
    expect(extractJson('{"headline":"x"}')).toEqual({ headline: "x" });
  });

  it("ignores <think> blocks, including braces inside them", () => {
    const raw = '<think>maybe {"headline":"wrong"} ... let me think</think>\n{"headline":"right"}';
    expect(extractJson(raw)).toEqual({ headline: "right" });
  });

  it("strips code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("takes the object out of surrounding prose", () => {
    expect(extractJson('Here is the brief: {"a":{"b":[1,2]}} Hope it helps.')).toEqual({ a: { b: [1, 2] } });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(/no JSON object/);
    expect(() => extractJson("")).toThrow(/no JSON object/);
    expect(() => extractJson("<think>{}</think>")).toThrow(/no JSON object/);
  });

  it("throws on malformed JSON", () => {
    expect(() => extractJson('{"a": }')).toThrow();
  });
});

describe("rateLimitWaitMs", () => {
  const apiError = (status: number, headers: Record<string, string> = {}) =>
    Groq.APIError.generate(status, { error: { message: "limit" } }, "limit", new Headers(headers));

  it("reads retry-after seconds on a 429", () => {
    expect(rateLimitWaitMs(apiError(429, { "retry-after": "3" }))).toBe(3000);
    expect(rateLimitWaitMs(apiError(429, { "retry-after": "0.5" }))).toBe(500);
  });

  it("uses a short default when the header is missing or unparseable", () => {
    expect(rateLimitWaitMs(apiError(429))).toBe(1500);
    expect(rateLimitWaitMs(apiError(429, { "retry-after": "soon" }))).toBe(1500);
  });

  it("is null for anything that is not a rate limit", () => {
    expect(rateLimitWaitMs(apiError(500))).toBeNull();
    expect(rateLimitWaitMs(new Error("boom"))).toBeNull();
  });
});
