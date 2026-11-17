import { afterEach, describe, expect, it, vi } from "vitest";

// Keep route tests from overwriting the developer's ./reports.
vi.mock("../../evals/runner/execute", async (orig) => ({
  ...(await orig<typeof import("../../evals/runner/execute")>()),
  writeReport: vi.fn(async () => "reports/x.json"),
}));

const { POST } = await import("../../app/api/eval/route");
const { GET: health } = await import("../../app/api/health/route");
const { GET: readyz } = await import("../../app/api/readyz/route");
const execute = await import("../../evals/runner/execute");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://x/api/eval", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

const ENV = ["EVAL_MODE", "EVAL_API_ENABLED", "EVAL_API_TOKEN"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/eval: input validation", () => {
  it("runs a suite in mock mode and stamps processing time", async () => {
    const res = await post({ suite: "classify", runs: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ suite: "classify", mode: "mock" });
    expect(res.headers.get("X-Process-Time-Ms")).toMatch(/^\d+(\.\d)?$/);
  });

  it("rejects unknown suites and extra fields (400)", async () => {
    expect((await post({ suite: "nope" })).status).toBe(400);
    expect((await post({ suite: "../../etc/passwd" })).status).toBe(400);
    expect((await post({ suite: "rag", runs: 1, extra: 1 })).status).toBe(400);
    expect((await post({ suite: "rag", runs: 99 })).status).toBe(400);
  });

  it("rejects malformed JSON (400)", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid JSON/);
  });

  it("rejects non-JSON content types (415)", async () => {
    const res = await POST(new Request("http://x/api/eval", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }));
    expect(res.status).toBe(415);
    const none = await POST(new Request("http://x/api/eval", { method: "POST", body: new Uint8Array([123, 125]) }));
    expect(none.status).toBe(415);
  });

  it("rejects oversized payloads by header and by actual bytes (413)", async () => {
    expect((await post({ suite: "rag" }, { "content-length": "999999" })).status).toBe(413);
    expect((await post({ suite: "rag", pad: "x".repeat(5000) })).status).toBe(413);
  });

  it("hides internal error details (500)", async () => {
    vi.spyOn(execute, "executeSuite").mockRejectedValueOnce(new Error("secret path /srv/keys"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ suite: "rag", runs: 1 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("POST /api/eval: live mode", () => {
  it("is closed unless enabled with a token (403/401)", async () => {
    process.env.EVAL_MODE = "live";
    expect((await post({ suite: "classify", runs: 1 })).status).toBe(403);
    process.env.EVAL_API_ENABLED = "true";
    process.env.EVAL_API_TOKEN = "s3cret";
    expect((await post({ suite: "classify", runs: 1 })).status).toBe(401);
    expect((await post({ suite: "classify", runs: 1 }, { authorization: "Bearer wrong!" })).status).toBe(401);
  });

  it("runs one live suite at a time (409)", async () => {
    process.env.EVAL_MODE = "live";
    process.env.EVAL_API_ENABLED = "true";
    process.env.EVAL_API_TOKEN = "s3cret";
    let release!: () => void;
    const fake = { suite: "classify", mode: "live", summary: {} } as unknown as Awaited<ReturnType<typeof execute.executeSuite>>;
    vi.spyOn(execute, "executeSuite").mockImplementationOnce(() => new Promise((r) => (release = () => r(fake))));
    const auth = { "x-api-key": "s3cret" };
    const first = post({ suite: "classify", runs: 1 }, auth);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect((await post({ suite: "classify", runs: 1 }, auth)).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
});

describe("probes", () => {
  it("health is always ok", async () => expect(await (await health()).json()).toEqual({ status: "ok" }));

  it("readyz reports ready, or 503 when eval config cannot load", async () => {
    expect((await readyz()).status).toBe(200);
    const load = await import("../../evals/runner/load");
    vi.spyOn(load, "loadThresholds").mockRejectedValueOnce(new Error("missing"));
    expect((await readyz()).status).toBe(503);
  });
});
