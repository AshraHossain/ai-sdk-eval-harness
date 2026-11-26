/**
 * Prompt text lives in one constant per feature so the harness can hash it into every report
 * (`promptHash`). An edited prompt then invalidates baseline comparisons instead of silently
 * changing what the numbers mean.
 */
export interface FeaturePrompt {
  readonly system: string;
  /** User-message template. `{name}` placeholders are filled by `render`. */
  readonly user: string;
}

/**
 * Fills `{name}` placeholders in one pass. Values are inserted literally: `$&` in a value is not a
 * backreference, and a value containing `{other}` is not expanded again.
 */
export function render(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
