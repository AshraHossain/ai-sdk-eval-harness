import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  containsAll,
  containsNone,
  exactMatch,
  fieldAccuracy,
  lengthBudget,
  numericClose,
  regexMatch,
  schemaValid,
  setMatch,
  toolCallsMatch,
} from '../../evals/scorers/deterministic';
import { llmJudge } from '../../evals/scorers/llm-judge';
import { getModel } from '../../src/lib/models';

describe('deterministic scorers', () => {
  it('exactMatch compares structurally', () => {
    expect(exactMatch('x', { a: 1 }, { a: 1 }).pass).toBe(true);
    const r = exactMatch('x', 'billing', 'account');
    expect(r).toMatchObject({ pass: false, score: 0, kind: 'deterministic' });
    expect(r.detail).toContain('account');
  });

  it('containsAll gives partial credit and names what is missing', () => {
    const r = containsAll('k', 'The Library costs $4.2 million', ['library', '$4.2 million', '2028']);
    expect(r.pass).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.detail).toBe('missing: 2028');
    expect(containsAll('k', 'anything', []).pass).toBe(true);
  });

  it('containsNone respects word boundaries', () => {
    expect(containsNone('n', 'We meet often', ['ten']).pass).toBe(true);
    expect(containsNone('n', 'The mayor said', ['mayor']).pass).toBe(false);
    expect(containsNone('n', 'v3.0 shipped', ['iOS 12']).pass).toBe(true);
  });

  it('lengthBudget penalizes proportionally', () => {
    expect(lengthBudget('l', 'one two three', 5).pass).toBe(true);
    const over = lengthBudget('l', 'a b c d e f g h i j', 5);
    expect(over.pass).toBe(false);
    expect(over.score).toBe(0.5);
    expect(lengthBudget('l', '', 5).pass).toBe(false);
  });

  it('regexMatch, numericClose and schemaValid', () => {
    expect(regexMatch('r', '2026-10-02', /^\d{4}-\d{2}-\d{2}$/).pass).toBe(true);
    expect(numericClose('n', 155.4, 155.40001).pass).toBe(true);
    expect(numericClose('n', 155, 156).pass).toBe(false);
    const schema = z.object({ a: z.number() });
    expect(schemaValid('s', { a: 1 }, schema).pass).toBe(true);
    const bad = schemaValid('s', { a: 'x' }, schema);
    expect(bad.pass).toBe(false);
    expect(bad.detail).toContain('a:');
  });

  it('fieldAccuracy uses tolerance for numbers and case-insensitive strings', () => {
    const r = fieldAccuracy('f', { vendor: 'ACME', total: 100.004, date: '2026-01-01' }, { vendor: 'acme', total: 100, date: '2026-01-02' });
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain('date');
  });

  it('toolCallsMatch checks order, names, argument subsets and extras', () => {
    const calls = [{ toolName: 'getWeather', input: { city: 'denver', units: 'F' } }];
    expect(toolCallsMatch('t', calls, [{ toolName: 'getWeather', inputIncludes: { city: 'Denver' } }]).pass).toBe(true);
    expect(toolCallsMatch('t', calls, [{ toolName: 'lookupOrder' }]).pass).toBe(false);
    expect(toolCallsMatch('t', calls, []).pass).toBe(false);
    expect(toolCallsMatch('t', [], []).pass).toBe(true);
    const extra = toolCallsMatch('t', [...calls, ...calls], [{ toolName: 'getWeather' }]);
    expect(extra.pass).toBe(false);
    expect(extra.detail).toContain('extra');
  });

  it('setMatch is order-insensitive and penalizes extras', () => {
    expect(setMatch('c', ['b', 'a'], ['a', 'b']).pass).toBe(true);
    expect(setMatch('c', [], []).pass).toBe(true);
    const r = setMatch('c', ['a', 'z'], ['a']);
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0.5);
  });
});

describe('llmJudge scorer', () => {
  it('normalizes a 1-5 verdict to 0..1 and applies passAt', async () => {
    const r = await llmJudge('faith', getModel('judge'), {
      criteria: 'faithfulness',
      input: 'Video files can be up to 2 GB per upload.',
      output: 'Video files can be up to 2 GB per upload.',
      reference: 'Video files can be up to 2 GB per upload.',
    });
    expect(r).toMatchObject({ kind: 'judge', score: 1, pass: true });
  });

  it('turns a judge failure into a failing score instead of crashing the run', async () => {
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('provider 529 overloaded');
      },
    });
    const r = await llmJudge('faith', broken, { criteria: 'c', input: 'i', output: 'o' });
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0);
    expect(r.detail).toContain('judge error');
  });
});
