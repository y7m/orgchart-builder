import type { Division, Employee, Vertical } from './types';
import { breakCycles } from './tree';

export const ORG_STORE_VERSION = 1;

export interface PersistedOrgState {
  verticals: Vertical[];
  divisions: Division[];
  employees: Employee[];
  collapsedNodes: string[];
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

/** Normalize any persisted state (v0 or damaged v1) into a valid v1 shape. */
export const migrateOrgState = (persisted: unknown, _fromVersion: number): PersistedOrgState => {
  const s = obj(persisted);
  const seen = new Set<string>();
  const employees = arr(s.employees)
    .map(normalizeEmployee)
    .filter((e): e is Employee => !!e && !seen.has(e.id) && !!seen.add(e.id));
  const divisions = arr(s.divisions).map(obj).filter((d) => d.id).map((d) => ({
    id: str(d.id), name: str(d.name), color: str(d.color) || '#94a3b8',
  }));
  const verticals = arr(s.verticals).map(obj).filter((v) => v.id).map((v) => ({
    id: str(v.id),
    name: str(v.name),
    color: str(v.color) || '#64748b',
    subtopics: arr(v.subtopics).map(obj).filter((t) => t.id).map((t) => ({ id: str(t.id), text: str(t.text) })),
  }));
  const ids = new Set(employees.map((e) => e.id));
  const collapsedNodes = arr(s.collapsedNodes).filter((n): n is string => typeof n === 'string' && ids.has(n));
  return { employees: breakCycles(employees).employees, divisions, verticals, collapsedNodes };
};
