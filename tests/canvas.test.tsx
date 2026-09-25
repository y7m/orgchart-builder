import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Canvas from '../src/components/Canvas';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { useOrgStore } from '../src/store/useOrgStore';

describe('Canvas', () => {
  it('renders cards for a valid tree', () => {
    useOrgStore.getState().resetToDefault();
    render(<Canvas />);
    expect(screen.getByText('Employee One')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a virtual root for multiple top-level people', () => {
    useOrgStore.setState({
      employees: [
        { id: 'a', name: 'Alpha', title: '', managerId: null, divisionId: null, subtopics: [] },
        { id: 'b', name: 'Beta', title: '', managerId: null, divisionId: null, subtopics: [] },
      ],
    });
    render(<Canvas />);
    expect(screen.getByTestId('virtual-root')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows error state with reset when stratify fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Corrupt data bypassing store validation: duplicate id referenced as manager
    useOrgStore.setState({
      employees: [
        { id: 'a', name: 'Alpha', title: '', managerId: null, divisionId: null, subtopics: [] },
        { id: 'a', name: 'Alpha2', title: '', managerId: null, divisionId: null, subtopics: [] },
        { id: 'b', name: 'Beta', title: '', managerId: 'a', divisionId: null, subtopics: [] },
      ],
    });
    render(<Canvas />);
    expect(screen.getByRole('alert')).toHaveTextContent(/ambiguous/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reset data' }));
    expect(useOrgStore.getState().employees.map((e) => e.id)).toContain('e1');
  });
});

describe('ErrorBoundary', () => {
  it('shows fallback instead of blank', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Bomb = () => { throw new Error('kaboom'); };
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom');
    expect(screen.getByRole('button', { name: 'Reset data' })).toBeInTheDocument();
  });
});
