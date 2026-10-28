import { APICallError, RetryError } from 'ai';

/**
 * Infrastructure errors (rate limits, 5xx, timeouts, network) say nothing
 * about model quality. The runner reports them separately and leaves them out
 * of pass rates and flaky detection, so provider noise cannot fail the gate
 * on its own. Too many of them fails the gate through `maxInfraErrorRate`.
 */
export function isInfraError(err: unknown): boolean {
  if (RetryError.isInstance(err)) return err.reason !== 'errorNotRetryable' || isInfraError(err.lastError);
  if (APICallError.isInstance(err)) {
    const status = err.statusCode ?? 0;
    return err.isRetryable || status === 408 || status === 429 || status >= 500;
  }
  const e = err as { name?: string; code?: string } | undefined;
  return (
    e?.name === 'AbortError' ||
    e?.name === 'TimeoutError' ||
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(e?.code ?? '')
  );
}
