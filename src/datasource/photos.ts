import { useEffect, useSyncExternalStore } from 'react';
import { fetchWithRetry, parseRetryAfter, defaultSleep, type FetchLike } from './http';
import { GRAPH_BASE } from './graph';

/**
 * In-memory photo cache: entra id -> blob URL | null (no photo -> use initials).
 * Never written to browser storage; blob URLs are revoked on reset/unload.
 */
export type PhotoState = string | null | undefined; // undefined = not loaded yet

const BATCH_SIZE = 20; // Graph $batch limit
const MAX_CONCURRENT = 4;
const MAX_ITEM_RETRIES = 3;
const DEBOUNCE_MS = 50;

type Listener = () => void;

export interface PhotoLoaderOptions {
  getToken: () => Promise<string>;
  fetch?: FetchLike;
  baseUrl?: string;
  size?: '48x48' | '64x64' | '96x96' | '120x120';
  sleep?: (ms: number) => Promise<void>;
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

interface BatchResponse {
  responses?: { id: string; status: number; headers?: Record<string, string>; body?: unknown }[];
}

const b64ToBlob = (b64: string, type: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

export class PhotoLoader {
  private map = new Map<string, string | null>();
  private queue: string[] = [];
  private queued = new Set<string>();
  private inFlight = 0;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private opts: PhotoLoaderOptions;

  constructor(opts: PhotoLoaderOptions) {
    this.opts = opts;
  }

  get(id: string): PhotoState {
    return this.map.get(id);
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Queue ids for loading (deduped, batched). */
  request(ids: string | readonly string[]) {
    for (const id of typeof ids === 'string' ? [ids] : ids) {
      if (!id || this.map.has(id) || this.queued.has(id)) continue;
      this.queued.add(id);
      this.queue.push(id);
    }
    if (this.queue.length && !this.timer) this.timer = setTimeout(() => { this.timer = null; this.pump(); }, DEBOUNCE_MS);
  }

  /** Resolves when the queue is empty and nothing is in flight (tests). */
  async idle(): Promise<void> {
    while (this.timer || this.queue.length || this.inFlight) await new Promise((r) => setTimeout(r, 5));
  }

  private pump() {
    while (this.inFlight < MAX_CONCURRENT && this.queue.length) {
      const chunk = this.queue.splice(0, BATCH_SIZE);
      this.inFlight++;
      const gen = this.generation;
      this.runBatch(chunk, gen, 0)
        .catch(() => { if (gen === this.generation) for (const id of chunk) this.queued.delete(id); })
        .finally(() => {
          if (gen !== this.generation) return;
          this.inFlight--;
          this.pump();
        });
    }
  }

  private async runBatch(ids: string[], gen: number, attempt: number): Promise<void> {
    const { getToken, fetch: f, baseUrl = GRAPH_BASE, size = '96x96', sleep = defaultSleep } = this.opts;
    const create = this.opts.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
    const token = await getToken();
    const body = {
      requests: ids.map((id, i) => ({ id: String(i), method: 'GET', url: `/users/${encodeURIComponent(id)}/photos/${size}/$value` })),
    };
    const res = await fetchWithRetry(`${baseUrl}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }, { fetch: f, maxRetries: 3 });
    if (!res.ok) throw new Error(`photo batch ${res.status}`);
    const json = (await res.json()) as BatchResponse;
    if (gen !== this.generation) return;
    const retry: string[] = [];
    let retryAfter = 0;
    for (const r of json.responses ?? []) {
      const id = ids[Number(r.id)];
      if (id === undefined) continue;
      if (r.status === 200 && typeof r.body === 'string') {
        const type = r.headers?.['Content-Type'] ?? r.headers?.['content-type'] ?? 'image/jpeg';
        try {
          this.map.set(id, create(b64ToBlob(r.body, type)));
        } catch {
          this.map.set(id, null);
        }
      } else if ((r.status === 429 || r.status === 503) && attempt < MAX_ITEM_RETRIES) {
        retry.push(id);
        retryAfter = Math.max(retryAfter, parseRetryAfter(r.headers?.['Retry-After'] ?? r.headers?.['retry-after'] ?? null) ?? 1000 * 2 ** attempt);
      } else {
        this.map.set(id, null); // 404 = no photo; others: give up, show initials
      }
      this.queued.delete(id);
    }
    for (const id of ids) if (!this.map.has(id) && !retry.includes(id)) { this.map.set(id, null); this.queued.delete(id); }
    this.emit();
    if (retry.length) {
      for (const id of retry) this.queued.add(id);
      await sleep(Math.min(retryAfter, 60_000));
      if (gen === this.generation) await this.runBatch(retry, gen, attempt + 1);
    }
  }

  /** Revoke all blob URLs and forget everything (reload / sign-out / unload). */
  clear() {
    const revoke = this.opts.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
    this.generation++;
    for (const url of this.map.values()) if (url) revoke(url);
    this.map.clear();
    this.queue = [];
    this.queued.clear();
    this.inFlight = 0;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.emit();
  }
}

// --- singleton used by the app ------------------------------------------------

let loader: PhotoLoader | null = null;
const noop = () => () => {};

export const setPhotoLoader = (l: PhotoLoader | null) => {
  loader?.clear();
  loader = l;
  photoLoaderListeners.forEach((f) => f());
};
export const getPhotoLoader = (): PhotoLoader | null => loader;
export const clearPhotos = () => loader?.clear();

const photoLoaderListeners = new Set<() => void>();
const subscribeLoader = (f: () => void) => {
  photoLoaderListeners.add(f);
  return () => photoLoaderListeners.delete(f);
};

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => loader?.clear());

/**
 * Photo for an Entra user id. Returns a blob URL, null (no photo: render
 * initials) or undefined (loading / not an Entra user). Triggers a lazy,
 * batched fetch on first use. Call only for visible cards.
 */
export const usePhoto = (entraId: string | null | undefined): PhotoState => {
  const l = useSyncExternalStore(subscribeLoader, () => loader);
  const value = useSyncExternalStore(l ? l.subscribe : noop, () => (l && entraId ? l.get(entraId) : undefined));
  useEffect(() => {
    if (l && entraId) l.request(entraId);
  }, [l, entraId]);
  return value;
};

/** Initials fallback for cards without a photo. */
export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
};
