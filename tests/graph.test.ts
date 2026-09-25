import { describe, expect, it, vi } from 'vitest';
import { fetchAllUsers, GRAPH_BASE, usersUrl } from '../src/datasource/graph';
import { fetchWithRetry, parseRetryAfter } from '../src/datasource/http';
import { SourceLoadError } from '../src/datasource/errors';
import { DEFAULT_EXCLUSION, exclusionFromEnv, filterUsers, mapGraphUsers, type GraphUser } from '../src/domain/entra';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const u = (id: string, extra: Partial<GraphUser> = {}): GraphUser => ({
  id, displayName: `User ${id}`, jobTitle: 'Engineer', userPrincipalName: `${id}@corp.test`,
  accountEnabled: true, userType: 'Member', ...extra,
});

const noSleep = vi.fn(async () => {});

describe('Graph users paging', () => {
  it('requests the documented query and follows @odata.nextLink', async () => {
    const next = `${GRAPH_BASE}/users?$skiptoken=abc`;
    const f = vi.fn()
      .mockResolvedValueOnce(json({ value: [u('1'), u('2')], '@odata.nextLink': next }))
      .mockResolvedValueOnce(json({ value: [u('3')] }));
    const users = await fetchAllUsers({ getToken: async () => 'tok', fetch: f, sleep: noSleep });
    expect(users.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(f).toHaveBeenCalledTimes(2);
    const first = new URL(f.mock.calls[0][0] as string);
    expect(first.pathname).toBe('/v1.0/users');
    expect(first.searchParams.get('$top')).toBe('999');
    expect(first.searchParams.get('$filter')).toBe("accountEnabled eq true and userType eq 'Member'");
    expect(first.searchParams.get('$expand')).toBe('manager($select=id)');
    expect(first.searchParams.get('$select')).toContain('employeeOrgData');
    expect(f.mock.calls[1][0]).toBe(next);
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('rejects nextLinks to other hosts', async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ value: [u('1')], '@odata.nextLink': 'https://evil.test/users' }));
    await expect(fetchAllUsers({ getToken: async () => 't', fetch: f })).rejects.toThrow(/paging link/);
  });

  it('retries without $filter if the tenant rejects it (400)', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'Request_UnsupportedQuery', message: 'no' } }, 400))
      .mockResolvedValueOnce(json({ value: [u('1')] }));
    const users = await fetchAllUsers({ getToken: async () => 't', fetch: f });
    expect(users).toHaveLength(1);
    expect(new URL(f.mock.calls[1][0] as string).searchParams.get('$filter')).toBeNull();
  });

  it('403 is classified as consent, 5xx as server', async () => {
    const f403 = vi.fn().mockResolvedValue(json({ error: { code: 'Authorization_RequestDenied', message: 'Insufficient privileges' } }, 403));
    await expect(fetchAllUsers({ getToken: async () => 't', fetch: f403 })).rejects.toMatchObject({ kind: 'consent', status: 403 });
    const f500 = vi.fn().mockResolvedValue(json({}, 500));
    await expect(fetchAllUsers({ getToken: async () => 't', fetch: f500 })).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('fetchWithRetry', () => {
  it('honors Retry-After on 429 then succeeds', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '7' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(json({ value: [] }));
    const res = await fetchWithRetry('https://graph.microsoft.com/v1.0/users', {}, { fetch: f, sleep, baseDelayMs: 100 });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0][0]).toBe(7000);
    // no Retry-After: exponential backoff with jitter, attempt 1 => 100*2^1*[0.5,1]
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(100);
    expect(sleep.mock.calls[1][0]).toBeLessThanOrEqual(200);
  });

  it('gives up after maxRetries and returns the last 429', async () => {
    const f = vi.fn().mockImplementation(async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } }));
    const res = await fetchWithRetry('x', {}, { fetch: f, sleep: noSleep, maxRetries: 2 });
    expect(res.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('times out via AbortController', async () => {
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const err = await fetchWithRetry('x', {}, { fetch: f, timeoutMs: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceLoadError);
    expect(err.kind).toBe('timeout');
  });

  it('network failure => kind network', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithRetry('x', {}, { fetch: f })).rejects.toMatchObject({ kind: 'network' });
  });

  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('mapGraphUsers', () => {
  it('maps manager ids, fields, and division = employeeOrgData.division ?? department', () => {
    const users = [
      u('ceo', { department: 'Exec', employeeOrgData: { division: 'Corporate' }, mail: 'ceo@corp.test', employeeId: '001' }),
      u('a', { department: 'Engineering', manager: { id: 'ceo' }, officeLocation: 'TLV', employeeType: 'Employee' }),
      u('b', { department: 'engineering', manager: { id: 'a' }, mail: null }),
      u('c', { manager: { id: 'not-loaded' } }),
      u('d', { manager: { id: 'd' } }),
    ];
    const { employees, divisions } = mapGraphUsers(users, [{ id: 'eng', name: 'Engineering', color: '#000' }]);
    const by = Object.fromEntries(employees.map((e) => [e.id, e]));
    expect(by.ceo.managerId).toBeNull();
    expect(by.a.managerId).toBe('ceo');
    expect(by.b.managerId).toBe('a');
    expect(by.c.managerId).toBeNull(); // manager outside the set
    expect(by.d.managerId).toBeNull(); // self
    const divName = (id: string | null) => divisions.find((d) => d.id === id)?.name;
    expect(divName(by.ceo.divisionId)).toBe('Corporate');
    expect(by.a.divisionId).toBe('eng'); // matched existing division
    expect(by.b.divisionId).toBe('eng'); // case-insensitive
    expect(by.c.divisionId).toBeNull();
    expect(by.ceo).toMatchObject({ source: 'entra', entraId: 'ceo', email: 'ceo@corp.test', employeeId: '001', extId: '001', department: 'Exec' });
    expect(by.a).toMatchObject({ officeLocation: 'TLV', location: 'TLV', employeeType: 'Employee' });
    expect(by.b.email).toBe('b@corp.test'); // UPN fallback
    expect(divisions.filter((d) => d.name.toLowerCase() === 'engineering')).toHaveLength(1);
  });

  it('breaks manager cycles', () => {
    const { employees } = mapGraphUsers([u('x', { manager: { id: 'y' } }), u('y', { manager: { id: 'x' } })], []);
    expect(employees.filter((e) => !e.managerId).length).toBeGreaterThanOrEqual(1);
  });
});

describe('exclusion filter', () => {
  it('drops service/room/admin/noreply accounts and users without employeeId and jobTitle', () => {
    const users = [
      u('ok1'),
      u('ok2', { jobTitle: null, employeeId: 'E9' }),
      u('none', { jobTitle: null, employeeId: null }),
      u('svc', { userPrincipalName: 'svc-backup@corp.test' }),
      u('room', { userPrincipalName: 'room-101@corp.test', displayName: 'Room 101' }),
      u('adm', { userPrincipalName: 'admin-jdoe@corp.test' }),
      u('nr', { userPrincipalName: 'noreply@corp.test' }),
      u('nr2', { displayName: 'No-Reply Mailer', userPrincipalName: 'mailer@corp.test' }),
      u('dis', { accountEnabled: false }),
      u('guest', { userType: 'Guest' }),
      u('adminish', { userPrincipalName: 'administrator.jane@corp.test', displayName: 'Jane Administrator' }),
    ];
    const { kept, excluded } = filterUsers(users, DEFAULT_EXCLUSION);
    expect(kept.map((x) => x.id)).toEqual(['ok1', 'ok2', 'adminish']);
    expect(excluded).toBe(8);
  });

  it('is configurable from env strings', () => {
    const cfg = exclusionFromEnv('^test-, [invalid', 'false');
    expect(cfg.requireEmployeeIdOrTitle).toBe(false);
    expect(cfg.patterns).toHaveLength(1);
    const { kept } = filterUsers([u('a', { userPrincipalName: 'test-1@x' }), u('b', { jobTitle: null })], cfg);
    expect(kept.map((x) => x.id)).toEqual(['b']);
    expect(exclusionFromEnv('-').patterns).toHaveLength(0);
    expect(usersUrl()).toContain('%24top=999');
  });
});
