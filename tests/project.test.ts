import { describe, expect, it } from 'vitest';
import { buildProject, parseProject, serializeProject, PROJECT_SCHEMA_VERSION } from '../src/domain/project';
import type { Employee } from '../src/domain/types';

const emp = (id: string, managerId: string | null, extra: Partial<Employee> = {}): Employee =>
  ({ id, name: `N ${id}`, title: 'T', managerId, divisionId: null, subtopics: [], ...extra });

const input = () => ({
  employees: [
    emp('a', null, { divisionId: 'd1', subtopics: ['s1'], source: 'entra', entraId: 'a', email: 'a@x.test', photoUrl: 'blob:http://x/1' }),
    emp('b', 'a', { subtopics: ['s1', 's2'] }),
  ],
  divisions: [{ id: 'd1', name: 'Ops', color: '#111' }],
  verticals: [{ id: 'v', name: 'V', color: '#222', subtopics: [{ id: 's1', text: 'One' }, { id: 's2', text: 'Two' }] }],
  overlays: { a: { title: 'Chief' } },
  collapsedNodes: ['a'],
  source: 'entra' as const,
});

describe('project file', () => {
  it('round-trips; drops blob photo URLs; includes meta + assignments', () => {
    const now = new Date('2026-09-25T10:00:00.000Z');
    const text = serializeProject(buildProject(input(), now));
    expect(text).not.toContain('blob:');
    const raw = JSON.parse(text);
    expect(raw.meta).toEqual({ schemaVersion: PROJECT_SCHEMA_VERSION, source: 'entra', savedAt: now.toISOString(), app: 'orgchart-builder' });
    expect(raw.assignments).toEqual({ a: ['s1'], b: ['s1', 's2'] });
    const r = parseProject(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { photoUrl: _p, ...a } = input().employees[0];
    expect(r.data.employees).toEqual([a, input().employees[1]]);
    expect(r.data.divisions).toEqual(input().divisions);
    expect(r.data.verticals).toEqual(input().verticals);
    expect(r.data.overlays).toEqual({ a: { title: 'Chief' } });
    expect(r.data.collapsedNodes).toEqual(['a']);
  });

  it.each([
    ['not json', '{'],
    ['wrong schema version', JSON.stringify({ ...buildProject(input()), meta: { schemaVersion: 2, source: 'csv', savedAt: new Date().toISOString() } })],
    ['missing employees', JSON.stringify({ meta: { schemaVersion: 1, source: 'csv', savedAt: new Date().toISOString() }, divisions: [], verticals: [] })],
    ['bad employee', JSON.stringify({ ...buildProject(input()), employees: [{ id: 1 }] })],
    ['duplicate ids', JSON.stringify({ ...buildProject(input()), employees: [emp('a', null), emp('a', null)] })],
    ['array', '[]'],
    ['oversized field', JSON.stringify({ ...buildProject(input()), employees: [emp('a', null, { name: 'x'.repeat(5000) })] })],
  ])('rejects %s gracefully', (_label, text) => {
    const r = parseProject(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Not a valid project file|too large/);
  });

  it('cleans dangling refs and cycles from hand-edited files', () => {
    const p = buildProject(input());
    p.employees = [emp('x', 'y', { divisionId: 'gone', subtopics: ['s1', 'nope'] }), emp('y', 'x')];
    p.assignments = {};
    const r = parseProject(JSON.stringify(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.employees.find((e) => e.id === 'x')!.divisionId).toBeNull();
    expect(r.data.employees.find((e) => e.id === 'x')!.subtopics).toEqual(['s1']);
    expect(r.data.employees.filter((e) => !e.managerId).length).toBeGreaterThanOrEqual(1);
  });
});
