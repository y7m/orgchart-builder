import { z } from 'zod';
import type { Employee, OrgData, SourceId } from './types';
import { extractAssignments, type Assignments, type Overlays } from './overlay';
import { breakCycles } from './tree';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_EXT = '.orgchart.json';
export const PROJECT_MAX_BYTES = 50 * 1024 * 1024;

const s = (max: number) => z.string().max(max);
const id = s(200).min(1);
const color = s(64);

const sourceSchema = z.enum(['entra', 'csv', 'file', 'demo']);

const employeeSchema = z.object({
  id,
  extId: s(200).optional(),
  name: s(200),
  title: s(200),
  managerId: id.nullable(),
  divisionId: id.nullable(),
  pic: s(2_000_000).optional(), // data URL
  subtopics: z.array(id).max(500),
  email: s(320).optional(),
  location: s(200).optional(),
  team: s(200).optional(),
  source: sourceSchema.optional(),
  entraId: s(200).optional(),
  department: s(200).optional(),
  officeLocation: s(200).optional(),
  employeeId: s(200).optional(),
  employeeType: s(200).optional(),
});

const overlaySchema = employeeSchema.pick({
  name: true, title: true, managerId: true, divisionId: true, pic: true, team: true, location: true, email: true,
}).partial();

export const projectSchema = z.object({
  meta: z.object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    source: sourceSchema,
    savedAt: z.iso.datetime(),
    app: z.literal('orgchart-builder').optional(),
  }),
  employees: z.array(employeeSchema).max(200_000),
  divisions: z.array(z.object({ id, name: s(200), color })).max(10_000),
  verticals: z.array(z.object({
    id, name: s(200), color,
    subtopics: z.array(z.object({ id, text: s(1000) })).max(10_000),
  })).max(10_000),
  assignments: z.record(id, z.array(id)).default({}),
  overlays: z.record(id, overlaySchema).default({}),
  collapsedNodes: z.array(id).default([]),
});

export type ProjectFile = z.infer<typeof projectSchema>;

export interface ProjectInput extends OrgData {
  overlays: Overlays;
  collapsedNodes: string[];
  source: SourceId;
}

/**
 * Serialize for download. Blob photo URLs are dropped (memory only);
 * `subtopics` are also exported as `assignments` so the file is readable
 * without knowing the Employee shape.
 */
export const buildProject = (input: ProjectInput, now = new Date()): ProjectFile => ({
  meta: { schemaVersion: PROJECT_SCHEMA_VERSION, source: input.source, savedAt: now.toISOString(), app: 'orgchart-builder' },
  employees: input.employees.map((e) => {
    const { photoUrl: _photo, ...rest } = e;
    return rest;
  }),
  divisions: input.divisions,
  verticals: input.verticals,
  assignments: extractAssignments(input.employees),
  overlays: input.overlays,
  collapsedNodes: input.collapsedNodes,
});

export const serializeProject = (p: ProjectFile): string => JSON.stringify(p, null, 2);

export type ParseResult =
  | { ok: true; project: ProjectFile; data: OrgData & { overlays: Overlays; collapsedNodes: string[]; assignments: Assignments } }
  | { ok: false; error: string };

/** Validate an untrusted project file. Never throws. */
export const parseProject = (text: string): ParseResult => {
  if (text.length > PROJECT_MAX_BYTES) return { ok: false, error: 'File is too large.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid project file (not JSON).' };
  }
  const r = projectSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
    return { ok: false, error: `Not a valid project file${where}: ${first?.message ?? 'invalid'}.` };
  }
  const p = r.data;
  const ids = new Set<string>();
  for (const e of p.employees) {
    if (ids.has(e.id)) return { ok: false, error: `Not a valid project file: duplicate employee id "${e.id}".` };
    ids.add(e.id);
  }
  const subIds = new Set(p.verticals.flatMap((v) => v.subtopics.map((t) => t.id)));
  const divIds = new Set(p.divisions.map((d) => d.id));
  const employees: Employee[] = p.employees.map((e) => {
    const assigned = p.assignments[e.id] ?? e.subtopics;
    return {
      ...e,
      divisionId: e.divisionId && divIds.has(e.divisionId) ? e.divisionId : null,
      subtopics: assigned.filter((x) => subIds.has(x)),
    };
  });
  return {
    ok: true,
    project: p,
    data: {
      employees: breakCycles(employees).employees,
      divisions: p.divisions,
      verticals: p.verticals,
      overlays: p.overlays,
      assignments: p.assignments,
      collapsedNodes: p.collapsedNodes.filter((n) => ids.has(n)),
    },
  };
};

export const projectFileName = (now = new Date()): string =>
  `orgchart-${now.toISOString().slice(0, 10)}${PROJECT_FILE_EXT}`;
