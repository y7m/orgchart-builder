import type { Division, Employee, Vertical } from './types';
import { breakCycles } from './tree';

/**
 * v0/v1: employees + collapsedNodes were kept in localStorage.
 * v2: only non-PII org metadata (divisions, verticals). People data is memory-only.
 */
export const ORG_STORE_VERSION = 2;

/** Everything that may be written to localStorage. Never add person-linked data here. */
export interface PersistedOrgState {
  verticals: Vertical[];
  divisions: Division[];
}

/** Migration output. People recovered from pre-v2 storage go to memory once and are never re-persisted. */
export interface MigratedOrgState extends PersistedOrgState {
  legacyEmployees?: Employee[];
  legacyCollapsed?: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

const normalizeEmployee = (raw: unknown): Employee | null => {
  const e = obj(raw);
  const id = str(e.id);
  if (!id) return null;
  const out: Employee = {
    id,
    name: str(e.name),
    title: str(e.title),
    managerId: optStr(e.managerId) ?? null,
    divisionId: optStr(e.divisionId) ?? null, // v0 stored '' for "none"
    pic: str(e.pic),
    subtopics: arr(e.subtopics).filter((s): s is string => typeof s === 'string'),
  };
  for (const k of ['extId', 'email', 'location', 'team'] as const) {
    const v = optStr(e[k]);
    if (v) out[k] = v;
  }
  return out;
};

/**
 * Normalize any persisted state into v2. Employees from v0/v1 storage are
 * returned as `legacyEmployees` so the current session can still show them
 * (and the user can save a project file); the persist layer then rewrites
 * storage without them, purging the PII.
 */
export const migrateOrgState = (persisted: unknown, fromVersion: number): MigratedOrgState => {
  const s = obj(persisted);
  const divisions = arr(s.divisions).map(obj).filter((d) => d.id).map((d) => ({
    id: str(d.id), name: str(d.name), color: str(d.color) || '#94a3b8',
  }));
  const verticals = arr(s.verticals).map(obj).filter((v) => v.id).map((v) => ({
    id: str(v.id),
    name: str(v.name),
    color: str(v.color) || '#64748b',
    subtopics: arr(v.subtopics).map(obj).filter((t) => t.id).map((t) => ({ id: str(t.id), text: str(t.text) })),
  }));
  if (fromVersion >= 2) return { divisions, verticals };
  const seen = new Set<string>();
  const employees = arr(s.employees)
    .map(normalizeEmployee)
    .filter((e): e is Employee => !!e && !seen.has(e.id) && !!seen.add(e.id));
  if (employees.length === 0) return { divisions, verticals };
  const ids = new Set(employees.map((e) => e.id));
  const legacyCollapsed = arr(s.collapsedNodes).filter((n): n is string => typeof n === 'string' && ids.has(n));
  return { divisions, verticals, legacyEmployees: breakCycles(employees).employees, legacyCollapsed };
};
