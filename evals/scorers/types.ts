export interface ScoreResult {
  readonly name: string;
  /** Normalized 0..1. */
  readonly score: number;
  readonly pass: boolean;
  readonly detail?: string;
  /** Failed for infrastructure reasons (rate limit, 5xx), not quality. */
  readonly infra?: boolean;
}
