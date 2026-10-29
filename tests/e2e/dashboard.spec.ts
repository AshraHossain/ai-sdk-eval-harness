import { expect, test } from "@playwright/test";

const SUITES = ["summarize", "classify", "extract", "rag", "agent"];

test("dashboard lists all five suites with results and a passing gate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI SDK Eval Harness" })).toBeVisible();
  for (const s of SUITES) await expect(page.getByTestId(`suite-${s}`)).toBeVisible();
  await expect(page.getByTestId("gate-banner")).toContainText("PASSING");
  await expect(page.getByTestId("suite-agent").getByTestId("pass-rate")).toHaveText("100.0%");
});

test("flaky and failing cases are surfaced", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("suite-extract").getByRole("row", { name: /e04.*flaky/ })).toBeVisible();
  await expect(page.getByTestId("suite-classify").getByRole("row", { name: /c06.*fail/ })).toBeVisible();
  // 4/5 passes: the Wilson interval shows how little five runs prove.
  await expect(page.getByTestId("suite-extract").getByRole("row", { name: /e04/ })).toContainText("37.5%–96.4%");
});

test("running a suite from the UI refreshes its report", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("suite-classify");
  await card.getByRole("button", { name: "Run classify suite" }).click();
  await expect(card.getByRole("button", { name: "Run classify suite" })).toBeEnabled();
  await expect(card.getByTestId("pass-rate")).toHaveText("83.3%");
});

test("API rejects unknown suites", async ({ request }) => {
  const res = await request.post("/api/eval", { data: { suite: "nope" } });
  expect(res.status()).toBe(400);
});
