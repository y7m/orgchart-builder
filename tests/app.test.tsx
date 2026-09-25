import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { useOrgStore } from '../src/store/useOrgStore';

describe('App smoke', () => {
  it('renders chart, deletes an employee via confirm', () => {
    useOrgStore.getState().resetToDefault();
    render(<App />);
    expect(screen.getByText('Employee Four')).toBeInTheDocument();
    act(() => useOrgStore.getState().openModal('confirmDeleteEmp', 'e2'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.queryByText('Employee Two')).toBeNull();
    expect(useOrgStore.getState().employees.find((e) => e.id === 'e6')!.managerId).toBe('e1');
  });

  it('blocks deleting the sole root with an error', () => {
    useOrgStore.getState().resetToDefault();
    render(<App />);
    act(() => useOrgStore.getState().openModal('confirmDeleteEmp', 'e1'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/only top-level/);
    expect(useOrgStore.getState().employees).toHaveLength(4);
  });
});
