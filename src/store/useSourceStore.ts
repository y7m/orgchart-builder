import { create } from 'zustand';
import type { SourceId } from '../domain/types';

/** Status of the most recent load of the active source. */
export type SourceStatus = 'idle' | 'loading' | 'live' | 'offline' | 'error';

export type SourceErrorKind =
  | 'network' | 'timeout' | 'server' | 'throttled' // -> offline
  | 'consent' | 'signin' | 'forbidden' | 'invalid' | 'unknown'; // -> error

export interface SourceError { kind: SourceErrorKind; message: string }

export interface Notice { kind: 'error' | 'info'; text: string }

export interface SourceState {
  entraConfigured: boolean;
  activeSource: SourceId;
  /** File name, tenant label, etc. */
  sourceLabel: string | null;
  status: SourceStatus;
  lastLoadedAt: number | null;
  error: SourceError | null;
  /** Entra users dropped by the exclusion filter on the last load. */
  excludedCount: number;
  /** Signed-in Entra account (memory only). */
  account: { name: string; username: string } | null;
  bannerDismissed: boolean;
  /** One-off message (e.g. invalid project file). */
  notice: Notice | null;
}

export const OFFLINE_KINDS: ReadonlySet<SourceErrorKind> = new Set(['network', 'timeout', 'server', 'throttled']);

export const initialSourceState = (): SourceState => ({
  entraConfigured: false,
  activeSource: 'demo',
  sourceLabel: null,
  status: 'idle',
  lastLoadedAt: null,
  error: null,
  excludedCount: 0,
  account: null,
  bannerDismissed: false,
  notice: null,
});

/**
 * Data-source status. Memory only: never persisted (it can hold the signed-in
 * user's name).
 */
export const useSourceStore = create<SourceState>()(() => initialSourceState());
