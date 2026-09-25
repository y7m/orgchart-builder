import type { IPublicClientApplication } from '@azure/msal-browser';
import { useOrgStore } from '../store/useOrgStore';
import { OFFLINE_KINDS, useSourceStore, type SourceError } from '../store/useSourceStore';
import type { OrgDataSource, OrgSnapshot } from './types';
import { CsvSource, DemoSource, FileSource, GraphSource } from './sources';
import { classifyError, isAbortError } from './errors';
import { readEntraConfig, type EntraConfig } from '../auth/config';
import { getAccount, getEntraConfig, getGraphToken, getMsal, initAuth, signIn, signOut } from '../auth/session';
import { exclusionFromEnv } from '../domain/entra';
import type { HeaderMapping, ImportMode, ImportReport, ImportRow } from '../domain/import';
import { buildProject, projectFileName, serializeProject } from '../domain/project';
import { PhotoLoader, clearPhotos, getPhotoLoader, setPhotoLoader } from './photos';
import type { FetchLike } from './http';

let loadSeq = 0;
let loading = false;
let current: AbortController | null = null;
let graphFetch: FetchLike | undefined;

/** Test hook: route Graph calls through a fake fetch. */
export const setGraphFetch = (f: FetchLike | undefined) => { graphFetch = f; };

const src = useSourceStore.setState;

const syncAccount = () => {
  const a = getAccount();
  src({ account: a ? { name: a.name ?? a.username, username: a.username } : null });
};

// Edits after the last load/save mark the session dirty (memory-only data would be lost on close).
let dirty = false;
useOrgStore.subscribe((s, p) => {
  if (loading) return;
  if (s.employees !== p.employees || s.divisions !== p.divisions || s.verticals !== p.verticals || s.overlays !== p.overlays) dirty = true;
});
export const isDirty = () => dirty && useSourceStore.getState().activeSource !== 'demo';
export const markClean = () => { dirty = false; };

const apply = (snap: OrgSnapshot) => {
  loading = true;
  try {
    useOrgStore.getState().replaceData(snap);
  } finally {
    loading = false;
  }
  // CSV imports exist only in memory until saved as a project file.
  dirty = snap.meta.source === 'csv';
};

type LoadResult = { ok: true; snapshot: OrgSnapshot } | { ok: false; error: SourceError; aborted?: boolean };

/**
 * Load a source into the store. Only the newest call wins. Failures of a
 * static source (CSV/file) leave the current data and status alone and show
 * a notice; Entra failures switch status to offline/error (banner).
 */
export const loadSource = async (source: OrgDataSource): Promise<LoadResult> => {
  const seq = ++loadSeq;
  current?.abort();
  const ctrl = new AbortController();
  current = ctrl;
  const prev = useSourceStore.getState();
  if (source.id === 'entra') src({ status: 'loading', error: null, bannerDismissed: false });
  const s = useOrgStore.getState();
  try {
    const snap = await source.load({
      current: { employees: s.employees, divisions: s.divisions, verticals: s.verticals, overlays: s.overlays },
      signal: ctrl.signal,
    });
    if (seq !== loadSeq) return { ok: false, error: { kind: 'unknown', message: 'superseded' }, aborted: true };
    apply(snap);
    src({
      activeSource: snap.meta.source,
      sourceLabel: snap.meta.label ?? null,
      status: snap.meta.source === 'entra' ? 'live' : 'idle',
      lastLoadedAt: snap.meta.loadedAt,
      error: null,
      excludedCount: snap.meta.excluded ?? 0,
      notice: null,
    });
    return { ok: true, snapshot: snap };
  } catch (e) {
    if (seq !== loadSeq || isAbortError(e)) return { ok: false, error: classifyError(e), aborted: true };
    const error = classifyError(e);
    if (source.id === 'entra') {
      src({ status: OFFLINE_KINDS.has(error.kind) ? 'offline' : 'error', error, bannerDismissed: false });
      syncAccount();
    } else {
      src({ status: prev.status, notice: { kind: 'error', text: error.message } });
    }
    return { ok: false, error };
  } finally {
    if (current === ctrl) current = null;
  }
};

const graphSource = (cfg: EntraConfig, interactive: boolean) => {
  let first = true;
  return new GraphSource({
    // Only the first token request of a load may prompt; later pages reuse the silent path.
    getToken: () => { const i = interactive && first; first = false; return getGraphToken(i); },
    baseUrl: cfg.graphBaseUrl,
    fetch: graphFetch,
    exclusion: exclusionFromEnv(cfg.excludePatterns, cfg.requireEmployeeIdOrTitle),
  });
};

const ensurePhotoLoader = (cfg: EntraConfig) => {
  if (getPhotoLoader()) return;
  setPhotoLoader(new PhotoLoader({ getToken: () => getGraphToken(false), baseUrl: cfg.graphBaseUrl, fetch: graphFetch }));
};

/** Load people from Entra. `interactive` only from a user gesture (may open a popup). */
export const loadEntra = async (interactive = false): Promise<LoadResult> => {
  const cfg = getEntraConfig();
  if (!cfg || !getMsal()) {
    const error: SourceError = { kind: 'signin', message: 'Entra is not configured.' };
    return { ok: false, error };
  }
  const r = await loadSource(graphSource(cfg, interactive));
  syncAccount();
  if (r.ok) {
    clearPhotos(); // revoke old blob URLs; visible cards re-request lazily
    ensurePhotoLoader(cfg);
  }
  return r;
};

/**
 * Boot: read env config; if Entra is configured, init MSAL and (if an account
 * is cached) load silently. Never throws; the app is usable either way.
 */
export const bootDataSources = async (opts: { config?: EntraConfig | null; instance?: IPublicClientApplication } = {}) => {
  const cfg = opts.config !== undefined ? opts.config : readEntraConfig();
  src({ entraConfigured: !!cfg });
  if (!cfg) return;
  try {
    await initAuth(cfg, opts.instance);
  } catch (e) {
    src({ status: 'error', error: classifyError(e) });
    return;
  }
  syncAccount();
  if (!getAccount()) {
    src({ status: 'error', error: { kind: 'signin', message: 'Not signed in.' } });
    return;
  }
  await loadEntra(false);
};

export const signInAndLoad = async (): Promise<LoadResult | null> => {
  try {
    const a = await signIn();
    syncAccount();
    if (!a) return null; // redirecting
  } catch (e) {
    const error = classifyError(e);
    src({ status: OFFLINE_KINDS.has(error.kind) ? 'offline' : 'error', error, bannerDismissed: false });
    return { ok: false, error };
  }
  return loadEntra(true);
};

export const signOutEntra = async () => {
  await signOut();
  setPhotoLoader(null);
  syncAccount();
  const s = useSourceStore.getState();
  src({ status: s.activeSource === 'entra' ? 'error' : s.status, error: { kind: 'signin', message: 'Signed out.' } });
};

/** Retry / Refresh button. */
export const refresh = () => (getAccount() ? loadEntra(true) : signInAndLoad());

export const importCsv = async (
  rows: ImportRow[], mode: ImportMode, mapping?: HeaderMapping, fileName?: string,
): Promise<ImportReport | null> => {
  const r = await loadSource(new CsvSource(rows, mode, mapping, fileName));
  return r.ok ? r.snapshot.meta.report ?? null : null;
};

export const openProjectText = (text: string, fileName?: string) => loadSource(new FileSource(text, fileName));

export const openProjectFile = async (file: File) => openProjectText(await file.text(), file.name);

export const loadDemo = () => loadSource(new DemoSource());

/** Serialized project for the current in-memory state. */
export const currentProjectJson = (now = new Date()): string => {
  const s = useOrgStore.getState();
  return serializeProject(buildProject({
    employees: s.employees, divisions: s.divisions, verticals: s.verticals,
    overlays: s.overlays, collapsedNodes: s.collapsedNodes,
    source: useSourceStore.getState().activeSource,
  }, now));
};

/** Download the project file (contains personal data). */
export const saveProject = () => {
  const blob = new Blob([currentProjectJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectFileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markClean();
};

/** Open a file picker (no DOM element needed in JSX). */
export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });

export const pickAndOpenProject = async () => {
  const f = await pickFile('.json,application/json');
  if (f) await openProjectFile(f);
};

/** Back to sample data; memory state only. */
export const resetSources = () => {
  current?.abort();
  loadSeq++;
  dirty = false;
  clearPhotos();
  src({ activeSource: 'demo', sourceLabel: null, status: 'idle', lastLoadedAt: null, error: null, excludedCount: 0, notice: null });
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });
}
