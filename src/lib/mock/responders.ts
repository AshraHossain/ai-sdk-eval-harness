/**
 * Deterministic "model behaviour" for EVAL_MODE=mock.
 *
 * These responders are intentionally simple, rule-based imitations of what a
 * real model would return. They let the whole pipeline (features → scorers →
 * N-run stats → CI gate) run offline with zero API keys. One classify case is
 * deliberately unstable so the flaky detector has something real to catch.
 */
import { WEATHER } from '../features/agent';
import type { MockContent, MockRequest, MockResponder } from './mock-model';

const text = (t: string): MockContent[] => [{ type: 'text', text: t }];
const json = (v: unknown): MockContent[] => text(JSON.stringify(v));

const STOPWORDS = new Set(
  'the a an and or of to in on for with is are was were be been it its this that at by from as not no but if then than so do does did has have had will would can could should may might you your we our they their he she his her i me my'.split(
    ' ',
  ),
);

export function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9][a-z0-9.\-']*/g) ?? [])
    .map((w) => w.replace(/[.']+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Sentence split that does not break on decimals like "$4.2" or "v3.0". */
export function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+(?=[A-Z0-9$€£])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function section(source: string, name: string, next: string): string {
  const start = source.indexOf(`${name}:`);
  if (start === -1) return '';
  const from = start + name.length + 1;
  const end = source.indexOf(`${next}`, from);
  return source.slice(from, end === -1 ? undefined : end).trim();
}

// ---------- summarize: lead-sentence extractive summary within budget ----------
function summarizeResponder(req: MockRequest): MockContent[] {
  const maxWords = Number(req.userText.match(/at most (\d+) words/)?.[1] ?? 40);
  const body = req.userText.split('TEXT:\n')[1] ?? req.userText;
  const sentences = splitSentences(body);
  const out: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const n = s.trim().split(/\s+/).length;
    if (words + n > maxWords && out.length > 0) break;
    out.push(s.trim());
    words += n;
  }
  return text(out.join(' '));
}

// ---------- classify: keyword routing, plus one deliberately flaky case ----------
const flakyCounters = new Map<string, number>();
const RULES: Array<[RegExp, string]> = [
  [/\b(refund|charged|charge|invoice|billing|payment|card|subscription fee)\b/i, 'billing'],
  [/\b(package|delivery|deliver|tracking|shipped|courier|arrived)\b/i, 'shipping'],
  [/\b(password|log ?in|sign ?in|2fa|account|email address|profile)\b/i, 'account'],
  [/\b(error|crash(?:es|ed)?|bug|slow|500|timeout|broken|freezes)\b/i, 'technical'],
];

function classifyResponder(req: MockRequest): MockContent[] {
  const ticket = req.userText.replace(/^TICKET:\n/, '');
  // Ambiguous ticket: alternates between two plausible labels across calls,
  // the way a real model at temperature > 0 (or a vague prompt) can.
  if (/charged twice.*can'?t log in/i.test(ticket)) {
    const n = flakyCounters.get(ticket) ?? 0;
    flakyCounters.set(ticket, n + 1);
    return json({ label: n % 3 === 2 ? 'account' : 'billing', confidence: 0.55 });
  }
  for (const [re, label] of RULES) if (re.test(ticket)) return json({ label, confidence: 0.9 });
  return json({ label: 'other', confidence: 0.6 });
}

/** Lets tests reset the flaky case between runs. */
export function resetMockState(): void {
  flakyCounters.clear();
}

// ---------- extract: regex parser over the fixture invoice format ----------
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeDate(raw: string): string {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const us = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const named = raw.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) return `${named[3]}-${MONTHS[named[1].toLowerCase()] ?? '01'}-${named[2].padStart(2, '0')}`;
  return raw.trim();
}

const num = (s: string) => Number(s.replace(/[^0-9.\-]/g, ''));

function extractResponder(req: MockRequest): MockContent[] {
  const doc = req.userText.replace(/^DOCUMENT:\n/, '');
  const field = (re: RegExp) => doc.match(re)?.[1]?.trim() ?? '';
  const currencyRaw = field(/Currency:\s*([A-Z]{3})/) || (doc.includes('€') ? 'EUR' : doc.includes('£') ? 'GBP' : 'USD');
  const lineItems = [...doc.matchAll(/^-\s*(.+?)\s+x\s*(\d+(?:\.\d+)?)\s+@\s*[^\d\-]*([\d,]+(?:\.\d+)?)/gm)].map((m) => ({
    description: m[1].trim(),
    quantity: Number(m[2]),
    unitPrice: num(m[3]),
  }));
  return json({
    vendor: field(/(?:Vendor|From):\s*(.+)/),
    invoiceNumber: field(/Invoice\s*(?:#|No\.?|Number):?\s*([A-Z0-9\-]+)/i),
    date: normalizeDate(field(/Date:\s*(.+)/)),
    currency: currencyRaw,
    total: num(field(/Total(?: due)?:\s*(.+)/i)),
    lineItems,
  });
}

// ---------- rag-qa: best-overlap sentence retrieval with refusal ----------
function ragResponder(req: MockRequest): MockContent[] {
  const docsBlock = section(req.userText, 'DOCUMENTS', 'QUESTION:');
  const question = req.userText.split('QUESTION:')[1]?.trim() ?? '';
  const qWords = new Set(contentWords(question));
  let best = { id: '', sentence: '', score: 0 };
  for (const line of docsBlock.split('\n')) {
    const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!m) continue;
    for (const sentence of splitSentences(m[2])) {
      const overlap = contentWords(sentence).filter((w) => qWords.has(w)).length;
      if (overlap > best.score) best = { id: m[1], sentence: sentence.trim(), score: overlap };
    }
  }
  if (best.score < 2) {
    return json({ answer: "I don't know based on the provided documents.", citations: [], answerable: false });
  }
  return json({ answer: best.sentence, citations: [best.id], answerable: true });
}

// ---------- agent: pick a tool, then answer from its result ----------
function agentResponder(req: MockRequest): MockContent[] {
  const q = req.userText;
  if (req.toolResults.length === 0) {
    const order = q.match(/\b([A-Z]-\d{4})\b/);
    if (order) return [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'lookupOrder', input: JSON.stringify({ orderId: order[1] }) }];
    const city = Object.keys(WEATHER).find((c) => q.toLowerCase().includes(c));
    if (city && /weather|temperature|raining|rain|hot|cold/i.test(q)) {
      return [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'getWeather', input: JSON.stringify({ city: city[0].toUpperCase() + city.slice(1) }) }];
    }
    const expr = q.match(/([\d.]+(?:\s*[+\-*/]\s*\(?[\d.]+\)?)+)/);
    if (expr) return [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'calculator', input: JSON.stringify({ expression: expr[1].trim() }) }];
    return text("I can help with arithmetic, weather and order status. Could you tell me more?");
  }
  const { toolName, output } = req.toolResults[req.toolResults.length - 1];
  const o = output as Record<string, unknown>;
  if (o && typeof o === 'object' && 'error' in o) return text(`Sorry, ${String(o.error)}.`);
  if (toolName === 'calculator') return text(`The result is ${o.result}.`);
  if (toolName === 'getWeather') return text(`It is ${o.tempF}°F and ${o.condition}.`);
  if (toolName === 'lookupOrder') return text(`Your order is ${o.status} with an expected date of ${o.eta}.`);
  return text('Done.');
}

/**
 * Fault injection for gate self-tests: EVAL_MOCK_FAULT=<name> makes the mock
 * subject regress in a specific, realistic way. CI runs the evals with a fault
 * and asserts the gate FAILS, proving the gate can actually catch regressions.
 */
export const MOCK_FAULTS = ['summarize-hallucinate', 'rag-no-citations', 'agent-skip-tools', 'extract-bad-date'] as const;
export type MockFault = (typeof MOCK_FAULTS)[number];

function applyFault(task: string | undefined, req: MockRequest, out: MockContent[]): MockContent[] {
  const fault = process.env.EVAL_MOCK_FAULT as MockFault | undefined;
  if (!fault) return out;
  const first = out[0];
  if (fault === 'summarize-hallucinate' && task === 'summarize' && first?.type === 'text') {
    return text(`${first.text} The mayor called it a historic win for the region.`);
  }
  if (fault === 'rag-no-citations' && task === 'rag-qa' && first?.type === 'text') {
    return json({ ...JSON.parse(first.text), citations: [] });
  }
  if (fault === 'agent-skip-tools' && task === 'agent' && req.toolResults.length === 0 && first?.type === 'tool-call') {
    return text('I believe it is probably fine.');
  }
  if (fault === 'extract-bad-date' && task === 'extract' && first?.type === 'text') {
    const v = JSON.parse(first.text);
    return json({ ...v, date: v.date.split('-').reverse().join('/') });
  }
  return out;
}

export const mockSubjectResponder: MockResponder = (req) => {
  const task = req.instructions.match(/^Task:\s*([\w-]+)/m)?.[1];
  return applyFault(task, req, baseSubjectResponder(task, req));
};

function baseSubjectResponder(task: string | undefined, req: MockRequest): MockContent[] {
  switch (task) {
    case 'summarize':
      return summarizeResponder(req);
    case 'classify':
      return classifyResponder(req);
    case 'extract':
      return extractResponder(req);
    case 'rag-qa':
      return ragResponder(req);
    case 'agent':
      return agentResponder(req);
    default:
      return text('OK');
  }
}

/**
 * Heuristic stand-in for an LLM judge: rewards coverage of the reference and
 * penalizes content words found in neither the input nor the reference.
 * Real judging happens in EVAL_MODE=live; this keeps the plumbing testable.
 */
const REFUSAL = /\b(don'?t know|do not (say|give|contain|mention|specify)|not (stated|mentioned|provided)|cannot (answer|tell))\b/i;

export function heuristicJudgeScore(input: string, output: string, reference: string): number {
  // Refusals: correct when the reference also says the answer is absent, a hard
  // fail when the reference has an answer (and vice versa for answering).
  const outRefuses = REFUSAL.test(output);
  const refRefuses = REFUSAL.test(reference);
  if (outRefuses || refRefuses) return outRefuses === refRefuses ? 5 : 1;
  const out = new Set(contentWords(output));
  if (out.size === 0) return 1;
  const ref = new Set(contentWords(reference));
  const source = new Set([...contentWords(input), ...ref]);
  const recall = ref.size === 0 ? 1 : [...ref].filter((w) => out.has(w)).length / ref.size;
  const support = [...out].filter((w) => source.has(w)).length / out.size;
  const combined = 0.4 * recall + 0.6 * support;
  return Math.min(5, Math.max(1, 1 + Math.round(combined * 4)));
}

export const mockJudgeResponder: MockResponder = (req) => {
  const p = req.userText;
  const tag = (name: string) => p.match(new RegExp(`<${name}>\\n([\\s\\S]*?)\\n</${name}>`))?.[1] ?? '';
  const input = tag('input');
  const reference = tag('reference').replace('(none)', '');
  const output = tag('output');
  const score = heuristicJudgeScore(input, output, reference);
  return json({ score, rationale: `Heuristic mock judge: coverage/support score ${score}/5.` });
};
