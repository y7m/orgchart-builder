import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { EmployeeModal } from '../src/components/Modals';
import { useOrgStore } from '../src/store/useOrgStore';

describe('EmployeeModal', () => {
  it('manager dropdown excludes self and descendants', () => {
    useOrgStore.getState().resetToDefault();
    useOrgStore.setState({ editingId: 'e2' }); // e2 manages e6
    render(<EmployeeModal onClose={() => {}} />);
    const options = within(screen.getByRole('combobox', { name: /manager/i })).getAllByRole('option').map((o) => o.textContent);
    expect(options.some((o) => o?.startsWith('Employee One'))).toBe(true);
    expect(options.some((o) => o?.startsWith('Employee Two'))).toBe(false);
    expect(options.some((o) => o?.startsWith('Employee Four'))).toBe(false);
  });

  it('delete button opens confirm', () => {
    useOrgStore.getState().resetToDefault();
    useOrgStore.setState({ editingId: 'e2', activeModal: 'employee' });
    render(<EmployeeModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useOrgStore.getState().activeModal).toBe('confirmDeleteEmp');
    expect(useOrgStore.getState().editingId).toBe('e2');
  });
});
