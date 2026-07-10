import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PrototypeBanner from '../PrototypeBanner';
import PrototypeSectionHeader from '../PrototypeSectionHeader';
import PrototypeListRow from '../PrototypeListRow';
import PrototypeListEmptyState from '../../PrototypeListEmptyState';

describe('PrototypeSectionHeader', () => {
  it('renders inspector variant with section header class', () => {
    render(<PrototypeSectionHeader>Info</PrototypeSectionHeader>);
    const el = screen.getByText('Info');
    expect(el.className).toContain('pds-section-header');
    expect(el).toHaveAttribute('data-variant', 'inspector');
  });

  it('supports search variant', () => {
    render(
      <PrototypeSectionHeader variant="search">Results</PrototypeSectionHeader>,
    );
    expect(screen.getByText('Results')).toHaveAttribute('data-variant', 'search');
  });
});

describe('PrototypeBanner (deprecated)', () => {
  it('still renders for residual imports', () => {
    const { rerender } = render(<PrototypeBanner tone="info" title="Read-only" />);
    expect(screen.getByRole('status')).toHaveTextContent('Read-only');

    rerender(<PrototypeBanner tone="destructive" title="Delete forever" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Delete forever');
  });
});

describe('PrototypeListRow', () => {
  it('renders title and preview and handles click', () => {
    const onClick = vi.fn();
    render(
      <ul>
        <PrototypeListRow title="Romans" preview="Chapter notes" timestamp="2h" onClick={onClick} />
      </ul>,
    );
    expect(screen.getByText('Romans')).toBeInTheDocument();
    expect(screen.getByText('Chapter notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('PrototypeListEmptyState', () => {
  it('exposes status role', () => {
    render(<PrototypeListEmptyState iconName="note-sticky" title="No notes yet" />);
    expect(screen.getByRole('status')).toHaveTextContent('No notes yet');
  });
});
