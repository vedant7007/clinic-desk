import { HindsightError } from "@vectorize-io/hindsight-client";
import { describe, expect, it } from "vitest";
import { BadRequest, jsonError, optionalString, readJson, requirePatient, requireString } from "@/lib/api";
import { ConfigError } from "@/lib/hindsight";

const req = (body: string) => new Request("http://test/api", { method: "POST", body });

describe("readJson", () => {
  it("returns an object body", async () => {
    await expect(readJson(req('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it.each([
    ["{bad", "Request body must be valid JSON"],
    ["", "Request body must be valid JSON"],
    ["[1,2]", "Request body must be a JSON object"],
    ["null", "Request body must be a JSON object"],
    ['"text"', "Request body must be a JSON object"],
  ])("rejects %j", async (body, message) => {
    await expect(readJson(req(body))).rejects.toThrow(new BadRequest(message));
  });
});

describe("requireString", () => {
  it("trims and returns", () => expect(requireString("  hi  ", "f")).toBe("hi"));
  it("names the problem", () => {
    expect(() => requireString(undefined, "complaint")).toThrow("complaint is required");
    expect(() => requireString(null, "complaint")).toThrow("complaint is required");
    expect(() => requireString(42, "complaint")).toThrow("complaint must be a string");
    expect(() => requireString("   ", "complaint")).toThrow("complaint cannot be empty");
    expect(() => requireString("x".repeat(11), "complaint", 10)).toThrow("complaint is too long (11 characters, max 10)");
  });
  it("throws BadRequest", () => expect(() => requireString("", "f")).toThrow(BadRequest));
});

describe("optionalString", () => {
  it("allows missing values", () => {
    expect(optionalString(undefined, "f")).toBe("");
    expect(optionalString(null, "f")).toBe("");
    expect(optionalString("", "f")).toBe("");
  });
  it("still validates present values", () => {
    expect(() => optionalString(5, "detail")).toThrow("detail must be a string");
    expect(() => optionalString("x".repeat(6), "detail", 5)).toThrow("too long");
  });
});

describe("requirePatient", () => {
  it("finds a known patient", () => expect(requirePatient("P001").name).toBe("Ravi Kumar Reddy"));
  it("rejects unknown and malformed ids", () => {
    expect(() => requirePatient("P999")).toThrow('Unknown patient "P999"');
    expect(() => requirePatient(undefined)).toThrow("patientId is required");
    expect(() => requirePatient("x".repeat(21))).toThrow("too long");
  });
});

describe("jsonError", () => {
  const statusOf = async (err: unknown) => {
    const res = jsonError(err);
    return { status: res.status, error: (await res.json()).error as string };
  };

  it("maps bad input to 400", async () => {
    expect(await statusOf(new BadRequest("nope"))).toEqual({ status: 400, error: "nope" });
  });

  it("maps setup problems to 503 with a message that names the fix", async () => {
    expect((await statusOf(new ConfigError("missing key"))).status).toBe(503);
    const rejected = await statusOf(new HindsightError("recall failed", 401));
    expect(rejected).toEqual({ status: 503, error: "Hindsight rejected HINDSIGHT_API_KEY. Check the key in .env.local." });
    const unseeded = await statusOf(new HindsightError("recall failed: \"Bank 'x' not found\"", 404));
    expect(unseeded.error).toMatch(/npm run seed/);
    const down = await statusOf(new TypeError("fetch failed"));
    expect(down.status).toBe(503);
    expect(down.error).toMatch(/Cannot reach Hindsight/);
  });

  it("maps anything else to 502", async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      expect((await statusOf(new Error("upstream broke"))).status).toBe(502);
    } finally {
      console.error = spy;
    }
  });
});
