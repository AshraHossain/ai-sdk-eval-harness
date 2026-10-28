import { expect, test } from '@playwright/test';

test.describe('eval dashboard', () => {
  test('shows suites and mock mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'AI SDK Eval Harness' })).toBeVisible();
    await expect(page.getByTestId('mode')).toHaveText('mock mode');
    for (const s of ['summarize', 'classify', 'extract', 'rag-qa', 'agent']) {
      await expect(page.getByTestId(`suite-${s}`)).toBeChecked();
    }
  });

  test('runs a suite N times and surfaces the flaky case', async ({ page }) => {
    await page.goto('/');
    for (const s of ['summarize', 'extract', 'rag-qa', 'agent']) await page.getByTestId(`suite-${s}`).uncheck();
    await page.getByTestId('runs').fill('5');
    await page.getByTestId('run').click();

    const row = page.getByTestId('row-classify');
    await expect(row).toBeVisible();
    await expect(row).toContainText('cls-010');
    await expect(page.getByTestId('gate')).toHaveText('Gate passed');

    await page.getByTestId('cases-classify').locator('summary').click();
    await expect(page.getByTestId('status-cls-010')).toContainText('flaky');
    await expect(page.getByTestId('status-cls-010')).toContainText('quarantined');
    await expect(page.getByTestId('status-cls-001')).toHaveText('stable-pass');

    // Drill into per-run detail for the flaky case.
    await page.getByTestId('case-cls-010').click();
    await expect(page.getByText(/expected "billing", got "account"/)).toBeVisible();
  });

  test('disables Run when no suite is selected', async ({ page }) => {
    await page.goto('/');
    for (const s of ['summarize', 'classify', 'extract', 'rag-qa', 'agent']) await page.getByTestId(`suite-${s}`).uncheck();
    await expect(page.getByTestId('run')).toBeDisabled();
  });
});

test.describe('/api/eval', () => {
  test('GET lists suites with case counts', async ({ request }) => {
    const res = await request.get('/api/eval');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.mode).toBe('mock');
    expect(body.suites.map((s: { name: string }) => s.name)).toEqual(['summarize', 'classify', 'extract', 'rag-qa', 'agent']);
    expect(body.suites.every((s: { cases: number }) => s.cases > 0)).toBe(true);
  });

  test('POST returns a gated report', async ({ request }) => {
    const res = await request.post('/api/eval', { data: { suites: ['agent'], runs: 2 } });
    expect(res.ok()).toBe(true);
    const report = await res.json();
    expect(report.meta.runsPerCase).toBe(2);
    expect(report.suites[0].name).toBe('agent');
    expect(report.gate.passed).toBe(true);
  });

  test('POST validates input', async ({ request }) => {
    expect((await request.post('/api/eval', { data: { runs: 50 } })).status()).toBe(400);
    expect((await request.post('/api/eval', { data: { suites: ['nope'] } })).status()).toBe(400);
    expect((await request.post('/api/eval', { data: { suites: [] } })).status()).toBe(400);
  });
});
