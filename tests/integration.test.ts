/**
 * Full brief / visit / outcome / ask / chart flow against a local mock of the
 * Hindsight and Groq HTTP APIs. Asserts the exact request bodies the app sends:
 * patient tag scoping with any_strict, document ids, timestamps, anonymisation.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

type Call = { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> };
type Reply = { status: number; body: unknown; headers?: Record<string, string> };

const calls: Call[] = [];
let groqReplies: Reply[] = [];
let hindsightStatus = 200;
/** Banks whose writes the mock rejects, so partial-failure handling can be tested. */
let failWritesTo = new Set<string>();

const PATIENT_BANK = "test-patients";
const CLINIC_BANK = "test-clinic";

const recallResult = (id: string, text: string, tags: string[], score: number, date = "2026-07-15T10:00:00Z") => ({
  id,
  text,
  type: "world",
  tags,
  occurred_start: date,
  mentioned_at: date,
  scores: { final: score },
});

const briefJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    headline: "Dry cough on lisinopril, penicillin allergy",
    problem: "persistent dry cough on lisinopril",
    flags: [
      { severity: "critical", title: "Penicillin allergy", detail: "Avoid amoxicillin", refs: ["P1"] },
      { severity: "warning", title: "Invented", detail: "Cites a memory that was never recalled", refs: ["P9"] },
      { severity: "warning", title: "ACE inhibitor cough", detail: "Cough began after lisinopril", refs: ["P2", "C7"] },
    ],
    history: "Started lisinopril 2026-05-20; cough since June.",
    whatWorked: [{ finding: "Switch to an ARB resolved cough", refs: ["C1"] }],
    askThePatient: ["When did the cough start?"],
    considerations: ["Review the ACE inhibitor"],
    ...over,
  });

const chat = (content: string, model = "openai/gpt-oss-120b"): Reply => ({
  status: 200,
  body: { id: "x", object: "chat.completion", created: 0, model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] },
});

function hindsight(call: Call): Reply {
  if (hindsightStatus !== 200) return { status: hindsightStatus, body: { detail: "Invalid API key" } };
  const [, , , , bank, ...rest] = call.path.split("/"); // /v1/default/banks/{bank}/...
  const tail = rest.join("/");
  if (call.method === "PUT" && tail === "") return { status: 200, body: { bank_id: bank, name: bank } };
  if (call.method === "POST" && tail === "memories") {
    if (failWritesTo.has(bank)) return { status: 500, body: { detail: `bank ${bank} is unavailable` } };
    return { status: 200, body: { success: true, bank_id: bank, items_count: (call.body.items as unknown[]).length, async: false } };
  }
  if (call.method === "POST" && tail === "memories/recall") {
    if (bank === PATIENT_BANK) {
      return {
        status: 200,
        body: {
          results: [
            recallResult("m1", "Ravi has a penicillin allergy.", ["patient:P001"], 0.9, "2019-03-11T10:00:00Z"),
            recallResult("m2", "Ravi started lisinopril on 2026-05-20.", ["patient:P001"], 0.4, "2026-05-20T10:00:00Z"),
          ],
        },
      };
    }
    return {
      status: 200,
      body: {
        results: [
          recallResult("c1", "60s male on lisinopril, cough resolved after switching to losartan.", ["outcome"], 0.8),
          recallResult("c2", "40s female with recurrent UTI.", ["outcome"], 0.01),
        ],
      },
    };
  }
  if (call.method === "POST" && tail === "reflect") {
    return { status: 200, body: { text: "Azithromycin did not help.", based_on: { memories: [{ id: "m9", text: "Azithromycin gave no relief." }] } } };
  }
  if (call.method === "GET" && tail === "memories/list") {
    return {
      status: 200,
      body: {
        total: 3,
        limit: 500,
        offset: 0,
        items: [
          { id: "l2", text: "Started lisinopril.", fact_type: "world", tags: ["patient:P001"], occurred_start: "2026-05-20T00:00:00Z", mentioned_at: "2026-05-20T10:00:00Z" },
          { id: "l1", text: "Penicillin allergy.", fact_type: "world", tags: ["patient:P001"], occurred_start: "2019-03-11T00:00:00Z", mentioned_at: "2019-03-11T10:00:00Z" },
          { id: "lx", text: "Someone else's fact.", fact_type: "world", tags: ["patient:P004"], occurred_start: "2026-01-01T00:00:00Z" },
          { id: "lo", text: "An observation.", fact_type: "observation", tags: ["patient:P001"] },
        ],
      },
    };
  }
  if (call.method === "GET" && tail === "stats") {
    return {
      status: 200,
      body: { bank_id: bank, total_nodes: bank === PATIENT_BANK ? 133 : 96, total_links: 0, total_documents: 1, nodes_by_fact_type: bank === PATIENT_BANK ? { world: 85, observation: 48 } : { world: 65, observation: 31 }, links_by_link_type: {}, links_by_fact_type: {}, links_breakdown: {}, pending_operations: 0, failed_operations: 0 },
    };
  }
  return { status: 404, body: { detail: `mock has no route for ${call.method} ${call.path}` } };
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

let server: Server;
let api: {
  brief: typeof import("@/app/api/brief/route").POST;
  visit: typeof import("@/app/api/visit/route").POST;
  outcome: typeof import("@/app/api/outcome/route").POST;
  ask: typeof import("@/app/api/ask/route").POST;
  chart: typeof import("@/app/api/chart/route").GET;
  stats: typeof import("@/app/api/stats/route").GET;
  health: typeof import("@/app/api/health/route").GET;
  ensureBanks: typeof import("@/lib/hindsight").ensureBanks;
};

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const call: Call = { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: await readBody(req) };
    calls.push(call);
    const reply = url.pathname.startsWith("/openai/") ? groqReplies.shift() ?? { status: 500, body: { error: { message: "no reply queued" } } } : hindsight(call);
    res.writeHead(reply.status, { "Content-Type": "application/json", ...reply.headers });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  process.env.HINDSIGHT_BASE_URL = base;
  process.env.HINDSIGHT_API_KEY = "hs-test-key";
  process.env.GROQ_BASE_URL = base;
  process.env.GROQ_API_KEY = "gsk-test-key";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";
  process.env.GROQ_FALLBACK_MODEL = "qwen/qwen3.8-27b";
  process.env.PATIENT_BANK_ID = PATIENT_BANK;
  process.env.CLINIC_BANK_ID = CLINIC_BANK;

  // Import after the environment points at the mock: bank ids are read at module load.
  api = {
    brief: (await import("@/app/api/brief/route")).POST,
    visit: (await import("@/app/api/visit/route")).POST,
    outcome: (await import("@/app/api/outcome/route")).POST,
    ask: (await import("@/app/api/ask/route")).POST,
    chart: (await import("@/app/api/chart/route")).GET,
    stats: (await import("@/app/api/stats/route")).GET,
    health: (await import("@/app/api/health/route")).GET,
    ensureBanks: (await import("@/lib/hindsight")).ensureBanks,
  };
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  calls.length = 0;
  groqReplies = [];
  hindsightStatus = 200;
  failWritesTo = new Set();
});

const post = (body: unknown) => new Request("http://app/api", { method: "POST", body: JSON.stringify(body) });
const hsCalls = (suffix: string, bank?: string) =>
  calls.filter((c) => c.path.endsWith(suffix) && c.path.startsWith("/v1/") && (!bank || c.path.includes(`/banks/${bank}/`)));
const groqCalls = () => calls.filter((c) => c.path === "/openai/v1/chat/completions");
const today = () => new Date().toISOString().slice(0, 10);

describe("ensureBanks", () => {
  it("creates both banks with their missions", async () => {
    await api.ensureBanks();
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.path)).toEqual([`/v1/default/banks/${PATIENT_BANK}`, `/v1/default/banks/${CLINIC_BANK}`]);
    for (const p of puts) {
      expect(p.body.retain_mission).toEqual(expect.any(String));
      expect(p.body.reflect_mission).toEqual(expect.any(String));
    }
  });
});

describe("brief", () => {
  it("recalls both banks with the right scoping and returns a grounded brief", async () => {
    groqReplies = [chat(briefJson()), chat(briefJson({ headline: "Generic cough", flags: [], whatWorked: [] }))];
    const res = await api.brief(post({ patientId: "P001", complaint: "Dry cough for 3 months", compare: true }));
    expect(res.status).toBe(200);
    const r = await res.json();

    const patientRecalls = hsCalls("/memories/recall", PATIENT_BANK);
    expect(patientRecalls).toHaveLength(2);
    for (const c of patientRecalls) {
      expect(c.body.tags).toEqual(["patient:P001"]);
      expect(c.body.tags_match).toBe("any_strict");
      expect(c.body.query).toMatch(/^Ravi Kumar Reddy:/);
    }
    const [clinicRecall] = hsCalls("/memories/recall", CLINIC_BANK);
    expect(clinicRecall.body.tags).toBeUndefined();
    expect(clinicRecall.body.types).toEqual(["observation", "world"]);
    expect(clinicRecall.body.prefer_observations).toBe(true);
    expect(clinicRecall.body.query).not.toMatch(/Ravi|Reddy|P001/);

    // chart sorted by date, clinic filtered by relative score (c2 dropped)
    expect(r.memories.map((m: { ref: string; id: string }) => `${m.ref}:${m.id}`)).toEqual(["P1:m1", "P2:m2", "C1:c1"]);
    // invented refs dropped, uncited warning removed
    expect(r.withMemory.flags.map((f: { title: string; refs: string[] }) => [f.title, f.refs])).toEqual([
      ["Penicillin allergy", ["P1"]],
      ["ACE inhibitor cough", ["P2"]],
    ]);
    expect(r.withMemory.whatWorked).toEqual([{ finding: "Switch to an ARB resolved cough", refs: ["C1"] }]);
    expect(r.withoutMemory.headline).toBe("Generic cough");
    expect(r.model).toBe("openai/gpt-oss-120b");
    expect(r.fallbackUsed).toBe(false);
    expect(r.compareFailed).toBe(false);

    const [first] = groqCalls();
    expect(first.body.response_format).toEqual({ type: "json_object" });
    expect(first.body.model).toBe("openai/gpt-oss-120b");
    const userMsg = (first.body.messages as { content: string }[])[1].content;
    expect(userMsg).toContain("[P1] (2019-03-11) Ravi has a penicillin allergy.");
    expect(userMsg).toContain("[C1]");
  });

  it("waits out a 429 and retries", async () => {
    groqReplies = [{ status: 429, headers: { "retry-after": "0" }, body: { error: { message: "rate limited" } } }, chat(briefJson())];
    const res = await api.brief(post({ patientId: "P001", complaint: "cough", compare: false }));
    expect(res.status).toBe(200);
    expect(groqCalls()).toHaveLength(2);
    expect(groqCalls().map((c) => c.body.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
  });

  it("uses the fallback model after the primary keeps failing", async () => {
    groqReplies = [chat("not json"), chat('{"headline": ""}'), chat(briefJson(), "qwen/qwen3.8-27b")];
    const res = await api.brief(post({ patientId: "P001", complaint: "cough", compare: false }));
    const r = await res.json();
    expect(res.status).toBe(200);
    expect(groqCalls().map((c) => c.body.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
    expect(r.model).toBe("qwen/qwen3.8-27b");
    expect(r.fallbackUsed).toBe(true);
  });

  it("returns a clear 502 and no brief when every model attempt fails", async () => {
    groqReplies = [0, 1, 2].map(() => ({ status: 500, body: { error: { message: "internal error" } } }));
    const res = await api.brief(post({ patientId: "P001", complaint: "cough", compare: false }));
    const r = await res.json();
    expect(res.status).toBe(502);
    expect(r.error).toMatch(/did not return a usable brief/);
    expect(r.withMemory).toBeUndefined();
  });

  it("still returns the memory brief when only the comparison fails", async () => {
    // memory brief succeeds, comparison gets three failures
    groqReplies = [chat(briefJson()), ...[0, 1, 2].map(() => ({ status: 500, body: { error: { message: "busy" } } }))];
    const res = await api.brief(post({ patientId: "P001", complaint: "cough", compare: true }));
    const r = await res.json();
    expect(res.status).toBe(200);
    expect(r.withoutMemory).toBeNull();
    expect(r.compareFailed).toBe(true);
  });

  it("maps a rejected Hindsight key to 503 with a clear message", async () => {
    hindsightStatus = 401;
    const res = await api.brief(post({ patientId: "P001", complaint: "cough" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Hindsight rejected HINDSIGHT_API_KEY/);
  });

  it("rejects bad input before calling any service", async () => {
    expect((await api.brief(post({ patientId: "P999", complaint: "x" }))).status).toBe(400);
    expect((await api.brief(post({ patientId: "P001", complaint: "" }))).status).toBe(400);
    expect((await api.brief(new Request("http://app/api", { method: "POST", body: "{oops" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("visit", () => {
  it("retains to the patient bank with tags, timestamp and a stable document id", async () => {
    const body = { patientId: "P001", complaint: "Dry cough", notes: "Chest clear", plan: "Switch lisinopril to losartan" };
    expect((await api.visit(post(body))).status).toBe(200);
    expect((await api.visit(post(body))).status).toBe(200); // double submit

    const retains = hsCalls("/memories", PATIENT_BANK);
    expect(retains).toHaveLength(2);
    const [a, b] = retains.map((c) => (c.body.items as Record<string, unknown>[])[0]);
    expect(a.tags).toEqual(["patient:P001", "visit"]);
    expect(a.document_id).toMatch(new RegExp(`^P001-visit-${today()}-[0-9a-f]{16}$`));
    expect(b.document_id).toBe(a.document_id); // same content replaces, never duplicates
    expect(Date.parse(a.timestamp as string)).toBeGreaterThan(Date.now() - 60_000);
    expect(a.content).toContain("Plan: Switch lisinopril to losartan.");
    expect(a.metadata).toEqual({ patient_id: "P001", kind: "visit" });
    expect(hsCalls("/memories", CLINIC_BANK)).toHaveLength(0);
  });

  it("returns a receipt with the text written to the chart", async () => {
    const res = await api.visit(post({ patientId: "P001", complaint: "Dry cough", notes: "", plan: "Switch to losartan" }));
    const r = await res.json();
    expect(r.patient).toMatchObject({ bank: "patient", ok: true, items: 1, error: null });
    expect(r.patient.text).toBe((hsCalls("/memories", PATIENT_BANK)[0].body.items as Record<string, unknown>[])[0].content);
  });

  it("never claims the chart was updated when Hindsight refused the write", async () => {
    failWritesTo = new Set([PATIENT_BANK]);
    const res = await api.visit(post({ patientId: "P001", complaint: "Dry cough", notes: "", plan: "Switch to losartan" }));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBeUndefined();
  });
});

describe("outcome", () => {
  it("writes the chart and an anonymised clinic case", async () => {
    const res = await api.outcome(
      post({
        patientId: "P001",
        problem: "Mr. Reddy's dry cough on lisinopril",
        treatment: "switched to losartan",
        outcome: "resolved",
        detail: "RAVI says cough gone in 2 weeks, call 98480 12345",
      })
    );
    expect(res.status).toBe(200);
    const { sharedText } = await res.json();

    const [personal] = hsCalls("/memories", PATIENT_BANK).map((c) => (c.body.items as Record<string, unknown>[])[0]);
    expect(personal.tags).toEqual(["patient:P001", "outcome"]);
    expect(personal.document_id).toMatch(new RegExp(`^P001-outcome-${today()}-[0-9a-f]{16}$`));

    const [shared] = hsCalls("/memories", CLINIC_BANK).map((c) => (c.body.items as Record<string, unknown>[])[0]);
    expect(shared.tags).toEqual(["outcome", "outcome:resolved"]);
    expect(shared.document_id).toMatch(new RegExp(`^case-${today()}-[0-9a-f]{16}$`));
    expect(shared.metadata).toEqual({ kind: "case_outcome", outcome: "resolved" });
    expect(shared.content).toBe(sharedText);
    expect(shared.content).toMatch(/^Case outcome \(\d{4}-\d{2}-\d{2}\): 50s male with/);
    expect(JSON.stringify(shared)).not.toMatch(/ravi|kumar|reddy|P001|98480/i);
  });

  it("returns a receipt per bank carrying the exact text written", async () => {
    const res = await api.outcome(post({ patientId: "P001", problem: "dry cough", treatment: "switched to losartan", outcome: "resolved", detail: "" }));
    const r = await res.json();
    expect(r.ok).toBe(true);
    expect(r.patient).toMatchObject({ bank: "patient", ok: true, items: 1, error: null });
    expect(r.clinic).toMatchObject({ bank: "clinic", ok: true, items: 1, error: null });
    // The receipt text is what actually reached each bank, so the UI can show it verbatim.
    const sent = (name: string) => (hsCalls("/memories", name)[0].body.items as Record<string, unknown>[])[0].content;
    expect(r.patient.text).toBe(sent(PATIENT_BANK));
    expect(r.clinic.text).toBe(sent(CLINIC_BANK));
    expect(r.clinic.text).toBe(r.sharedText);
  });

  it("reports a partial write honestly when only the clinic bank fails", async () => {
    failWritesTo = new Set([CLINIC_BANK]);
    const res = await api.outcome(post({ patientId: "P001", problem: "dry cough", treatment: "losartan", outcome: "resolved", detail: "" }));
    expect(res.status).toBe(200); // the chart write really did succeed
    const r = await res.json();
    expect(r.ok).toBe(false);
    expect(r.patient.ok).toBe(true);
    expect(r.clinic.ok).toBe(false);
    expect(r.clinic.error).toEqual(expect.any(String));
    expect(r.clinic.items).toBeNull();
  });

  it("fails with 502 when neither bank accepted the write", async () => {
    failWritesTo = new Set([PATIENT_BANK, CLINIC_BANK]);
    const res = await api.outcome(post({ patientId: "P001", problem: "dry cough", treatment: "losartan", outcome: "resolved", detail: "" }));
    expect(res.status).toBe(502);
    const r = await res.json();
    expect(r.error).toEqual(expect.any(String));
    expect(r.patient).toBeUndefined();
  });
});

describe("ask", () => {
  it("scopes chart questions to the patient and clinic questions to the clinic bank", async () => {
    await api.ask(post({ patientId: "P001", question: "What failed?", scope: "patient" }));
    await api.ask(post({ question: "What works for ACE cough?", scope: "clinic" }));
    const [chart] = hsCalls("/reflect", PATIENT_BANK);
    expect(chart.body.tags).toEqual(["patient:P001"]);
    expect(chart.body.tags_match).toBe("any_strict");
    expect(chart.body.include).toEqual(expect.objectContaining({ facts: expect.anything() }));
    const [clinic] = hsCalls("/reflect", CLINIC_BANK);
    expect(clinic.body.tags).toBeUndefined();
  });
});

describe("chart and stats", () => {
  it("lists only this patient's facts, oldest first", async () => {
    const res = await api.chart(new Request("http://app/api/chart?patientId=P001"));
    const r = await res.json();
    const [list] = hsCalls("/memories/list", PATIENT_BANK);
    expect(list.method).toBe("GET");
    expect(list.query.getAll("tags")).toEqual(["patient:P001"]);
    expect(list.query.get("tags_match")).toBe("any_strict");
    expect(r.entries.map((e: { id: string }) => e.id)).toEqual(["l1", "l2"]); // foreign l4 and observation excluded
    expect(r.observations).toBe(1);
  });

  it("reports facts per bank, with derived observations counted separately", async () => {
    const r = await (await api.stats()).json();
    expect(r).toEqual({
      patient: { facts: 85, observations: 48, nodes: 133 },
      clinic: { facts: 65, observations: 31, nodes: 96 },
    });
  });
});

describe("health", () => {
  it("verifies the connection by calling Hindsight, and never returns the key", async () => {
    const res = await api.health();
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.hindsight.state).toBe("ok");
    expect(r.hindsight.banks.patient).toMatchObject({ state: "ok", memories: 133 });
    expect(r.hindsight.banks.clinic).toMatchObject({ state: "ok", memories: 96 });
    expect(r.groq).toMatchObject({ apiKeySet: true, model: "openai/gpt-oss-120b" });
    // The probe is a real call, not an env-var read.
    expect(hsCalls("/stats")).toHaveLength(2);
    expect(JSON.stringify(r)).not.toMatch(/hs-test-key|gsk-test-key/);
  });

  it("reports a rejected key as rejected rather than unreachable", async () => {
    hindsightStatus = 401;
    const r = await (await api.health()).json();
    expect(r.hindsight.state).toBe("rejected");
    expect(r.hindsight.banks.patient.state).toBe("rejected");
    expect(r.hindsight.banks.patient.memories).toBeNull();
    expect(r.hindsight.error).toMatch(/HINDSIGHT_API_KEY/);
  });
});
