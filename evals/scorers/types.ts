export interface ScoreResult {
  name: string;
  /** Normalized 0..1. */
  score: number;
  pass: boolean;
  detail?: string;
}
