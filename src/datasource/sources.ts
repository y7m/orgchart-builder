import type { OrgDataSource, OrgSnapshot, LoadOptions } from './types';
import { demoDivisions, demoEmployees, demoVerticals } from '../domain/demo';
import { applyImport, type HeaderMapping, type ImportMode, type ImportRow } from '../domain/import';
import { parseProject } from '../domain/project';
import { SourceLoadError } from './errors';
import { fetchAllUsers, type GraphClientOptions } from './graph';
import { DEFAULT_EXCLUSION, filterUsers, mapGraphUsers, type ExclusionConfig } from '../domain/entra';
import { allSubtopicIds } from '../domain/org';
import { applyLocalState, carryAssignments } from '../domain/overlay';

export class DemoSource implements OrgDataSource {
  readonly id = 'demo' as const;
  async load(): Promise<OrgSnapshot> {
    return {
      employees: structuredClone(demoEmployees),
      divisions: structuredClone(demoDivisions),
      verticals: structuredClone(demoVerticals),
      collapsedNodes: [],
      overlays: {},
      meta: { source: 'demo', label: 'sample data', loadedAt: Date.now() },
    };
  }
}

/** Wraps the existing CSV/XLSX/JSON row import (rows are parsed + reviewed in ImportModal). */
export class CsvSource implements OrgDataSource {
  readonly id = 'csv' as const;
  constructor(
    private readonly rows: readonly ImportRow[],
    private readonly mode: ImportMode,
    private readonly mapping?: HeaderMapping,
    private readonly fileName?: string,
  ) {}

  async load({ current }: LoadOptions): Promise<OrgSnapshot> {
    const { data, report } = applyImport(current, this.rows, this.mode, this.mapping);
    for (const e of data.employees) if (!e.source) e.source = 'csv';
    return {
      ...data,
      overlays: this.mode === 'replace' ? {} : current.overlays,
      meta: { source: 'csv', label: this.fileName, loadedAt: Date.now(), report },
    };
  }
}

/** A saved .orgchart.json project file. */
export class FileSource implements OrgDataSource {
  readonly id = 'file' as const;
  constructor(private readonly text: string, private readonly fileName?: string) {}

  async load(): Promise<OrgSnapshot> {
    const r = parseProject(this.text);
    if (!r.ok) throw new SourceLoadError('invalid', r.error);
    return {
      employees: r.data.employees,
      divisions: r.data.divisions,
      verticals: r.data.verticals,
      collapsedNodes: r.data.collapsedNodes,
      overlays: r.data.overlays,
      meta: { source: 'file', label: this.fileName, loadedAt: Date.now() },
    };
  }
}

export interface GraphSourceOptions extends GraphClientOptions {
  exclusion?: ExclusionConfig;
  label?: string;
}

/**
 * Live Entra directory via Microsoft Graph. Local subtopic assignments and
 * overlays (edits) for people still present are re-applied on top.
 */
export class GraphSource implements OrgDataSource {
  readonly id = 'entra' as const;
  constructor(private readonly opts: GraphSourceOptions) {}

  async load({ current, signal }: LoadOptions): Promise<OrgSnapshot> {
    const users = await fetchAllUsers(this.opts, signal);
    const { kept, excluded } = filterUsers(users, this.opts.exclusion ?? DEFAULT_EXCLUSION);
    if (kept.length === 0) throw new SourceLoadError('invalid', `No people found in Entra (${excluded} excluded by filter).`);
    const mapped = mapGraphUsers(kept, current.divisions);
    const employees = applyLocalState(
      mapped.employees,
      carryAssignments(current.employees, mapped.employees),
      current.overlays,
      allSubtopicIds(current),
    );
    return {
      employees,
      divisions: mapped.divisions,
      verticals: current.verticals,
      overlays: current.overlays,
      meta: { source: 'entra', label: this.opts.label, loadedAt: Date.now(), excluded },
    };
  }
}
