import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProtoToolsRowList, type ProtoToolRow } from '../proto-tools-registry';

function row(overrides: Partial<ProtoToolRow> = {}): ProtoToolRow {
  return {
    key: 'planner',
    icon: 'calendar-week',
    title: 'Planner',
    meta: 'Sermons and series',
    onSelect: () => {},
    ...overrides,
  };
}

describe('ProtoToolsRowList', () => {
  it('renders the card chrome the church hub CSS targets', () => {
    const { container } = render(<ProtoToolsRowList rows={[row()]} />);

    const card = container.querySelector('.proto-church-tools');
    expect(card?.className).toContain('proto-glass-surface--panel');
    expect(container.querySelector('.proto-church-tools__row-title')?.textContent).toBe('Planner');
    // The meta column marquees rather than truncating — keep the class on.
    expect(container.querySelector('.proto-church-tools__row-meta')?.className).toContain(
      'proto-marquee-self',
    );
  });

  it('keeps rows in the order given, and only the rows given', () => {
    const { container } = render(
      <ProtoToolsRowList
        rows={[
          row(),
          row({ key: 'engagement', icon: 'chart-simple', title: 'Engagement', meta: 'How many, never who' }),
          row({ key: 'settings', icon: 'gear', title: 'Church settings', meta: 'Times and time zone' }),
        ]}
      />,
    );

    expect(
      Array.from(container.querySelectorAll('.proto-church-tools__row')).map((el) =>
        el.getAttribute('data-tool-row'),
      ),
    ).toEqual(['planner', 'engagement', 'settings']);
    expect(screen.queryByText('Staff and volunteers')).toBeNull();
  });

  it('renders an empty card when every row is gated out', () => {
    const { container } = render(<ProtoToolsRowList rows={[]} />);
    expect(container.querySelectorAll('.proto-church-tools__row')).toHaveLength(0);
  });

  it('gives leaving-the-sidebar rows the expand glyph, in-place rows the caret', () => {
    const { container } = render(
      <ProtoToolsRowList
        rows={[row(), row({ key: 'library', title: 'Resource library', chevron: 'expand' })]}
      />,
    );

    const glyphs = Array.from(container.querySelectorAll('.proto-church-tools__row-chevron svg')).map(
      (el) => el.getAttribute('data-icon') ?? el.innerHTML,
    );
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0]).not.toBe(glyphs[1]);
  });

  it('calls the row that was pressed, and no other', () => {
    const planner = vi.fn();
    const settings = vi.fn();
    render(
      <ProtoToolsRowList
        rows={[row({ onSelect: planner }), row({ key: 'settings', title: 'Church settings', onSelect: settings })]}
      />,
    );

    fireEvent.click(screen.getByText('Church settings'));
    expect(settings).toHaveBeenCalledTimes(1);
    expect(planner).not.toHaveBeenCalled();
  });

  it('renders non-row card content after the rows — the billing banner slot', () => {
    const { container } = render(
      <ProtoToolsRowList rows={[row()]}>
        <div data-testid="plan-row">Plan</div>
      </ProtoToolsRowList>,
    );

    const card = container.querySelector('.proto-church-tools');
    expect(card?.lastElementChild?.getAttribute('data-testid')).toBe('plan-row');
  });
});
