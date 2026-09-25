import type { SourceError, SourceErrorKind } from '../store/useSourceStore';

/** Error raised by a data source or the auth layer, with a UI-relevant kind. */
export class SourceLoadError extends Error {
  readonly kind: SourceErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: SourceErrorKind, message: string, opts: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'SourceLoadError';
    this.kind = kind;
    this.status = opts.status;
    this.code = opts.code;
  }
}

/** AADSTS codes meaning the app lacks (admin) consent for the requested scopes. */
const CONSENT_CODES = ['AADSTS65001', 'AADSTS90094', 'AADSTS90008', 'AADSTS65004', 'AADSTS900941'];

const text = (e: unknown): string => {
  if (!e || typeof e !== 'object') return String(e ?? '');
  const o = e as { errorCode?: unknown; errorMessage?: unknown; message?: unknown; subError?: unknown };
  return [o.errorCode, o.subError, o.errorMessage, o.message].filter((x) => typeof x === 'string').join(' ');
};

export const isAbortError = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';

/** Map any error (MSAL, fetch, Graph) to a SourceError for the UI. */
export const classifyError = (e: unknown): SourceError => {
  if (e instanceof SourceLoadError) return { kind: e.kind, message: e.message };
  const t = text(e);
  const code = (e && typeof e === 'object' ? (e as { errorCode?: unknown }).errorCode : undefined) as string | undefined;
  let kind: SourceErrorKind = 'unknown';
  if (CONSENT_CODES.some((c) => t.includes(c)) || code === 'consent_required' || /admin (consent|approval)/i.test(t)) kind = 'consent';
  else if (code === 'no_network_connectivity' || code === 'endpoints_resolution_error' || e instanceof TypeError) kind = 'network';
  else if (code === 'timed_out' || code === 'monitor_window_timeout' || code === 'token_renewal_error') kind = 'timeout';
  else if (
    code === 'interaction_required' || code === 'login_required' || code === 'no_account_error' ||
    code === 'user_cancelled' || code === 'popup_window_error' || code === 'empty_window_error' ||
    code === 'no_tokens_found' || code === 'interaction_in_progress'
  ) kind = 'signin';
  return { kind, message: t || 'Unknown error' };
};
