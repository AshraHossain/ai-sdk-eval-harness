export interface ScoreResult {
  name: string;
  /** Normalized 0..1. */
  score: number;
  pass: boolean;
  detail?: string;
  /** Failed for infrastructure reasons (rate limit, 5xx), not quality. */
  infra?: boolean;
}
