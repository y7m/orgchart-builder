import { describe, expect, it } from 'vitest';
import { breakCycles, buildTreeData, getDescendantIds, ROOT_ID, wouldCreateCycle } from '../src/domain/tree';
import { deleteEmployee, reconcileSubtopics } from '../src/domain/org';
import type { Employee } from '../src/domain/types';

const e = (id: string, managerId: string | null): Employee => ({ id, name: id, title: '', managerId, divisionId: null, subtopics: [] });

describe('tree', () => {
  const org = [e('a', null), e('b', 'a'), e('c', 'b'), e('d', 'a')];

  it('detects cycles', () => {
    expect(wouldCreateCycle(org, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(org, 'b', 'b')).toBe(true);
    expect(wouldCreateCycle(org, 'c', 'd')).toBe(false);
    expect(wouldCreateCycle(org, 'a', null)).toBe(false);
  });

  it('terminates on pre-existing loops', () => {
    const loop = [e('x', 'y'), e('y', 'x'), e('z', null)];
    expect(wouldCreateCycle(loop, 'z', 'x')).toBe(true);
  });

  it('breakCycles handles self-managed and long loops in O(n)', () => {
    const n = 50000;
    const big = Array.from({ length: n }, (_, i) => e(`n${i}`, `n${(i + 1) % n}`));
    const t = performance.now();
    const { employees, cut } = breakCycles([...big, e('self', 'self')]);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(cut).toHaveLength(2);
    expect(employees.filter((x) => x.managerId === null)).toHaveLength(2);
  });

  it('descendants', () => {
    expect([...getDescendantIds(org, 'a')].sort()).toEqual(['b', 'c', 'd']);
  });

  it('virtual root only when >1 roots', () => {
    expect(buildTreeData(org).virtualRoot).toBe(false);
    const { data, virtualRoot } = buildTreeData([...org, e('z', null), e('dangling', 'missing')]);
    expect(virtualRoot).toBe(true);
    expect(data.filter((d) => d.parentId === ROOT_ID).map((d) => d.id)).toEqual(['a', 'z', 'dangling']);
  });

  it('deleteEmployee reparents reports to grandparent', () => {
    const out = deleteEmployee(org, 'b');
    expect(out.find((x) => x.id === 'c')!.managerId).toBe('a');
  });

  it('reconcileSubtopics keeps ids on reorder and rename', () => {
    const old = [{ id: '1', text: 'A' }, { id: '2', text: 'B' }];
    expect(reconcileSubtopics(old, ['b', 'A'])).toEqual([{ id: '2', text: 'b' }, { id: '1', text: 'A' }]);
    expect(reconcileSubtopics(old, ['A', 'Bee']).map((s) => s.id)).toEqual(['1', '2']);
    expect(reconcileSubtopics(old, ['A', 'B', 'C'])[2].id).not.toMatch(/^[12]$/);
  });
});
