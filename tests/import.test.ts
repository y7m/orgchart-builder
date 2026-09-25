import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyImport, mapHeaders, normalizeRows, type ImportRow } from '../src/domain/import';
import { buildTreeData, computeDepths, findRoots } from '../src/domain/tree';
import { parseCsvText } from '../src/domain/parse';
import type { OrgData } from '../src/domain/types';

const empty: OrgData = { employees: [], divisions: [], verticals: [] };

const row = (r: Partial<ImportRow>): ImportRow => ({
  extId: '', name: '', title: '', manager: '', division: '', subtopics: '', email: '', location: '', team: '', ...r,
});

describe('header alias table', () => {
  it('maps exact aliases and ignores lookalikes', () => {
    const m = mapHeaders(['employee_id', 'displayName', 'Job Family', 'Job Title', 'Manager Employee ID', 'Dept', 'Team', 'Mail', 'Office Location']);
    expect(m.extId).toBe('employee_id');
    expect(m.name).toBe('displayName');
    expect(m.title).toBe('Job Title');
    expect(m.manager).toBe('Manager Employee ID');
    expect(m.division).toBe('Dept');
    expect(m.team).toBe('Team');
    expect(m.email).toBe('Mail');
    expect(m.location).toBe('Office Location');
  });

  it('Manager Employee ID does not map to own id; Job Family does not map to title', () => {
    const m = mapHeaders(['Manager Employee ID', 'Job Family', 'Full Name']);
    expect(m.extId).toBeUndefined();
    expect(m.manager).toBe('Manager Employee ID');
    expect(m.title).toBeUndefined();
    expect(m.name).toBe('Full Name');
  });

  it('prefers higher-priority alias', () => {
    expect(mapHeaders(['Role', 'Title']).title).toBe('Title');
    expect(mapHeaders(['Employee Number', 'ID']).extId).toBe('ID');
  });

  it('team does not map to division', () => {
    const { rows } = normalizeRows([{ Name: 'A', Team: 'Platform', Department: 'Eng' }]);
    expect(rows[0].division).toBe('Eng');
    expect(rows[0].team).toBe('Platform');
  });

  it('keeps < > and caps lengths', () => {
    const { rows } = normalizeRows([{ Name: '<Bob> ' + 'x'.repeat(300), Subtopics: 'y'.repeat(1500) }]);
    expect(rows[0].name.startsWith('<Bob>')).toBe(true);
    expect(rows[0].name).toHaveLength(200);
    expect(rows[0].subtopics).toHaveLength(1000);
  });
});

describe('applyImport', () => {
  it('self-managed CEO terminates and becomes root', { timeout: 2000 }, () => {
    const { data, report } = applyImport(empty, [
      row({ extId: 'E1', name: 'CEO', manager: 'E1' }),
      row({ extId: 'E2', name: 'VP', manager: 'E1' }),
    ], 'replace');
    const ceo = data.employees.find((e) => e.extId === 'E1')!;
    expect(ceo.managerId).toBeNull();
    expect(report.selfManaged).toBe(1);
    expect(findRoots(data.employees)).toHaveLength(1);
  });

  it('resolves manager extId case-insensitively on both sides', () => {
    const { data, report } = applyImport(empty, [
      row({ extId: 'E000001', name: 'CEO' }),
      row({ extId: 'e000002', name: 'VP', manager: 'e000001' }),
      row({ extId: 'E000003', name: 'Dir', manager: 'E000002' }),
    ], 'replace');
    const by = (x: string) => data.employees.find((e) => e.extId === x)!;
    expect(by('e000002').managerId).toBe(by('E000001').id);
    expect(by('E000003').managerId).toBe(by('e000002').id);
    expect(report.resolvedManagers).toBe(2);
  });

  it('resolves manager by name when no id matches', () => {
    const { data } = applyImport(empty, [row({ name: 'Ann' }), row({ name: 'Bob', manager: 'ann' })], 'replace');
    expect(data.employees[1].managerId).toBe(data.employees[0].id);
  });

  it('flags duplicate names and leaves ambiguous manager unresolved', () => {
    const { data, report } = applyImport(empty, [
      row({ extId: '1', name: 'Boss' }),
      row({ extId: '2', name: 'David Cohen', manager: '1' }),
      row({ extId: '3', name: 'David Cohen', manager: '1' }),
      row({ extId: '4', name: 'Kid', manager: 'David Cohen' }),
    ], 'replace');
    expect(report.duplicateNames).toEqual(['David Cohen']);
    expect(report.ambiguousManagers).toEqual([{ name: 'Kid', manager: 'David Cohen' }]);
    expect(data.employees.find((e) => e.extId === '4')!.managerId).toBeNull();
  });

  it('prototype keys are not treated as matches', () => {
    const { data, report } = applyImport(empty, [row({ name: 'A', manager: '__proto__' }), row({ name: 'B', manager: 'constructor' })], 'replace');
    expect(data.employees.every((e) => e.managerId === null)).toBe(true);
    expect(report.unresolvedManagers).toHaveLength(2);
  });

  it('re-import upserts by extId without duplicating', () => {
    const rows = [row({ extId: 'E1', name: 'CEO', title: 'CEO' }), row({ extId: 'E2', name: 'VP', manager: 'E1' })];
    const first = applyImport(empty, rows, 'merge').data;
    const idsBefore = first.employees.map((e) => e.id).sort();
    const { data, report } = applyImport(first, [row({ extId: 'e1', name: 'CEO Renamed', title: 'Chief' }), ...rows.slice(1)], 'merge');
    expect(data.employees).toHaveLength(2);
    expect(data.employees.map((e) => e.id).sort()).toEqual(idsBefore);
    expect(data.employees.find((e) => e.extId === 'E1')!.name).toBe('CEO Renamed');
    expect(report.updated).toBe(2);
    expect(report.created).toBe(0);
  });

  it('replace mode wipes employees but keeps verticals', () => {
    const existing: OrgData = {
      employees: [{ id: 'x', name: 'Old', title: '', managerId: null, divisionId: null, subtopics: [] }],
      divisions: [], verticals: [{ id: 'v', name: 'V', color: '#000', subtopics: [{ id: 's', text: 'Go' }] }],
    };
    const { data } = applyImport(existing, [row({ name: 'New', subtopics: 'go, Rust' })], 'replace');
    expect(data.employees.map((e) => e.name)).toEqual(['New']);
    expect(data.verticals[0].id).toBe('v');
    expect(data.employees[0].subtopics[0]).toBe('s');
    expect(data.verticals.find((v) => v.name === 'Imported Tags')!.subtopics.map((s) => s.text)).toEqual(['Rust']);
  });

  it('unresolved manager is not attached to an existing root', () => {
    const existing: OrgData = {
      employees: [{ id: 'root', name: 'Dummy Root', title: '', managerId: null, divisionId: null, subtopics: [] }],
      divisions: [], verticals: [],
    };
    const { data, report } = applyImport(existing, [row({ extId: 'X', name: 'Orphan', manager: 'NOPE' })], 'merge');
    expect(data.employees.find((e) => e.name === 'Orphan')!.managerId).toBeNull();
    expect(report.unresolvedManagers).toEqual([{ name: 'Orphan', manager: 'NOPE' }]);
    expect(report.roots).toBe(2);
    expect(buildTreeData(data.employees).virtualRoot).toBe(true);
  });

  it('breaks cycles', () => {
    const { data, report } = applyImport(empty, [
      row({ extId: 'A', name: 'A', manager: 'C' }),
      row({ extId: 'B', name: 'B', manager: 'A' }),
      row({ extId: 'C', name: 'C', manager: 'B' }),
    ], 'replace');
    expect(report.cyclesBroken).toBe(1);
    expect(findRoots(data.employees)).toHaveLength(1);
  });

  it('captures email/location/team', () => {
    const { rows, mapping } = normalizeRows([{ Name: 'A', Email: 'a@x.io', Location: 'NYC', TeamName: 'Core' }]);
    const { data } = applyImport(empty, rows, 'replace', mapping);
    expect(data.employees[0]).toMatchObject({ email: 'a@x.io', location: 'NYC', team: 'Core' });
  });
});

describe('samples/org_2000.csv', () => {
  it('imports into a correct tree', () => {
    const text = readFileSync(resolve(__dirname, '../samples/org_2000.csv'), 'utf8');
    const { rows, mapping } = normalizeRows(parseCsvText(text));
    expect(rows).toHaveLength(2000);
    const { data, report } = applyImport(empty, rows, 'replace', mapping);

    expect(report.created).toBe(2000);
    expect(report.resolvedManagers).toBe(1996);
    expect(report.unresolvedManagers).toHaveLength(1);
    expect(report.cyclesBroken).toBe(0);
    expect(report.roots).toBe(4); // CEO + 2 intentional orphans + 1 dangling
    expect(report.duplicateNames).toContain('David Cohen');

    const byExt = new Map(data.employees.map((e) => [e.extId, e]));
    const ceo = byExt.get('E000001')!;
    expect(ceo.title).toBe('Chief Executive Officer');
    expect(ceo.managerId).toBeNull();
    expect(data.employees.filter((e) => e.managerId === ceo.id)).toHaveLength(10);

    const depths = computeDepths(data.employees);
    expect(depths.size).toBe(2000);
    expect(Math.max(...depths.values())).toBe(9);
    const ceoTree = [...depths].filter(([id]) => {
      let cur = data.employees.find((e) => e.id === id)!;
      while (cur.managerId) cur = data.employees.find((e) => e.id === cur.managerId)!;
      return cur.id === ceo.id;
    });
    expect(ceoTree.length).toBe(1997);

    expect(new Set(data.divisions.map((d) => d.name)).size).toBe(12);
    expect(ceo.location).toBe('Tel Aviv');
    expect(ceo.email).toBe('francois.guerin@contoso.example');
    expect(ceo.team).toBe('Office of the CEO');
  });
});
