import type { Division, Employee, OrgData, Vertical } from './types';
import { generateId } from './ids';
import { breakCycles, findRoots } from './tree';

export type ImportField =
  | 'extId' | 'name' | 'title' | 'manager' | 'division' | 'subtopics' | 'email' | 'location' | 'team';

export type ImportRow = Record<ImportField, string>;

export type ImportMode = 'merge' | 'replace';

/** Exact (normalized) header aliases, in priority order per field. */
export const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
  extId: ['id', 'extid', 'employeeid', 'employeenumber'],
  name: ['name', 'fullname', 'displayname', 'employeename'],
  title: ['title', 'jobtitle', 'role', 'position'],
  manager: ['manager', 'managerid', 'reportsto', 'supervisorid', 'manageremployeeid'],
  division: ['division', 'department', 'dept'],
  subtopics: ['subtopics', 'topics', 'skills', 'tags'],
  email: ['email', 'mail'],
  location: ['location', 'officelocation'],
  team: ['team', 'teamname'],
};

export const IMPORT_FIELDS = Object.keys(HEADER_ALIASES) as ImportField[];

export const FIELD_MAX_LENGTH: Record<ImportField, number> = {
  extId: 200, name: 200, title: 200, manager: 200, division: 200,
  subtopics: 1000, email: 320, location: 200, team: 200,
};

export const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export const clampField = (field: ImportField, value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, FIELD_MAX_LENGTH[field]);
};

export type HeaderMapping = Partial<Record<ImportField, string>>;

/** Map raw headers to fields. Each header used at most once; first alias wins. */
export const mapHeaders = (headers: readonly string[]): HeaderMapping => {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const used = new Set<string>();
  const mapping: HeaderMapping = {};
  for (const field of IMPORT_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      const h = byNorm.get(alias);
      if (h !== undefined && !used.has(h)) {
        mapping[field] = h;
        used.add(h);
        break;
      }
    }
  }
  return mapping;
};

const emptyRow = (): ImportRow => ({
  extId: '', name: '', title: '', manager: '', division: '', subtopics: '', email: '', location: '', team: '',
});

/** Normalize raw parsed records (CSV/XLSX/JSON) into ImportRows. Drops rows without a name. */
export const normalizeRows = (
  raw: readonly Record<string, unknown>[],
): { rows: ImportRow[]; mapping: HeaderMapping } => {
  const headerSet = new Set<string>();
  for (const r of raw) for (const k of Object.keys(r)) headerSet.add(k);
  const mapping = mapHeaders([...headerSet]);
  const rows: ImportRow[] = [];
  for (const r of raw) {
    const row = emptyRow();
    for (const field of IMPORT_FIELDS) {
      const h = mapping[field];
      if (h !== undefined) row[field] = clampField(field, r[h]);
    }
    if (row.name) rows.push(row);
  }
  return { rows, mapping };
};

export interface ImportReport {
  mode: ImportMode;
  rows: number;
  created: number;
  updated: number;
  resolvedManagers: number;
  /** Manager value given but no match. Row becomes a top-level node. */
  unresolvedManagers: { name: string; manager: string }[];
  /** Manager given by a name shared by several people. Left unresolved. */
  ambiguousManagers: { name: string; manager: string }[];
  selfManaged: number;
  cyclesBroken: number;
  duplicateNames: string[];
  duplicateExtIds: string[];
  roots: number;
}

const IMPORTED_TAGS = 'Imported Tags';
const DEFAULT_DIVISION_COLOR = '#94a3b8';

const lc = (s: string) => s.trim().toLowerCase();

export const applyImport = (
  existing: OrgData,
  rows: readonly ImportRow[],
  mode: ImportMode,
  present: HeaderMapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, f])),
): { data: OrgData; report: ImportReport } => {
  const has = (f: ImportField) => present[f] !== undefined;
  const divisions: Division[] = [...existing.divisions];
  const verticals: Vertical[] = existing.verticals.map((v) => ({ ...v, subtopics: [...v.subtopics] }));
  const employees: Employee[] = mode === 'replace' ? [] : existing.employees.map((e) => ({ ...e }));

  // --- lookups
  const divByName = new Map<string, Division>(divisions.map((d) => [lc(d.name), d]));
  const subByText = new Map<string, string>();
  for (const v of verticals) for (const s of v.subtopics) if (!subByText.has(lc(s.text))) subByText.set(lc(s.text), s.id);
  const empByExt = new Map<string, Employee>();
  for (const e of employees) if (e.extId) empByExt.set(lc(e.extId), e);

  const resolveDivision = (name: string): string | null => {
    if (!name) return null;
    let d = divByName.get(lc(name));
    if (!d) {
      d = { id: generateId(), name, color: DEFAULT_DIVISION_COLOR };
      divisions.push(d);
      divByName.set(lc(name), d);
    }
    return d.id;
  };

  const resolveSubtopics = (csv: string): string[] => {
    const out: string[] = [];
    for (const t of csv.split(',').map((x) => x.trim()).filter(Boolean)) {
      let id = subByText.get(lc(t));
      if (!id) {
        let fallback = verticals.find((v) => v.name === IMPORTED_TAGS);
        if (!fallback) {
          fallback = { id: generateId(), name: IMPORTED_TAGS, color: '#64748b', subtopics: [] };
          verticals.push(fallback);
        }
        id = generateId();
        fallback.subtopics.push({ id, text: t });
        subByText.set(lc(t), id);
      }
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  // --- phase 1: upsert employee records (managers resolved later)
  let created = 0;
  let updated = 0;
  const seenExt = new Set<string>();
  const dupExt = new Set<string>();
  const imported: { emp: Employee; row: ImportRow }[] = [];

  for (const row of rows) {
    const ext = row.extId ? lc(row.extId) : '';
    if (ext) {
      if (seenExt.has(ext)) dupExt.add(row.extId);
      seenExt.add(ext);
    }
    let emp = ext ? empByExt.get(ext) : undefined;
    if (emp) {
      updated++;
      emp.name = row.name;
      if (has('title')) emp.title = row.title;
    } else {
      created++;
      emp = {
        id: generateId(),
        name: row.name,
        title: row.title,
        managerId: null,
        divisionId: null,
        pic: '',
        subtopics: [],
      };
      if (row.extId) emp.extId = row.extId;
      employees.push(emp);
      if (ext) empByExt.set(ext, emp);
    }
    if (has('division')) emp.divisionId = resolveDivision(row.division);
    if (has('subtopics')) emp.subtopics = resolveSubtopics(row.subtopics);
    for (const f of ['email', 'location', 'team'] as const) {
      if (has(f)) {
        if (row[f]) emp[f] = row[f];
        else delete emp[f];
      }
    }
    imported.push({ emp, row });
  }

  // --- phase 2: resolve managers (extId first, then unique name; case-insensitive)
  const byName = new Map<string, string[]>();
  for (const e of employees) {
    const k = lc(e.name);
    const list = byName.get(k);
    if (list) list.push(e.id);
    else byName.set(k, [e.id]);
  }

  const report: ImportReport = {
    mode,
    rows: rows.length,
    created,
    updated,
    resolvedManagers: 0,
    unresolvedManagers: [],
    ambiguousManagers: [],
    selfManaged: 0,
    cyclesBroken: 0,
    duplicateNames: [],
    duplicateExtIds: [...dupExt],
    roots: 0,
  };

  if (has('manager')) {
    for (const { emp, row } of imported) {
      const key = lc(row.manager);
      if (!key) {
        emp.managerId = null;
        continue;
      }
      let target: string | undefined = empByExt.get(key)?.id;
      if (!target) {
        const named = byName.get(key);
        if (named && named.length > 1) {
          report.ambiguousManagers.push({ name: emp.name, manager: row.manager });
          emp.managerId = null;
          continue;
        }
        target = named?.[0];
      }
      if (!target) {
        report.unresolvedManagers.push({ name: emp.name, manager: row.manager });
        emp.managerId = null;
      } else if (target === emp.id) {
        report.selfManaged++;
        emp.managerId = null;
      } else {
        emp.managerId = target;
        report.resolvedManagers++;
      }
    }
  }

  // --- phase 3: break cycles (O(n)), clean dangling refs
  const fixed = breakCycles(employees);
  report.cyclesBroken = fixed.cut.length;

  const importedNames = new Map<string, number>();
  for (const { row } of imported) importedNames.set(lc(row.name), (importedNames.get(lc(row.name)) ?? 0) + 1);
  const dupNames = new Set<string>();
  for (const { row } of imported) if ((importedNames.get(lc(row.name)) ?? 0) > 1) dupNames.add(row.name);
  report.duplicateNames = [...dupNames];
  report.roots = findRoots(fixed.employees).length;

  return { data: { employees: fixed.employees, divisions, verticals }, report };
};

export const hasImportWarnings = (r: ImportReport): boolean =>
  r.unresolvedManagers.length > 0 ||
  r.ambiguousManagers.length > 0 ||
  r.selfManaged > 0 ||
  r.cyclesBroken > 0 ||
  r.duplicateNames.length > 0 ||
  r.duplicateExtIds.length > 0 ||
  r.roots > 1;
