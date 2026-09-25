import { fetchWithRetry, throwForStatus, type FetchLike, type RetryOptions } from './http';
import { SourceLoadError } from './errors';
import type { GraphUser } from '../domain/entra';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export const USER_SELECT = [
  'id', 'displayName', 'jobTitle', 'department', 'officeLocation', 'mail', 'userPrincipalName',
  'employeeId', 'employeeType', 'accountEnabled', 'userType', 'employeeOrgData',
].join(',');

export const USER_FILTER = "accountEnabled eq true and userType eq 'Member'";

export const usersUrl = (base = GRAPH_BASE, withFilter = true): string => {
  const q = new URLSearchParams({ $top: '999', $select: USER_SELECT });
  if (withFilter) q.set('$filter', USER_FILTER);
  q.set('$expand', 'manager($select=id)');
  return `${base}/users?${q.toString()}`;
};

export interface GraphClientOptions extends Omit<RetryOptions, 'signal'> {
  getToken: () => Promise<string>;
  baseUrl?: string;
  /** Safety cap on pages followed. */
  maxPages?: number;
}

const MAX_PAGES = 1000;

/** GET a Graph URL with auth + retry; JSON body or SourceLoadError. */
export const graphGet = async <T>(url: string, opts: GraphClientOptions, signal?: AbortSignal): Promise<T> => {
  const token = await opts.getToken();
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, { ...opts, signal });
  if (!res.ok) return throwForStatus(res);
  return (await res.json()) as T;
};

/**
 * All enabled member users with manager ids, following @odata.nextLink.
 * If the tenant rejects the $filter (400), retries once without it; the
 * client-side exclusion filter then covers accountEnabled/userType.
 */
export const fetchAllUsers = async (opts: GraphClientOptions, signal?: AbortSignal): Promise<GraphUser[]> => {
  const base = opts.baseUrl ?? GRAPH_BASE;
  const run = async (first: string) => {
    const users: GraphUser[] = [];
    let next: string | undefined = first;
    let pages = 0;
    while (next) {
      if (++pages > (opts.maxPages ?? MAX_PAGES)) throw new SourceLoadError('invalid', 'Too many result pages from Microsoft Graph.');
      if (!next.startsWith(base + '/')) throw new SourceLoadError('invalid', 'Unexpected paging link from Microsoft Graph.');
      const page: { value?: GraphUser[]; '@odata.nextLink'?: string } = await graphGet(next, opts, signal);
      if (!Array.isArray(page.value)) throw new SourceLoadError('invalid', 'Unexpected response from Microsoft Graph.');
      users.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return users;
  };
  try {
    return await run(usersUrl(base, true));
  } catch (e) {
    if (e instanceof SourceLoadError && e.status === 400) return run(usersUrl(base, false));
    throw e;
  }
};

export type { FetchLike };
