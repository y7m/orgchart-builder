import type { SourceState } from '../store/useSourceStore';

export const OFFLINE_TEXT = 'Entra connection offline — people data may not be up to date.';
export const CONSENT_TEXT = 'Admin consent pending for Entra access — using CSV mode.';
export const SIGNIN_TEXT = 'Sign in with your work account to load people from Entra.';

export interface BannerModel {
  tone: 'warn' | 'error' | 'info';
  text: string;
  detail?: string;
  primary: 'retry' | 'signin' | null;
}

/** What the Entra banner shows for the current status (null = nothing). */
export const bannerModel = (s: Pick<SourceState, 'entraConfigured' | 'status' | 'error'>): BannerModel | null => {
  if (!s.entraConfigured) return null;
  if (s.status === 'loading') return { tone: 'info', text: 'Loading people from Entra…', primary: null };
  if (s.status === 'offline') return { tone: 'warn', text: OFFLINE_TEXT, detail: s.error?.message, primary: 'retry' };
  if (s.status !== 'error' || !s.error) return null;
  switch (s.error.kind) {
    case 'consent': return { tone: 'warn', text: CONSENT_TEXT, detail: s.error.message, primary: 'retry' };
    case 'signin': return { tone: 'info', text: SIGNIN_TEXT, primary: 'signin' };
    default: return { tone: 'error', text: `Could not load people from Entra: ${s.error.message}`, primary: 'retry' };
  }
};

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "Source: …" label for the TopBar. */
export const sourceLabel = (s: Pick<SourceState, 'activeSource' | 'sourceLabel' | 'lastLoadedAt'>): string => {
  switch (s.activeSource) {
    case 'entra': return `Source: Entra${s.lastLoadedAt ? ` · loaded ${hhmm(s.lastLoadedAt)}` : ''}`;
    case 'csv': return `Source: CSV${s.sourceLabel ? ` (${s.sourceLabel})` : ''}`;
    case 'file': return `Source: Project file${s.sourceLabel ? ` (${s.sourceLabel})` : ''}`;
    default: return 'Source: Sample data';
  }
};
