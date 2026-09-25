import type { Division, Employee } from './types';
import { generateId } from './ids';
import { breakCycles } from './tree';

/** Subset of the Graph `user` resource we request. */
export interface GraphUser {
  id: string;
  displayName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  employeeId?: string | null;
  employeeType?: string | null;
  accountEnabled?: boolean | null;
  userType?: string | null;
  employeeOrgData?: { division?: string | null; costCenter?: string | null } | null;
  manager?: { id?: string | null } | null;
}

export interface ExclusionConfig {
  /** Drop users that have neither employeeId nor jobTitle (service/shared accounts). */
  requireEmployeeIdOrTitle: boolean;
  /** Case-insensitive regexes tested against the UPN local part and displayName. */
  patterns: RegExp[];
}

export const DEFAULT_EXCLUDE_PATTERNS = ['^svc[-_.]', '^room[-_.]', '^admin[-_.]', 'no-?reply'];

export const DEFAULT_EXCLUSION: ExclusionConfig = {
  requireEmployeeIdOrTitle: true,
  patterns: DEFAULT_EXCLUDE_PATTERNS.map((p) => new RegExp(p, 'i')),
};

/** Build an exclusion config from env-style strings. Invalid regexes are skipped. */
export const exclusionFromEnv = (patterns?: string, requireEmployeeIdOrTitle?: string): ExclusionConfig => {
  const list = patterns === undefined || patterns.trim() === ''
    ? DEFAULT_EXCLUDE_PATTERNS
    : patterns === '-' ? [] : patterns.split(',').map((p) => p.trim()).filter(Boolean);
  const compiled: RegExp[] = [];
  for (const p of list) {
    try { compiled.push(new RegExp(p, 'i')); } catch { console.warn(`Ignoring invalid exclude pattern: ${p}`); }
  }
  return { requireEmployeeIdOrTitle: requireEmployeeIdOrTitle !== 'false', patterns: compiled };
};

const blank = (s: string | null | undefined): boolean => !s || !s.trim();

export const isExcluded = (u: GraphUser, cfg: ExclusionConfig = DEFAULT_EXCLUSION): boolean => {
  if (u.accountEnabled === false) return true;
  if (u.userType && u.userType !== 'Member') return true;
  if (cfg.requireEmployeeIdOrTitle && blank(u.employeeId) && blank(u.jobTitle)) return true;
  const upnLocal = (u.userPrincipalName ?? '').split('@')[0];
  const name = u.displayName ?? '';
  return cfg.patterns.some((re) => re.test(upnLocal) || re.test(name));
};

export const filterUsers = (users: readonly GraphUser[], cfg: ExclusionConfig = DEFAULT_EXCLUSION) => {
  const kept: GraphUser[] = [];
  let excluded = 0;
  for (const u of users) {
    if (isExcluded(u, cfg)) excluded++;
    else kept.push(u);
  }
  return { kept, excluded };
};

const PALETTE = ['#a855f7', '#f97316', '#0ea5e9', '#22c55e', '#e11d48', '#eab308', '#14b8a6', '#6366f1', '#475569'];

const opt = (s: string | null | undefined): string | undefined => (s && s.trim() ? s.trim() : undefined);

/**
 * Map Graph users to employees. Division = employeeOrgData.division ?? department,
 * matched to existing divisions by name (case-insensitive), new ones created.
 * Manager refs to users outside the set become top-level; cycles are broken.
 */
export const mapGraphUsers = (
  users: readonly GraphUser[],
  existingDivisions: readonly Division[],
): { employees: Employee[]; divisions: Division[] } => {
  const divisions = [...existingDivisions];
  const byName = new Map(divisions.map((d) => [d.name.trim().toLowerCase(), d.id]));
  const divisionFor = (name: string | undefined): string | null => {
    if (!name) return null;
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      id = generateId();
      divisions.push({ id, name, color: PALETTE[(divisions.length) % PALETTE.length] });
      byName.set(key, id);
    }
    return id;
  };

  const ids = new Set(users.map((u) => u.id));
  const employees = users.map((u): Employee => {
    const managerId = u.manager?.id && ids.has(u.manager.id) && u.manager.id !== u.id ? u.manager.id : null;
    const division = opt(u.employeeOrgData?.division) ?? opt(u.department);
    const e: Employee = {
      id: u.id,
      entraId: u.id,
      source: 'entra',
      name: opt(u.displayName) ?? opt(u.userPrincipalName) ?? '(no name)',
      title: opt(u.jobTitle) ?? '',
      managerId,
      divisionId: divisionFor(division),
      pic: '',
      subtopics: [],
    };
    const email = opt(u.mail) ?? opt(u.userPrincipalName);
    if (email) e.email = email;
    const set = <K extends 'department' | 'officeLocation' | 'employeeId' | 'employeeType' | 'location' | 'extId'>(k: K, v: string | undefined) => {
      if (v) e[k] = v;
    };
    set('department', opt(u.department));
    set('officeLocation', opt(u.officeLocation));
    set('location', opt(u.officeLocation));
    set('employeeId', opt(u.employeeId));
    set('extId', opt(u.employeeId)); // lets a later CSV merge match by employee ID
    set('employeeType', opt(u.employeeType));
    return e;
  });
  return { employees: breakCycles(employees).employees, divisions };
};
