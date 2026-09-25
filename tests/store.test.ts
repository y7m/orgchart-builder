import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '../src/domain/types';

const e = (id: string, managerId: string | null, extra: Partial<Employee> = {}): Employee =>
  ({ id, name: id, title: '', managerId, divisionId: null, subtopics: [], ...extra });

const loadStore = async () => {
  vi.resetModules();
  return (await import('../src/store/useOrgStore')).useOrgStore;
};

describe('useOrgStore', () => {
  beforeEach(() => localStorage.clear());

  it('updateEmployee rejects cycles and self-management', async () => {
    const store = await loadStore();
    store.setState({ employees: [e('a', null), e('b', 'a'), e('c', 'b')] });
    expect(store.getState().updateEmployee('a', { managerId: 'c' }).ok).toBe(false);
    expect(store.getState().updateEmployee('b', { managerId: 'b' }).ok).toBe(false);
    expect(store.getState().updateEmployee('c', { managerId: 'missing' }).ok).toBe(false);
    expect(store.getState().updateEmployeeManager('a', 'b')).toBe(false);
    expect(store.getState().employees.find((x) => x.id === 'a')!.managerId).toBeNull();
    expect(store.getState().updateEmployee('c', { managerId: 'a' }).ok).toBe(true);
  });

  it('deleteEmployee keeps single root, reparents, cleans collapsedNodes', async () => {
    const store = await loadStore();
    store.setState({ employees: [e('a', null), e('b', 'a'), e('c', 'b')], collapsedNodes: ['b', 'a'] });
    const r = store.getState().deleteEmployee('a');
    expect(r.ok).toBe(false);
    expect(store.getState().employees).toHaveLength(3);

    expect(store.getState().deleteEmployee('b').ok).toBe(true);
    const s = store.getState();
    expect(s.employees.find((x) => x.id === 'c')!.managerId).toBe('a');
    expect(s.employees.filter((x) => !x.managerId)).toHaveLength(1);
    expect(s.collapsedNodes).toEqual(['a']);
  });

  it('deleting a division/vertical clears dangling refs', async () => {
    const store = await loadStore();
    store.setState({
      employees: [e('a', null, { divisionId: 'd', subtopics: ['s1', 's2'] })],
      divisions: [{ id: 'd', name: 'D', color: '#000' }],
      verticals: [
        { id: 'v1', name: 'V1', color: '#000', subtopics: [{ id: 's1', text: 'x' }] },
        { id: 'v2', name: 'V2', color: '#000', subtopics: [{ id: 's2', text: 'y' }] },
      ],
    });
    store.getState().deleteDivision('d');
    store.getState().deleteVertical('v1');
    const a = store.getState().employees[0];
    expect(a.divisionId).toBeNull();
    expect(a.subtopics).toEqual(['s2']);
  });

  it('importEmployees replace keeps verticals, merge upserts', async () => {
    const store = await loadStore();
    const vBefore = store.getState().verticals;
    const row = { extId: 'E1', name: 'CEO', title: '', manager: '', division: '', subtopics: '', email: '', location: '', team: '' };
    store.getState().importEmployees([row], 'replace');
    expect(store.getState().employees.map((x) => x.name)).toEqual(['CEO']);
    expect(store.getState().verticals).toEqual(vBefore);
    store.getState().importEmployees([{ ...row, name: 'CEO 2' }], 'merge');
    expect(store.getState().employees.map((x) => x.name)).toEqual(['CEO 2']);
  });

  it('persists v2: only divisions/verticals, no people or UI state', async () => {
    const store = await loadStore();
    store.getState().openModal('employee', 'e1');
    store.getState().toggleCollapseNode('e1');
    store.getState().addDivision({ name: 'Ops', color: '#000' });
    const saved = JSON.parse(localStorage.getItem('orgchart-data-storage')!);
    expect(saved.version).toBe(2);
    expect(Object.keys(saved.state).sort()).toEqual(['divisions', 'verticals']);
    expect(saved.state.divisions.map((d: { name: string }) => d.name)).toContain('Ops');
  });

  it('migrates v0/v1 storage: people kept in memory for this session, purged from storage', async () => {
    localStorage.setItem('orgchart-data-storage', JSON.stringify({
      version: 0,
      state: {
        employees: [
          { id: 'e1', name: 'Boss', title: 'CEO', managerId: null, divisionId: '', pic: '', subtopics: [], email: 'boss@corp.test' },
          { id: 'e2', name: 'Loop', title: '', managerId: 'e3', divisionId: 'd1', subtopics: ['s'] },
          { id: 'e3', name: 'Loop2', title: '', managerId: 'e2', divisionId: 'd1' },
        ],
        divisions: [{ id: 'd1', name: 'D', color: '#fff' }],
        verticals: [],
        collapsedNodes: ['e1', 'gone'],
        activeModal: 'employee',
        editingId: 'e1',
      },
    }));
    const store = await loadStore();
    const s = store.getState();
    expect(s.activeModal).toBeNull();
    expect(s.employees.find((x) => x.id === 'e1')!.divisionId).toBeNull();
    expect(s.employees.find((x) => x.id === 'e3')!.subtopics).toEqual([]);
    expect(s.employees.filter((x) => !x.managerId).length).toBe(2); // cycle broken
    expect(s.collapsedNodes).toEqual(['e1']);
    expect(s.divisions).toEqual([{ id: 'd1', name: 'D', color: '#fff' }]);
    const raw = localStorage.getItem('orgchart-data-storage')!;
    expect(JSON.parse(raw).version).toBe(2);
    expect(JSON.parse(raw).state.employees).toBeUndefined();
    expect(raw).not.toMatch(/Boss|boss@corp|Loop/);
    const { useSourceStore } = await import('../src/store/useSourceStore');
    expect(useSourceStore.getState().notice?.text).toMatch(/no longer kept in browser storage/);
  });

  it('v1 storage without employees migrates cleanly', async () => {
    localStorage.setItem('orgchart-data-storage', JSON.stringify({
      version: 1, state: { employees: [], divisions: [], verticals: [], collapsedNodes: [] },
    }));
    const store = await loadStore();
    expect(store.getState().employees.length).toBeGreaterThan(0); // demo data
    expect(JSON.parse(localStorage.getItem('orgchart-data-storage')!).state.employees).toBeUndefined();
  });

  it('editing an Entra person records an overlay (memory only)', async () => {
    const store = await loadStore();
    store.setState({ employees: [e('a', null, { source: 'entra' }), e('b', 'a', { source: 'entra' })], overlays: {} });
    expect(store.getState().updateEmployee('b', { title: 'Lead', managerId: null }).ok).toBe(true);
    expect(store.getState().overlays).toEqual({ b: { title: 'Lead', managerId: null } });
    expect(localStorage.getItem('orgchart-data-storage')).not.toMatch(/Lead/);
  });
});
