import { isAbortError, SourceLoadError } from './errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  fetch?: FetchLike;
  /** Retries after the first attempt, for 429/503/504. */
  maxRetries?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Backoff base when there is no Retry-After. Doubles per attempt. */
  baseDelayMs?: number;
  /** Upper bound for any single wait (incl. Retry-After). */
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const RETRY_STATUS = new Set([429, 503, 504]);

export const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal!.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Retry-After as delay in ms (seconds or HTTP date). null if absent/invalid. */
export const parseRetryAfter = (value: string | null, now = Date.now()): number | null => {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
};

/**
 * fetch with per-attempt timeout (AbortController) and retry on 429/503/504,
 * honoring Retry-After, else exponential backoff with jitter.
 * Network failures and timeouts throw SourceLoadError('network'|'timeout').
 * Non-retryable HTTP errors are returned to the caller.
 */
export const fetchWithRetry = async (url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> => {
  const {
    fetch: f = globalThis.fetch.bind(globalThis), maxRetries = 4, timeoutMs = 30_000,
    baseDelayMs = 1000, maxDelayMs = 60_000, signal, sleep = defaultSleep,
  } = opts;

  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const onAbort = () => ctrl.abort(signal!.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let res: Response;
    try {
      res = await f(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) throw new SourceLoadError('timeout', `Request timed out after ${timeoutMs / 1000}s.`, { cause: e });
      if (signal?.aborted || isAbortError(e)) throw e;
      throw new SourceLoadError('network', 'Network error: could not reach Microsoft Graph.', { cause: e });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (!RETRY_STATUS.has(res.status) || attempt >= maxRetries) return res;
    const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
    const backoff = baseDelayMs * 2 ** attempt * (0.5 + Math.random() / 2);
    await sleep(Math.min(maxDelayMs, retryAfter ?? backoff), signal);
  }
};

/** Throw a SourceLoadError for a non-OK Graph response. */
export const throwForStatus = async (res: Response): Promise<never> => {
  let code = '';
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch { /* not JSON */ }
  const kind =
    res.status === 401 ? 'signin'
    : res.status === 403 ? 'consent'
    : res.status === 429 ? 'throttled'
    : res.status >= 500 ? 'server'
    : 'unknown';
  throw new SourceLoadError(kind, `Microsoft Graph ${res.status}${code ? ` ${code}` : ''}: ${message}`, { status: res.status, code });
};
