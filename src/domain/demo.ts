import type { Division, Employee, Vertical } from './types';

export const demoVerticals: Vertical[] = [
  { id: 'v1', name: 'Placeholder Vertical', color: '#40e0d0', subtopics: [{ id: 'v1_1', text: 'Topic A' }, { id: 'v1_2', text: 'Topic B' }] },
  { id: 'v2', name: 'Another Vertical', color: '#1877f2', subtopics: [{ id: 'v2_1', text: 'Topic C' }, { id: 'v2_3', text: 'Topic D' }] },
];

export const demoDivisions: Division[] = [
  { id: 'd1', name: 'Division A', color: '#a855f7' },
  { id: 'd2', name: 'Division B', color: '#f97316' },
  { id: 'd3', name: 'Division C', color: '#475569' },
];

export const demoEmployees: Employee[] = [
  { id: 'e1', name: 'Employee One', title: 'Director', managerId: null, divisionId: 'd3', pic: '', subtopics: [], source: 'demo' },
  { id: 'e2', name: 'Employee Two', title: 'Manager', managerId: 'e1', divisionId: 'd1', pic: '', subtopics: ['v2_1', 'v2_3'], source: 'demo' },
  { id: 'e3', name: 'Employee Three', title: 'Manager', managerId: 'e1', divisionId: 'd3', pic: '', subtopics: ['v1_1', 'v1_2'], source: 'demo' },
  { id: 'e6', name: 'Employee Four', title: 'Specialist', managerId: 'e2', divisionId: 'd1', pic: '', subtopics: ['v1_2', 'v2_3'], source: 'demo' },
];
