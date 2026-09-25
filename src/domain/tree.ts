import type { Employee } from './types';

/** Synthetic parent used when the org has more than one top-level person. Never persisted. */
export const ROOT_ID = '__root__';

type ManagerMap = Map<string, string | null>;

export const buildManagerMap = (employees: readonly Employee[]): ManagerMap =>
  new Map(employees.map((e) => [e.id, e.managerId]));

/** True if the employee has no manager, or its manager does not exist. */
export const findRoots = (employees: readonly Employee[]): Employee[] => {
  const ids = new Set(employees.map((e) => e.id));
  return employees.filter((e) => !e.managerId || !ids.has(e.managerId));
};

/**
 * Would setting `employeeId`'s manager to `newManagerId` create a cycle?
 * Walks up from the new manager; always terminates (visited set).
 * Also rejects attaching under a chain that already loops.
 */
export const wouldCreateCycle = (
  employees: readonly Employee[] | ManagerMap,
  employeeId: string,
  newManagerId: string | null,
): boolean => {
  if (newManagerId === null) return false;
  if (newManagerId === employeeId) return true;
  const map = employees instanceof Map ? employees : buildManagerMap(employees);
  const visited = new Set<string>();
  let cur: string | null | undefined = newManagerId;
  while (cur) {
    if (cur === employeeId) return true;
    if (visited.has(cur)) return true; // pre-existing loop
    visited.add(cur);
    cur = map.get(cur);
  }
  return false;
};

export const buildChildrenMap = (employees: readonly Employee[]): Map<string, string[]> => {
  const children = new Map<string, string[]>();
  for (const e of employees) {
    if (!e.managerId) continue;
    const list = children.get(e.managerId);
    if (list) list.push(e.id);
    else children.set(e.managerId, [e.id]);
  }
  return children;
};

/** All transitive reports of `id` (excluding `id`). Safe on cyclic data. */
export const getDescendantIds = (employees: readonly Employee[], id: string): Set<string> => {
  const children = buildChildrenMap(employees);
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur) || cur === id) continue;
    out.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
};

/**
 * O(n) cycle breaker. Every node on a cycle's entry point (incl. self-managed)
 * gets managerId = null. Dangling manager refs are also nulled.
 * Returns new array (unchanged objects are reused) and the ids that were cut.
 */
export const breakCycles = (
  employees: readonly Employee[],
): { employees: Employee[]; cut: string[]; dangling: string[] } => {
  const map = buildManagerMap(employees);
  const state = new Map<string, 1 | 2>(); // 1 = on current path, 2 = done
  const cut = new Set<string>();
  const dangling = new Set<string>();

  for (const e of employees) {
    if (state.has(e.id)) continue;
    const path: string[] = [];
    let cur: string | null | undefined = e.id;
    while (cur && map.has(cur) && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = map.get(cur);
    }
    if (cur && !map.has(cur)) dangling.add(path[path.length - 1]);
    else if (cur && state.get(cur) === 1) {
      cut.add(cur);
      map.set(cur, null);
    }
    for (const p of path) state.set(p, 2);
  }

  if (cut.size === 0 && dangling.size === 0) return { employees: [...employees], cut: [], dangling: [] };
  return {
    employees: employees.map((e) => (cut.has(e.id) || dangling.has(e.id) ? { ...e, managerId: null } : e)),
    cut: [...cut],
    dangling: [...dangling],
  };
};

export interface TreeDatum {
  id: string;
  parentId: string | null;
  employee: Employee | null; // null for the synthetic root
}

/**
 * Input for d3.stratify. If there are several top-level people (or dangling
 * manager refs), they hang off a synthetic ROOT_ID node.
 */
export const buildTreeData = (employees: readonly Employee[]): { data: TreeDatum[]; virtualRoot: boolean } => {
  const ids = new Set(employees.map((e) => e.id));
  const isRoot = (e: Employee) => !e.managerId || !ids.has(e.managerId);
  const rootCount = employees.reduce((n, e) => n + (isRoot(e) ? 1 : 0), 0);
  const virtualRoot = rootCount > 1;
  const data: TreeDatum[] = employees.map((e) => ({
    id: e.id,
    parentId: isRoot(e) ? (virtualRoot ? ROOT_ID : null) : e.managerId,
    employee: e,
  }));
  if (virtualRoot) data.unshift({ id: ROOT_ID, parentId: null, employee: null });
  return { data, virtualRoot };
};

/** Depth of each employee (roots = 1). Safe on cyclic data (cyclic nodes omitted). */
export const computeDepths = (employees: readonly Employee[]): Map<string, number> => {
  const children = buildChildrenMap(employees);
  const depth = new Map<string, number>();
  const stack: [string, number][] = findRoots(employees).map((r) => [r.id, 1]);
  while (stack.length) {
    const [id, d] = stack.pop()!;
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const c of children.get(id) ?? []) stack.push([c, d + 1]);
  }
  return depth;
};
