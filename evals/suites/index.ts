import { agentSuite } from './agent';
import { classifySuite } from './classify';
import { extractSuite } from './extract';
import { ragQaSuite } from './rag-qa';
import { summarizeSuite } from './summarize';
import type { AnySuite } from './types';

export const SUITES: AnySuite[] = [summarizeSuite, classifySuite, extractSuite, ragQaSuite, agentSuite];

export const SUITE_NAMES = SUITES.map((s) => s.name);

export function getSuite(name: string): AnySuite {
  const s = SUITES.find((x) => x.name === name);
  if (!s) throw new Error(`Unknown suite "${name}". Known: ${SUITE_NAMES.join(', ')}`);
  return s;
}
