import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Default dummy data based on user spec
const defaultVerticals = [
    { id: 'v1', name: 'Placeholder Vertical', color: '#40e0d0', subtopics: [{ id: 'v1_1', text: 'Topic A' }, { id: 'v1_2', text: 'Topic B' }] },
    { id: 'v2', name: 'Another Vertical', color: '#1877f2', subtopics: [{ id: 'v2_1', text: 'Topic C' }, { id: 'v2_3', text: 'Topic D' }] },
];

const defaultDivisions = [
    { id: 'd1', name: 'Division A', color: '#a855f7' },
    { id: 'd2', name: 'Division B', color: '#f97316' },
    { id: 'd3', name: 'Division C', color: '#475569' }
];

const defaultEmployees = [
    { id: 'e1', name: 'Employee One', title: 'Director', managerId: null, divisionId: 'd3', pic: '', subtopics: [] },
    { id: 'e2', name: 'Employee Two', title: 'Manager', managerId: 'e1', divisionId: 'd1', pic: '', subtopics: ['v2_1', 'v2_3'] },
    { id: 'e3', name: 'Employee Three', title: 'Manager', managerId: 'e1', divisionId: 'd3', pic: '', subtopics: ['v1_1', 'v1_2'] },
    { id: 'e6', name: 'Employee Four', title: 'Specialist', managerId: 'e2', divisionId: 'd1', pic: '', subtopics: ['v1_2', 'v2_3'] },
];

// Helper to check for cycles during drag-and-drop hierarchy changes
const formsCycle = (employees, managerId, potentialChildId) => {
    if (managerId === potentialChildId) return true;
    let current = employees.find(e => e.id === managerId);
    while (current && current.managerId) {
        if (current.managerId === potentialChildId) return true;
        current = employees.find(e => e.id === current.managerId);
    }
    return false;
};

const generateId = (prefix) => prefix + '_' + Math.random().toString(36).substr(2, 9);

export const useOrgStore = create(
    persist(
        (set, get) => ({
            verticals: defaultVerticals,
            divisions: defaultDivisions,
            employees: defaultEmployees,
            collapsedNodes: [],

            // UI State
            activeModal: null,
            editingId: null,

            // -- Actions --
            openModal: (type, id = null) => set({ activeModal: type, editingId: id }),
            closeModal: () => set({ activeModal: null, editingId: null }),

            resetToDefault: () => set({ verticals: defaultVerticals, divisions: defaultDivisions, employees: defaultEmployees, collapsedNodes: [] }),

            toggleCollapseNode: (id) => set((state) => {
                const isCollapsed = state.collapsedNodes.includes(id);
                return {
                    collapsedNodes: isCollapsed
                        ? state.collapsedNodes.filter(n => n !== id)
                        : [...state.collapsedNodes, id]
                };
            }),

            updateEmployeeManager: (employeeId, newManagerId) => {
                const { employees } = get();
                if (formsCycle(employees, newManagerId, employeeId)) {
                    console.warn("Cycle detected. Cannot drop here.");
                    return false; // Return false to indicate invalid drop
                }
                set({
                    employees: employees.map(emp =>
                        emp.id === employeeId ? { ...emp, managerId: newManagerId } : emp
                    )
                });
                return true;
            },

            addEmployee: (emp) => set((state) => ({
                employees: [...state.employees, { ...emp, id: generateId('e') }]
            })),

            updateEmployee: (id, updates) => set((state) => ({
                employees: state.employees.map(e => e.id === id ? { ...e, ...updates } : e)
            })),

            deleteEmployee: (id) => set((state) => {
                // Find anyone reporting to this person and set them to root (or we could reassign to parent)
                const newEmployees = state.employees.filter(e => e.id !== id).map(e =>
                    e.managerId === id ? { ...e, managerId: null } : e
                );
                return { employees: newEmployees };
            }),

            // Verticals
            addVertical: (vert) => set((state) => ({ verticals: [...state.verticals, { ...vert, id: generateId('v') }] })),
            updateVertical: (id, updates) => set((state) => ({ verticals: state.verticals.map(v => v.id === id ? { ...v, ...updates } : v) })),
            deleteVertical: (id) => set((state) => ({ verticals: state.verticals.filter(v => v.id !== id) })),

            // Divisions
            addDivision: (div) => set((state) => ({ divisions: [...state.divisions, { ...div, id: generateId('d') }] })),
            updateDivision: (id, updates) => set((state) => ({ divisions: state.divisions.map(d => d.id === id ? { ...d, ...updates } : d) })),
            deleteDivision: (id) => set((state) => ({ divisions: state.divisions.filter(d => d.id !== id) })),
        }),
        {
            name: 'orgchart-data-storage', // Saves to localStorage
        }
    )
);
