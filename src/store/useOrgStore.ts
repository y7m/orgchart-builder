import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Division, Employee, OrgData, Vertical } from '../domain/types';
import { generateId } from '../domain/ids';
import { applyImport, type HeaderMapping, type ImportMode, type ImportReport, type ImportRow } from '../domain/import';
import {
  allSubtopicIds, canDeleteEmployee, deleteEmployee, removeDivision, stripSubtopics, validateManagerChange,
  type Result,
} from '../domain/org';
import { migrateOrgState, ORG_STORE_VERSION, type MigratedOrgState, type PersistedOrgState } from '../domain/migrate';
import { demoDivisions, demoEmployees, demoVerticals } from '../domain/demo';
import { useSourceStore } from './useSourceStore';
import { pickOverlay, type Overlays } from '../domain/overlay';

export type ModalType =
  | 'employee' | 'division' | 'vertical' | 'export' | 'import' | 'promptTheme'
  | 'confirmReset' | 'confirmDeleteDiv' | 'confirmDeleteVert' | 'confirmDeleteEmp'
  | 'saveProject';

export interface OrgState extends PersistedOrgState {
  /** People. Memory only. */
  employees: Employee[];
  /** Person-linked view state. Memory only. */
  collapsedNodes: string[];
  /** Local edits to source-owned (Entra) people, re-applied on refresh. Memory only (saved in project files). */
  overlays: Overlays;
  activeModal: ModalType | null;
  editingId: string | null;

  openModal: (type: ModalType, id?: string | null) => void;
  closeModal: () => void;
  resetToDefault: () => void;
  toggleCollapseNode: (id: string) => void;
  /** Replace the whole org (used by data sources). */
  replaceData: (data: OrgData & { overlays?: Overlays; collapsedNodes?: string[] }) => void;

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

type OrgDataState = Pick<OrgState, 'employees' | 'divisions' | 'verticals' | 'collapsedNodes' | 'overlays'>;

const defaults = (): OrgDataState => ({
  verticals: structuredClone(demoVerticals),
  divisions: structuredClone(demoDivisions),
  employees: structuredClone(demoEmployees),
  collapsedNodes: [],
  overlays: {},
});

/** Keys allowed in localStorage. Anything person-linked must stay out. */
export const persistOrgState = (s: PersistedOrgState): PersistedOrgState => ({
  verticals: s.verticals,
  divisions: s.divisions,
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

      replaceData: ({ employees, divisions, verticals, overlays, collapsedNodes }) => set((s) => {
        const ids = new Set(employees.map((e) => e.id));
        return {
          employees, divisions, verticals,
          overlays: overlays ?? s.overlays,
          collapsedNodes: (collapsedNodes ?? s.collapsedNodes).filter((n) => ids.has(n)),
          activeModal: s.activeModal === 'employee' || s.activeModal === 'confirmDeleteEmp' ? null : s.activeModal,
        };
      }),

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
        const target = employees.find((e) => e.id === id)!;
        const overlay = target.source === 'entra' ? pickOverlay(updates) : {};
        set((s) => ({
          employees: s.employees.map((e) => (e.id === id ? { ...e, ...updates } : e)),
          ...(Object.keys(overlay).length ? { overlays: { ...s.overlays, [id]: { ...s.overlays[id], ...overlay } } } : {}),
        }));
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
        get().replaceData(data);
        return report;
      },
    }),
    {
      name: ORG_STORAGE_KEY,
      version: ORG_STORE_VERSION,
      migrate: (persisted, version) => migrateOrgState(persisted, version),
      partialize: (s): PersistedOrgState => persistOrgState(s),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        const { legacyEmployees: legacy, legacyCollapsed } = persisted as MigratedOrgState;
        const clean = migrateOrgState(persisted, ORG_STORE_VERSION);
        const next: OrgState = { ...current, divisions: clean.divisions, verticals: clean.verticals };
        if (legacy?.length) {
          // Pre-v2 storage held people. Show them this session only; storage is rewritten without them.
          next.employees = legacy;
          next.collapsedNodes = legacyCollapsed ?? [];
          useSourceStore.setState({
            activeSource: 'file',
            sourceLabel: 'recovered from browser storage',
            notice: {
              kind: 'info',
              text: 'People data is no longer kept in browser storage. Your previous chart was loaded for this session only — use "Save project" to keep it.',
            },
          });
        }
        return next;
      },
    },
  ),
);
