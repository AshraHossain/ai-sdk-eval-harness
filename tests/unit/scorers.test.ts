import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  contains, countWords, exactMatch, lengthBudget, matchesRegex, notContains, numericTolerance, schemaValid, toolCallMatch,
} from "../../evals/scorers/deterministic";

describe("exactMatch", () => {
  it("ignores case and whitespace by default", () => expect(exactMatch("x", "  Billing ", "billing").pass).toBe(true));
  it("can be case sensitive", () => expect(exactMatch("x", "Billing", "billing", { caseSensitive: true }).pass).toBe(false));
  it("reports expected vs actual", () => expect(exactMatch("x", "a", "b").detail).toContain('expected "b"'));
});

describe("contains / notContains", () => {
  it("requires all needles by default and gives partial score", () => {
    const r = contains("x", "The cat sat", ["cat", "dog"]);
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0.5);
    expect(r.detail).toContain("dog");
  });
  it("supports any-mode", () => expect(contains("x", "The cat", ["cat", "dog"], { mode: "any" }).pass).toBe(true));
  it("passes on empty needle list", () => expect(contains("x", "", []).pass).toBe(true));
  it("flags forbidden text", () => expect(notContains("x", "I am sure", ["sure"]).pass).toBe(false));
});

describe("matchesRegex", () => {
  it("matches", () => expect(matchesRegex("x", "order A-100", /A-\d+/).pass).toBe(true));
  it("fails", () => expect(matchesRegex("x", "nope", /A-\d+/).pass).toBe(false));
});

describe("schemaValid", () => {
  const schema = z.object({ n: z.number() });
  it("accepts valid values", () => expect(schemaValid("x", { n: 1 }, schema).pass).toBe(true));
  it("lists issues for invalid values", () => {
    const r = schemaValid("x", { n: "1" }, schema);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("n:");
  });
});

describe("numericTolerance", () => {
  it("passes within absolute tolerance", () => expect(numericTolerance("x", 10.004, 10, { abs: 0.01 }).pass).toBe(true));
  it("passes within relative tolerance", () => expect(numericTolerance("x", 104, 100, { rel: 0.05 }).pass).toBe(true));
  it("fails outside tolerance", () => expect(numericTolerance("x", 110, 100, { rel: 0.05 }).pass).toBe(false));
  it("is exact with no tolerance", () => expect(numericTolerance("x", 1.0001, 1).pass).toBe(false));
  it("rejects NaN", () => expect(numericTolerance("x", NaN, 1, { abs: 5 }).pass).toBe(false));
});

describe("toolCallMatch", () => {
  const a = { name: "getWeather", args: { city: "Paris", units: "c" } };
  const b = { name: "lookupOrder", args: { orderId: "A-1" } };
  it("subset-matches args, case-insensitive for strings", () =>
    expect(toolCallMatch("x", [a], [{ name: "getWeather", args: { city: "paris" } }]).pass).toBe(true));
  it("fails on wrong args", () => expect(toolCallMatch("x", [a], [{ name: "getWeather", args: { city: "Oslo" } }]).pass).toBe(false));
  it("allows extra calls unless exact", () => {
    expect(toolCallMatch("x", [a, b], [a]).pass).toBe(true);
    expect(toolCallMatch("x", [a, b], [a], { exact: true }).pass).toBe(false);
  });
  it("enforces order when asked", () => {
    expect(toolCallMatch("x", [b, a], [a, b]).pass).toBe(true);
    expect(toolCallMatch("x", [b, a], [a, b], { ordered: true }).pass).toBe(false);
  });
  it("exact with no expected calls fails if any call was made", () => expect(toolCallMatch("x", [a], [], { exact: true }).pass).toBe(false));
});

describe("lengthBudget", () => {
  it("counts words", () => expect(countWords("  a b   c ")).toBe(3));
  it("enforces max words", () => expect(lengthBudget("x", "a b c d", { maxWords: 3 }).pass).toBe(false));
  it("enforces min words", () => expect(lengthBudget("x", "a", { minWords: 2 }).pass).toBe(false));
  it("enforces max chars", () => expect(lengthBudget("x", "abcdef", { maxChars: 5 }).pass).toBe(false));
  it("passes in budget", () => expect(lengthBudget("x", "a b", { maxWords: 3, minWords: 1, maxChars: 10 }).pass).toBe(true));
});
