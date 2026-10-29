import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../app/api/eval/route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://x/api/eval", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["EVAL_MODE", "EVAL_API_ENABLED", "EVAL_API_TOKEN"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/eval", () => {
  it("rejects unknown suites", async () => {
    expect((await post({ suite: "nope" })).status).toBe(400);
  });

  it("is closed in live mode unless enabled with a token", async () => {
    process.env.EVAL_MODE = "live";
    expect((await post({ suite: "classify", runs: 1 })).status).toBe(403);
    process.env.EVAL_API_ENABLED = "true";
    process.env.EVAL_API_TOKEN = "s3cret";
    expect((await post({ suite: "classify", runs: 1 })).status).toBe(401);
    expect((await post({ suite: "classify", runs: 1 }, { authorization: "Bearer wrong!" })).status).toBe(401);
  });
});
