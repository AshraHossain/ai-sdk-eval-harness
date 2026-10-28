export type ScorerKind = 'deterministic' | 'judge';

export interface ScoreResult {
  /** Stable scorer name, used for aggregation across runs. */
  name: string;
  kind: ScorerKind;
  /** Normalized 0..1. */
  score: number;
  pass: boolean;
  detail?: string;
  /** Set when the scorer failed for infrastructure reasons (rate limit, 5xx), not quality. */
  infra?: boolean;
}
