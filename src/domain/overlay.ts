import type { Employee } from './types';
import { breakCycles } from './tree';

/** Local edits on top of source data (e.g. Entra), keyed by employee id. */
export type EmployeeOverlay = Partial<Pick<Employee, 'name' | 'title' | 'managerId' | 'divisionId' | 'pic' | 'team' | 'location' | 'email'>>;
export type Overlays = Record<string, EmployeeOverlay>;

/** employee id -> subtopic ids. */
export type Assignments = Record<string, string[]>;

export const OVERLAY_KEYS = ['name', 'title', 'managerId', 'divisionId', 'pic', 'team', 'location', 'email'] as const;

export const pickOverlay = (updates: Partial<Employee>): EmployeeOverlay => {
  const out: EmployeeOverlay = {};
  for (const k of OVERLAY_KEYS) if (k in updates) (out as Record<string, unknown>)[k] = updates[k];
  return out;
};

export const extractAssignments = (employees: readonly Employee[]): Assignments => {
  const out: Assignments = {};
  for (const e of employees) if (e.subtopics.length) out[e.id] = [...e.subtopics];
  return out;
};

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Carry subtopic assignments from the previous people list to a freshly
 * loaded one: same id first, then employee ID (extId/employeeId), then email.
 * Lets assignments made on a CSV import survive switching to Entra.
 */
export const carryAssignments = (prev: readonly Employee[], next: readonly Employee[]): Assignments => {
  const byId = new Map(prev.map((e) => [e.id, e]));
  const byEmpId = new Map<string, Employee>();
  const byMail = new Map<string, Employee>();
  for (const e of prev) {
    const empId = e.employeeId ?? e.extId;
    if (empId && !byEmpId.has(lc(empId))) byEmpId.set(lc(empId), e);
    if (e.email && !byMail.has(lc(e.email))) byMail.set(lc(e.email), e);
  }
  const out: Assignments = {};
  for (const n of next) {
    const empId = n.employeeId ?? n.extId;
    const p = byId.get(n.id)
      ?? (empId ? byEmpId.get(lc(empId)) : undefined)
      ?? (n.email ? byMail.get(lc(n.email)) : undefined);
    if (p?.subtopics.length) out[n.id] = [...p.subtopics];
  }
  return out;
};

/**
 * Re-apply local assignments and overlays to freshly loaded employees.
 * Overlays/assignments for people no longer present are ignored. Invalid
 * manager overlays (missing target, cycles) fall back to top level.
 */
export const applyLocalState = (
  employees: readonly Employee[],
  assignments: Assignments,
  overlays: Overlays,
  validSubtopics?: ReadonlySet<string>,
): Employee[] => {
  const ids = new Set(employees.map((e) => e.id));
  const out = employees.map((e) => {
    const o = overlays[e.id];
    const a = assignments[e.id];
    if (!o && !a) return e;
    const next: Employee = { ...e, ...o };
    if (o && 'managerId' in o && o.managerId && !ids.has(o.managerId)) next.managerId = e.managerId;
    if (a) next.subtopics = validSubtopics ? a.filter((s) => validSubtopics.has(s)) : [...a];
    return next;
  });
  return breakCycles(out).employees;
};
