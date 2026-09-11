/**
 * Folding a Home lane behind a "N more" bar.
 *
 * The rule worth protecting is *what gets counted*. A section's children are
 * heterogeneous JSX that each decide their own visibility — the daily passage on
 * whether there is one, the import row on a dismissal, the Thread suggestion on
 * its own queries — so a `.slice()` over `children` would fold away rows that
 * never rendered and offer "3 more" over a list with nothing hidden under it.
 * The count comes from the DOM instead, which is the same after-the-fact
 * reasoning the section's empty-group `:has()` rule already uses.
 *
 * Asserted on the fold *class* rather than computed display: the rule that acts
 * on it lives in `prototype-components.css`, which jsdom never loads.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import PrototypeHomeSection from '../PrototypeHomeSection';

const FOLDED = 'proto-home-section__row--folded';

function Row({ label }: { label: string }) {
  return <div className="proto-list-panel__row">{label}</div>;
}

/** A child that declines to render, exactly as the real ones do. */
function Absent() {
  return null;
}

function rows(container: HTMLElement) {
  return [...container.querySelectorAll('.proto-list-panel__row')];
}

function foldedCount(container: HTMLElement) {
  return rows(container).filter((el) => el.classList.contains(FOLDED)).length;
}

describe('PrototypeHomeSection folding', () => {
  it('does not fold, or offer a bar, when the rows fit', () => {
    const { container } = render(
      <PrototypeHomeSection title="Suggested" foldAfter={5}>
        <Row label="one" />
        <Row label="two" />
      </PrototypeHomeSection>,
    );
    expect(rows(container)).toHaveLength(2);
    expect(foldedCount(container)).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('folds the overflow and names how many are under the bar', () => {
    const { container } = render(
      <PrototypeHomeSection title="Suggested" foldAfter={5}>
        {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => (
          <Row key={k} label={k} />
        ))}
      </PrototypeHomeSection>,
    );
    expect(rows(container)).toHaveLength(7);
    expect(foldedCount(container)).toBe(2);
    expect(screen.getByRole('button', { name: /2 more/ })).toBeTruthy();
  });

  /*
   * The reason this counts the DOM. Eight children, three of which render
   * nothing: a reader sees five rows, so nothing should be folded and no bar
   * should appear. Slicing `children` would have hidden three of the five.
   */
  it('counts rendered rows, not children that declined to render', () => {
    const { container } = render(
      <PrototypeHomeSection title="Suggested" foldAfter={5}>
        <Row label="a" />
        <Absent />
        <Row label="b" />
        <Absent />
        <Row label="c" />
        <Row label="d" />
        <Absent />
        <Row label="e" />
      </PrototypeHomeSection>,
    );
    expect(rows(container)).toHaveLength(5);
    expect(foldedCount(container)).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens and closes again, and the bar says which it will do', () => {
    const { container } = render(
      <PrototypeHomeSection title="Suggested" foldAfter={5}>
        {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => (
          <Row key={k} label={k} />
        ))}
      </PrototypeHomeSection>,
    );
    const bar = () => screen.getByRole('button');

    expect(bar().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bar());
    expect(foldedCount(container)).toBe(0);
    expect(bar().getAttribute('aria-expanded')).toBe('true');
    // The bar has to survive expanding, or there is no way back.
    expect(bar().textContent).toContain('See less');

    fireEvent.click(bar());
    expect(foldedCount(container)).toBe(2);
    expect(bar().textContent).toContain('2 more');
  });

  it('leaves a section alone when no fold was asked for', () => {
    const { container } = render(
      <PrototypeHomeSection title="Continue">
        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => (
          <Row key={k} label={k} />
        ))}
      </PrototypeHomeSection>,
    );
    expect(foldedCount(container)).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
