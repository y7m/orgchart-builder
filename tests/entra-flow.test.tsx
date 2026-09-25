import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InteractionRequiredAuthError, type IPublicClientApplication } from '@azure/msal-browser';
import App from '../src/App';
import { useOrgStore } from '../src/store/useOrgStore';
import { initialSourceState, useSourceStore } from '../src/store/useSourceStore';
import {
  bootDataSources, currentProjectJson, importCsv, loadEntra, openProjectText, resetSources, setGraphFetch,
} from '../src/datasource/controller';
import { resetAuth } from '../src/auth/session';
import { readEntraConfig, type EntraConfig } from '../src/auth/config';
import { CONSENT_TEXT, OFFLINE_TEXT } from '../src/datasource/status';
import type { ImportRow } from '../src/domain/import';

const CFG: EntraConfig = readEntraConfig({
  VITE_ENTRA_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
  VITE_ENTRA_TENANT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  VITE_ENTRA_REDIRECT_URI: 'http://localhost:5173/redirect.html',
})!;

const ACCOUNT = { homeAccountId: 'h', environment: 'login.microsoftonline.com', tenantId: 't', username: 'hr.admin@corp.test', localAccountId: 'l', name: 'HR Admin' };

const fakeMsal = (opts: { signedIn?: boolean; silent?: () => Promise<{ accessToken: string }> } = {}) => {
  let active: typeof ACCOUNT | null = opts.signedIn === false ? null : ACCOUNT;
  return {
    handleRedirectPromise: vi.fn(async () => null),
    getActiveAccount: vi.fn(() => active),
    setActiveAccount: vi.fn((a: typeof ACCOUNT | null) => { active = a; }),
    getAllAccounts: vi.fn(() => (active ? [active] : [])),
    acquireTokenSilent: vi.fn(opts.silent ?? (async () => ({ accessToken: 'tok' }))),
    acquireTokenPopup: vi.fn(async () => ({ accessToken: 'tok' })),
    loginPopup: vi.fn(async () => ({ account: ACCOUNT })),
    clearCache: vi.fn(async () => {}),
  } as unknown as IPublicClientApplication;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const GRAPH_USERS = [
  { id: 'g-ceo', displayName: 'Dana Director', jobTitle: 'CEO', mail: 'dana.director@corp.test', userPrincipalName: 'dana.director@corp.test', department: 'Exec', accountEnabled: true, userType: 'Member' },
  { id: 'g-eng', displayName: 'Eli Engineer', jobTitle: 'Engineer', mail: 'eli.engineer@corp.test', userPrincipalName: 'eli.engineer@corp.test', department: 'Engineering', accountEnabled: true, userType: 'Member', manager: { id: 'g-ceo' } },
  { id: 'g-svc', displayName: 'Backup Service', userPrincipalName: 'svc-backup@corp.test', accountEnabled: true, userType: 'Member' },
];

const PII = /Dana Director|dana\.director|Eli Engineer|eli\.engineer|Zoe Csv|zoe@csv\.test|Yan Csv/i;

const allBrowserStorage = () => {
  const dump: string[] = [];
  for (const st of [localStorage, sessionStorage]) {
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i)!;
      dump.push(k, st.getItem(k) ?? '');
    }
  }
  return dump.join('\n');
};

const row = (r: Partial<ImportRow>): ImportRow => ({
  extId: '', name: '', title: '', manager: '', division: '', subtopics: '', email: '', location: '', team: '', ...r,
});

beforeEach(() => {
  resetSources();
  resetAuth();
  setGraphFetch(undefined);
  useSourceStore.setState(initialSourceState());
  useOrgStore.getState().resetToDefault();
  sessionStorage.clear();
});

describe('Entra boot flow', () => {
  it('not configured: no banner, "Entra not configured", CSV import works', async () => {
    await bootDataSources({ config: null });
    render(<App />);
    expect(screen.queryByTestId('source-banner')).toBeNull();
    expect(screen.getByText('Entra not configured')).toBeInTheDocument();
    expect(screen.getByTestId('source-indicator')).toHaveTextContent('Source: Sample data');
    await act(async () => { await importCsv([row({ name: 'Zoe Csv', extId: 'Z1' })], 'replace', undefined, 'people.csv'); });
    expect(screen.getByTestId('source-indicator')).toHaveTextContent('Source: CSV (people.csv)');
    expect(screen.getByText('Zoe Csv')).toBeInTheDocument();
  });

  it('network failure: offline banner with exact text and fallback actions; demo data still shown', async () => {
    setGraphFetch(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    expect(useSourceStore.getState().status).toBe('offline');
    render(<App />);
    const banner = screen.getByTestId('source-banner');
    expect(banner).toHaveTextContent(OFFLINE_TEXT);
    expect(OFFLINE_TEXT).toBe('Entra connection offline — people data may not be up to date.');
    expect(banner).toHaveAttribute('role', 'alert');
    for (const name of ['Retry', 'Import CSV', 'Open project file']) {
      expect(within(banner).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(banner).getByRole('button', { name: 'Import CSV' }));
    expect(useOrgStore.getState().activeModal).toBe('import');
    act(() => useOrgStore.getState().closeModal());
    expect(screen.getByText('Employee One')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('source-banner')).toBeNull();
  });

  it('5xx and timeouts are offline too', async () => {
    setGraphFetch(vi.fn().mockResolvedValue(json({}, 500)));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    expect(useSourceStore.getState().status).toBe('offline');
  });

  it('admin consent missing (AADSTS65001): consent message', async () => {
    const silent = async () => {
      throw new InteractionRequiredAuthError('invalid_grant', 'corr-id', 'AADSTS65001: The user or administrator has not consented to use the application.', 'consent_required', '', '', '', '65001');
    };
    await bootDataSources({ config: CFG, instance: fakeMsal({ silent }) });
    render(<App />);
    expect(screen.getByTestId('source-banner')).toHaveTextContent(CONSENT_TEXT);
    expect(within(screen.getByTestId('source-banner')).getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });

  it('consent detected from errorNo alone', async () => {
    const silent = async () => { throw new InteractionRequiredAuthError('invalid_grant', 'c', undefined, undefined, '', '', '', '65001'); };
    await bootDataSources({ config: CFG, instance: fakeMsal({ silent }) });
    expect(useSourceStore.getState().error?.kind).toBe('consent');
  });

  it('Graph 403 (consent pending) also shows consent message', async () => {
    setGraphFetch(vi.fn().mockResolvedValue(json({ error: { code: 'Authorization_RequestDenied', message: 'Insufficient privileges' } }, 403)));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    expect(useSourceStore.getState().error?.kind).toBe('consent');
  });

  it('not signed in: Sign in button, no popup at boot', async () => {
    const msal = fakeMsal({ signedIn: false });
    await bootDataSources({ config: CFG, instance: msal });
    render(<App />);
    expect(screen.getAllByRole('button', { name: 'Sign in' }).length).toBeGreaterThan(0);
    expect(msal.loginPopup).not.toHaveBeenCalled();
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('live load: maps people, reports exclusions, shows "Source: Entra · loaded HH:MM"', async () => {
    setGraphFetch(vi.fn().mockResolvedValue(json({ value: GRAPH_USERS })));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    const s = useSourceStore.getState();
    expect(s.status).toBe('live');
    expect(s.excludedCount).toBe(1);
    render(<App />);
    expect(screen.getByTestId('source-indicator').textContent).toMatch(/^Source: Entra · loaded \d\d:\d\d/);
    expect(screen.getByText('Eli Engineer')).toBeInTheDocument();
    expect(screen.queryByTestId('source-banner')).toBeNull();
    const eli = useOrgStore.getState().employees.find((e) => e.id === 'g-eng')!;
    expect(eli.managerId).toBe('g-ceo');
  });

  it('refresh keeps local subtopic assignments and edits (overlays)', async () => {
    setGraphFetch(vi.fn().mockImplementation(async () => json({ value: GRAPH_USERS })));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    const st = useOrgStore.getState();
    st.updateEmployee('g-eng', { subtopics: ['v1_1'], title: 'Staff Engineer' });
    await loadEntra(false);
    const eli = useOrgStore.getState().employees.find((e) => e.id === 'g-eng')!;
    expect(eli.subtopics).toEqual(['v1_1']);
    expect(eli.title).toBe('Staff Engineer');
  });
});

describe('switching CSV -> Entra', () => {
  it('carries subtopic assignments by employee ID / email', async () => {
    const users = [
      { ...GRAPH_USERS[0], employeeId: 'E1' },
      { ...GRAPH_USERS[1] },
    ];
    await importCsv([
      row({ name: 'Dana D.', extId: 'E1', subtopics: 'Topic A' }),
      row({ name: 'Eli E.', extId: 'X9', email: 'ELI.engineer@corp.test', subtopics: 'Topic B' }),
    ], 'replace');
    setGraphFetch(vi.fn().mockResolvedValue(json({ value: users })));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    const by = Object.fromEntries(useOrgStore.getState().employees.map((e) => [e.id, e]));
    expect(by['g-ceo'].subtopics).toEqual(['v1_1']);
    expect(by['g-eng'].subtopics).toEqual(['v1_2']);
  });
});

describe('no PII in browser storage', () => {
  it('after CSV import', async () => {
    await importCsv([
      row({ name: 'Zoe Csv', extId: 'Z1', email: 'zoe@csv.test', division: 'Ops', subtopics: 'Topic A' }),
      row({ name: 'Yan Csv', extId: 'Y1', manager: 'Z1' }),
    ], 'replace', undefined, 'people.csv');
    expect(useOrgStore.getState().employees).toHaveLength(2);
    const dump = allBrowserStorage();
    expect(dump).not.toMatch(PII);
    expect(dump).toContain('Ops'); // division names (org metadata) may persist
  });

  it('after Graph load', async () => {
    setGraphFetch(vi.fn().mockResolvedValue(json({ value: GRAPH_USERS })));
    await bootDataSources({ config: CFG, instance: fakeMsal() });
    expect(useOrgStore.getState().employees.some((e) => e.name === 'Dana Director')).toBe(true);
    expect(allBrowserStorage()).not.toMatch(PII);
  });

  it('after opening a project file', async () => {
    await importCsv([row({ name: 'Zoe Csv', extId: 'Z1', email: 'zoe@csv.test' })], 'replace');
    const text = currentProjectJson();
    useOrgStore.getState().resetToDefault();
    localStorage.clear();
    await openProjectText(text, 'x.orgchart.json');
    expect(useOrgStore.getState().employees[0].name).toBe('Zoe Csv');
    expect(allBrowserStorage()).not.toMatch(PII);
  });
});

describe('project file via controller', () => {
  it('round-trips and rejects bad files with a notice, keeping current data', async () => {
    await importCsv([
      row({ name: 'Zoe Csv', extId: 'Z1', division: 'Ops', subtopics: 'Topic A' }),
      row({ name: 'Yan Csv', extId: 'Y1', manager: 'Z1' }),
    ], 'replace', undefined, 'people.csv');
    useOrgStore.getState().toggleCollapseNode(useOrgStore.getState().employees[0].id);
    const before = useOrgStore.getState();
    const text = currentProjectJson();
    useOrgStore.getState().resetToDefault();
    const r = await openProjectText(text, 'team.orgchart.json');
    expect(r.ok).toBe(true);
    const after = useOrgStore.getState();
    expect(after.employees).toEqual(before.employees);
    expect(after.divisions).toEqual(before.divisions);
    expect(after.verticals).toEqual(before.verticals);
    expect(after.collapsedNodes).toEqual(before.collapsedNodes);
    expect(useSourceStore.getState()).toMatchObject({ activeSource: 'file', sourceLabel: 'team.orgchart.json' });

    const bad = await openProjectText('{"meta":{"schemaVersion":99}}', 'bad.json');
    expect(bad.ok).toBe(false);
    expect(useSourceStore.getState().notice?.text).toMatch(/Not a valid project file/);
    expect(useOrgStore.getState().employees).toEqual(before.employees);
    expect(useSourceStore.getState().activeSource).toBe('file');

    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Not a valid project file/);
  });
});

describe('config', () => {
  it('missing or multi-tenant env disables Entra', () => {
    expect(readEntraConfig({})).toBeNull();
    expect(readEntraConfig({ VITE_ENTRA_CLIENT_ID: CFG.clientId })).toBeNull();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readEntraConfig({ VITE_ENTRA_CLIENT_ID: CFG.clientId, VITE_ENTRA_TENANT_ID: 'common' })).toBeNull();
    expect(readEntraConfig({ VITE_ENTRA_CLIENT_ID: 'nope', VITE_ENTRA_TENANT_ID: 'contoso.onmicrosoft.com' })).toBeNull();
    const c = readEntraConfig({ VITE_ENTRA_CLIENT_ID: CFG.clientId, VITE_ENTRA_TENANT_ID: 'contoso.onmicrosoft.com' })!;
    expect(c.authority).toBe('https://login.microsoftonline.com/contoso.onmicrosoft.com');
    expect(c.redirectUri).toMatch(/\/redirect\.html$/);
    expect(c.scopes).toEqual(['User.Read', 'User.Read.All']);
  });
});

describe('waitFor sanity', () => {
  it('status transitions to loading then live', async () => {
    let release!: (r: Response) => void;
    setGraphFetch(vi.fn(() => new Promise<Response>((r) => { release = r; })));
    const p = bootDataSources({ config: CFG, instance: fakeMsal() });
    await waitFor(() => expect(useSourceStore.getState().status).toBe('loading'));
    release(json({ value: GRAPH_USERS }));
    await p;
    expect(useSourceStore.getState().status).toBe('live');
  });
});
