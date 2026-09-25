import type { Employee, OrgData, Subtopic } from './types';
import { generateId } from './ids';
import { findRoots, wouldCreateCycle } from './tree';

export type Result = { ok: true } | { ok: false; error: string };

export const canDeleteEmployee = (employees: readonly Employee[], id: string): Result => {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return { ok: false, error: 'Employee not found.' };
  const roots = findRoots(employees);
  if (employees.length > 1 && roots.length === 1 && roots[0].id === id) {
    return { ok: false, error: 'Cannot delete the only top-level person. Assign a new top-level person first.' };
  }
  return { ok: true };
};

/** Remove an employee; direct reports move up to the deleted person's manager. */
export const deleteEmployee = (employees: readonly Employee[], id: string): Employee[] => {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return [...employees];
  const newManager = emp.managerId && emp.managerId !== id ? emp.managerId : null;
  return employees
    .filter((e) => e.id !== id)
    .map((e) => (e.managerId === id ? { ...e, managerId: newManager } : e));
};

export const validateManagerChange = (
  employees: readonly Employee[],
  employeeId: string,
  managerId: string | null,
): Result => {
  if (managerId !== null && !employees.some((e) => e.id === managerId)) {
    return { ok: false, error: 'Manager not found.' };
  }
  if (wouldCreateCycle(employees, employeeId, managerId)) {
    return { ok: false, error: 'That would create a reporting cycle.' };
  }
  return { ok: true };
};

export const removeDivision = (data: OrgData, id: string): Pick<OrgData, 'divisions' | 'employees'> => ({
  divisions: data.divisions.filter((d) => d.id !== id),
  employees: data.employees.map((e) => (e.divisionId === id ? { ...e, divisionId: null } : e)),
});

export const stripSubtopics = (employees: readonly Employee[], valid: ReadonlySet<string>): Employee[] =>
  employees.map((e) =>
    e.subtopics.every((s) => valid.has(s)) ? e : { ...e, subtopics: e.subtopics.filter((s) => valid.has(s)) },
  );

export const allSubtopicIds = (data: Pick<OrgData, 'verticals'>): Set<string> =>
  new Set(data.verticals.flatMap((v) => v.subtopics.map((s) => s.id)));

/**
 * Build a subtopic list from edited texts, keeping ids stable:
 * exact (case-insensitive) text match first, then same position (treated as a rename).
 */
export const reconcileSubtopics = (old: readonly Subtopic[], texts: readonly string[]): Subtopic[] => {
  const used = new Set<string>();
  const out: (Subtopic | null)[] = texts.map((text) => {
    const m = old.find((s) => !used.has(s.id) && s.text.toLowerCase() === text.toLowerCase());
    if (m) {
      used.add(m.id);
      return { id: m.id, text };
    }
    return null;
  });
  return out.map((s, i) => {
    if (s) return s;
    const text = texts[i];
    const positional = old[i];
    if (positional && !used.has(positional.id)) {
      used.add(positional.id);
      return { id: positional.id, text };
    }
    return { id: generateId(), text };
  });
};
