import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Division, Employee, Vertical } from '../domain/types';
import { generateId } from '../domain/ids';
import { applyImport, type HeaderMapping, type ImportMode, type ImportReport, type ImportRow } from '../domain/import';
import {
  allSubtopicIds, canDeleteEmployee, deleteEmployee, removeDivision, stripSubtopics, validateManagerChange,
  type Result,
} from '../domain/org';
import { migrateOrgState, ORG_STORE_VERSION, type PersistedOrgState } from '../domain/migrate';

const defaultVerticals: Vertical[] = [
  { id: 'v1', name: 'Placeholder Vertical', color: '#40e0d0', subtopics: [{ id: 'v1_1', text: 'Topic A' }, { id: 'v1_2', text: 'Topic B' }] },
  { id: 'v2', name: 'Another Vertical', color: '#1877f2', subtopics: [{ id: 'v2_1', text: 'Topic C' }, { id: 'v2_3', text: 'Topic D' }] },
];

const defaultDivisions: Division[] = [
  { id: 'd1', name: 'Division A', color: '#a855f7' },
  { id: 'd2', name: 'Division B', color: '#f97316' },
  { id: 'd3', name: 'Division C', color: '#475569' },
];

const defaultEmployees: Employee[] = [
  { id: 'e1', name: 'Employee One', title: 'Director', managerId: null, divisionId: 'd3', pic: '', subtopics: [] },
  { id: 'e2', name: 'Employee Two', title: 'Manager', managerId: 'e1', divisionId: 'd1', pic: '', subtopics: ['v2_1', 'v2_3'] },
  { id: 'e3', name: 'Employee Three', title: 'Manager', managerId: 'e1', divisionId: 'd3', pic: '', subtopics: ['v1_1', 'v1_2'] },
  { id: 'e6', name: 'Employee Four', title: 'Specialist', managerId: 'e2', divisionId: 'd1', pic: '', subtopics: ['v1_2', 'v2_3'] },
];

export type ModalType =
  | 'employee' | 'division' | 'vertical' | 'export' | 'import' | 'promptTheme'
  | 'confirmReset' | 'confirmDeleteDiv' | 'confirmDeleteVert' | 'confirmDeleteEmp';

export interface OrgState extends PersistedOrgState {
  activeModal: ModalType | null;
  editingId: string | null;

  openModal: (type: ModalType, id?: string | null) => void;
  closeModal: () => void;
  resetToDefault: () => void;
  toggleCollapseNode: (id: string) => void;

  addEmployee: (emp: Omit<Employee, 'id'>) => Result;
  updateEmployee: (id: string, updates: Partial<Omit<Employee, 'id'>>) => Result;
  updateEmployeeManager: (employeeId: string, newManagerId: string | null) => boolean;
  deleteEmployee: (id: string) => Result;

  addVertical: (v: Omit<Vertical, 'id'>) => void;
  updateVertical: (id: string, updates: Partial<Omit<Vertical, 'id'>>) => void;
  deleteVertical: (id: string) => void;

  addDivision: (d: Omit<Division, 'id'>) => void;
  updateDivision: (id: string, updates: Partial<Omit<Division, 'id'>>) => void;
  deleteDivision: (id: string) => void;

  importEmployees: (rows: ImportRow[], mode: ImportMode, mapping?: HeaderMapping) => ImportReport;
}

export const ORG_STORAGE_KEY = 'orgchart-data-storage';

const defaults = (): PersistedOrgState => ({
  verticals: structuredClone(defaultVerticals),
  divisions: structuredClone(defaultDivisions),
  employees: structuredClone(defaultEmployees),
  collapsedNodes: [],
});

export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      ...defaults(),
      activeModal: null,
      editingId: null,

      openModal: (type, id = null) => set({ activeModal: type, editingId: id }),
      closeModal: () => set({ activeModal: null, editingId: null }),

      resetToDefault: () => set(defaults()),

      toggleCollapseNode: (id) => set((s) => ({
        collapsedNodes: s.collapsedNodes.includes(id)
          ? s.collapsedNodes.filter((n) => n !== id)
          : [...s.collapsedNodes, id],
      })),

      addEmployee: (emp) => {
        const { employees } = get();
        const managerId = emp.managerId || null;
        if (managerId && !employees.some((e) => e.id === managerId)) return { ok: false, error: 'Manager not found.' };
        set({ employees: [...employees, { ...emp, managerId, id: generateId() }] });
        return { ok: true };
      },

      updateEmployee: (id, updates) => {
        const { employees } = get();
        if (!employees.some((e) => e.id === id)) return { ok: false, error: 'Employee not found.' };
        if ('managerId' in updates) {
          const r = validateManagerChange(employees, id, updates.managerId ?? null);
          if (!r.ok) return r;
        }
        set({ employees: employees.map((e) => (e.id === id ? { ...e, ...updates } : e)) });
        return { ok: true };
      },

      updateEmployeeManager: (employeeId, newManagerId) => {
        const r = get().updateEmployee(employeeId, { managerId: newManagerId });
        if (!r.ok) console.warn(r.error);
        return r.ok;
      },

      deleteEmployee: (id) => {
        const { employees, collapsedNodes } = get();
        const r = canDeleteEmployee(employees, id);
        if (!r.ok) return r;
        set({ employees: deleteEmployee(employees, id), collapsedNodes: collapsedNodes.filter((n) => n !== id) });
        return { ok: true };
      },

      addVertical: (v) => set((s) => ({ verticals: [...s.verticals, { ...v, id: generateId() }] })),
      updateVertical: (id, updates) => set((s) => {
        const verticals = s.verticals.map((v) => (v.id === id ? { ...v, ...updates } : v));
        return { verticals, employees: stripSubtopics(s.employees, allSubtopicIds({ verticals })) };
      }),
      deleteVertical: (id) => set((s) => {
        const verticals = s.verticals.filter((v) => v.id !== id);
        return { verticals, employees: stripSubtopics(s.employees, allSubtopicIds({ verticals })) };
      }),

      addDivision: (d) => set((s) => ({ divisions: [...s.divisions, { ...d, id: generateId() }] })),
      updateDivision: (id, updates) => set((s) => ({ divisions: s.divisions.map((d) => (d.id === id ? { ...d, ...updates } : d)) })),
      deleteDivision: (id) => set((s) => removeDivision(s, id)),

      importEmployees: (rows, mode, mapping) => {
        const s = get();
        const { data, report } = applyImport(s, rows, mode, mapping);
        const ids = new Set(data.employees.map((e) => e.id));
        set({ ...data, collapsedNodes: s.collapsedNodes.filter((n) => ids.has(n)) });
        return report;
      },
    }),
    {
      name: ORG_STORAGE_KEY,
      version: ORG_STORE_VERSION,
      migrate: (persisted, version) => migrateOrgState(persisted, version),
      partialize: (s): PersistedOrgState => ({
        verticals: s.verticals,
        divisions: s.divisions,
        employees: s.employees,
        collapsedNodes: s.collapsedNodes,
      }),
    },
  ),
);
