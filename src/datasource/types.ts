import type { Division, Employee, OrgData, SourceId, Vertical } from '../domain/types';
import type { ImportReport } from '../domain/import';
import type { Overlays } from '../domain/overlay';

export interface OrgSnapshot {
  employees: Employee[];
  divisions: Division[];
  verticals: Vertical[];
  /** Project files carry their own; other sources leave the current ones alone. */
  collapsedNodes?: string[];
  overlays?: Overlays;
  meta: {
    source: SourceId;
    /** File name, tenant, etc. */
    label?: string;
    loadedAt: number;
    /** Entra: users dropped by the exclusion filter. */
    excluded?: number;
    /** CSV: import report. */
    report?: ImportReport;
  };
}

export interface LoadOptions {
  /** Current in-memory org (merge imports; keep divisions/verticals/assignments/overlays). */
  current: OrgData & { overlays: Overlays };
  signal?: AbortSignal;
}

export interface OrgDataSource {
  readonly id: SourceId;
  load(opts: LoadOptions): Promise<OrgSnapshot>;
}
