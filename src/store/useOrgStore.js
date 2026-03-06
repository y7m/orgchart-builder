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

            // Mass Import Logic
            massImportEmployees: (importedList) => {
                const state = get();
                let nextEmployees = [...state.employees];
                let nextDivisions = [...state.divisions];
                let nextVerticals = [...state.verticals];

                const existingRoot = nextEmployees.find(e => !e.managerId);
                const mappingDict = {}; // lookup by extId or Name

                // Pre-populate mapping with existing employees
                nextEmployees.forEach(e => {
                    mappingDict[e.name.trim().toLowerCase()] = e.id;
                    if (e.extId) mappingDict[e.extId] = e.id;
                });

                // Phase 1: Generate Internal IDs and Map Entities
                const newRecords = importedList.map(row => {
                    const internalId = generateId('e');
                    const normalizedName = (row.name || '').trim();

                    if (row.extId) mappingDict[row.extId] = internalId;
                    if (normalizedName) mappingDict[normalizedName.toLowerCase()] = internalId;

                    return { ...row, internalId, normalizedName };
                });

                // Phase 2: Process Divisions and Verticals, then create Employee objects
                newRecords.forEach(row => {
                    // 1. Division Mapping
                    let resolvedDivisionId = null;
                    if (row.division) {
                        const divName = row.division.trim();
                        let existingDiv = nextDivisions.find(d => d.name.toLowerCase() === divName.toLowerCase());
                        if (!existingDiv) {
                            existingDiv = { id: generateId('d'), name: divName, color: '#94a3b8' }; // Default generic color
                            nextDivisions.push(existingDiv);
                        }
                        resolvedDivisionId = existingDiv.id;
                    }

                    // 2. Verticals/Subtopics Mapping
                    let resolvedSubtopics = [];
                    if (row.subtopics) {
                        const topics = row.subtopics.split(',').map(t => t.trim()).filter(Boolean);
                        topics.forEach(tName => {
                            // Find any vertical that has a subtopic matching this name exactly
                            let foundId = null;
                            for (let v of nextVerticals) {
                                const match = v.subtopics.find(s => s.text.toLowerCase() === tName.toLowerCase());
                                if (match) {
                                    foundId = match.id;
                                    break;
                                }
                            }
                            if (!foundId) {
                                // Missing: Put it in a generic "Imported Terms" vertical
                                let fallbackVert = nextVerticals.find(v => v.name === 'Imported Tags');
                                if (!fallbackVert) {
                                    fallbackVert = { id: generateId('v'), name: 'Imported Tags', color: '#64748b', subtopics: [] };
                                    nextVerticals.push(fallbackVert);
                                }
                                const newSubId = generateId('s');
                                fallbackVert.subtopics.push({ id: newSubId, text: tName });
                                foundId = newSubId;
                            }
                            resolvedSubtopics.push(foundId);
                        });
                    }

                    // 3. Manager Mapping
                    let resolvedManagerId = null;
                    if (row.manager) {
                        // Could be an extId or a Name
                        const mgrKey = String(row.manager).trim().toLowerCase();
                        if (mappingDict[mgrKey]) {
                            resolvedManagerId = mappingDict[mgrKey];
                        }
                    }

                    // Fallback to root (if someone existing is root) when no manager resolved, unless this person themselves is meant to be root
                    // For logic simplicity: if there's already a root, force everyone else to have a manager. We point them to root.
                    if (!resolvedManagerId && existingRoot) {
                        resolvedManagerId = existingRoot.id;
                    }

                    const newEmployeeEntity = {
                        id: row.internalId,
                        extId: row.extId || null,
                        name: row.normalizedName || 'Unknown Employee',
                        title: (row.title || '').trim(),
                        managerId: resolvedManagerId,
                        divisionId: resolvedDivisionId,
                        pic: '',
                        subtopics: resolvedSubtopics
                    };
                    nextEmployees.push(newEmployeeEntity);
                });

                // Phase 3: Cycle Prevention Sweep
                // It is possible the user imported circular managers. Walk and break them by forcing them to root.
                nextEmployees = nextEmployees.map(emp => {
                    if (emp.managerId && formsCycle(nextEmployees, emp.managerId, emp.id)) {
                        console.warn(`Cycle broken for ${emp.name} during mass import.`);
                        return { ...emp, managerId: existingRoot ? existingRoot.id : null };
                    }
                    return emp;
                });

                set({ employees: nextEmployees, divisions: nextDivisions, verticals: nextVerticals });
            }
        }),
        {
            name: 'orgchart-data-storage', // Saves to localStorage
        }
    )
);
