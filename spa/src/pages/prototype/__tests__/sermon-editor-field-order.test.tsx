/**
 * The planner form's field order, asserted against the rendered DOM.
 *
 * A source contract (`planner/__tests__/planner-study-first-contract.test.ts`)
 * holds the same line, and the two catch different things: that one survives a
 * refactor that moves the JSX, this one catches a conditional that renders the
 * right fields in the wrong place — or not at all. Order is invisible to types
 * and to any query that finds a field by its label.
 *
 * A room decides what it is going to *study*; when it meets is an attribute of
 * that. The form used to open with five time controls above the title.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1', getToken: async () => 't' }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));

const noopActions = { mutate: () => {}, mutateAsync: async () => ({}), isPending: false };
vi.mock('../../../hooks/queries/useChurchTeachingPlan', () => ({
  useChurchSermonActions: () => noopActions,
}));
vi.mock('../../../hooks/queries/useChurchSpacePlan', () => ({
  useChurchSpaceSermonActions: () => noopActions,
}));
vi.mock('../../../hooks/queries/useNoteTemplates', () => ({ useNoteTemplates: () => ({ data: [] }) }));
vi.mock('../../../hooks/queries/useNotesByReference', () => ({
  useNotesByReference: () => ({ data: null }),
}));
vi.mock('../../../hooks/usePrototypeHomeSpaceId', () => ({
  usePrototypeHomeSpaceId: () => 'space_home',
}));

const PrototypeSermonEditorFields = (await import('../PrototypeSermonEditorFields')).default;

/** Document order of the first element matching each selector. */
function orderOf(container: HTMLElement, selectors: string[]): number[] {
  const all = [...container.querySelectorAll<HTMLElement>('*')];
  return selectors.map((sel) => all.findIndex((el) => el.matches(sel)));
}

const base = {
  orgId: 'org_1',
  service: null,
  series: [],
  active: true,
  onDone: () => {},
  canWrite: true,
};

describe('a room’s plan asks what before when', () => {
  it('renders title, passage and series above the When control', () => {
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
      />,
    );
    const [title, reference, series, when] = orderOf(container, [
      '#proto-service-title',
      '#proto-service-reference',
      '#proto-service-series',
      '.proto-service-editor__date-chip',
    ]);
    for (const i of [title, reference, series, when]) expect(i).toBeGreaterThan(-1);
    expect(title).toBeLessThan(reference);
    expect(reference).toBeLessThan(series);
    expect(series).toBeLessThan(when);
  });

  it('names the entry a study, never a gathering', () => {
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
      />,
    );
    expect(container.textContent).not.toMatch(/gathering/i);
    expect(screen.getByPlaceholderText('Study title')).toBeTruthy();
  });

  it('summarises the room’s hour too, so the closed chip answers “when”', () => {
    /*
      The hour is never written to the row — every space lane stores
      `serviceTime: null` — but the room's card says "This Tuesday · 7:00 PM",
      and a chip that dropped it made the two surfaces disagree.
    */
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
        rhythm={{ meetingDay: 2, intervalDays: 7, meetingTime: '19:00' }}
      />,
    );
    const chip = container.querySelector('.proto-service-editor__date-chip');
    expect(chip?.textContent).toContain('Sep');
    expect(chip?.textContent).toMatch(/7:00/);
    // Still not offered as an editable field, because the server discards it.
    expect(container.querySelector('#proto-service-time')).toBeNull();
  });

  it('keeps When collapsed, summarising the date it already has', () => {
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
      />,
    );
    const chip = container.querySelector('.proto-service-editor__date-chip');
    expect(chip?.getAttribute('aria-expanded')).toBe('false');
    // The summary is the value, so the collapsed state still answers "when".
    expect(chip?.textContent).toContain('Sep');
    // And the calendar is not occupying the form while collapsed.
    expect(container.querySelector('.proto-date-picker')).toBeNull();
  });

  it('never offers a one-off time, which the space routes discard', () => {
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
      />,
    );
    expect(container.querySelector('#proto-service-time')).toBeNull();
  });

  it('offers a run length on create, defaulting to a single week', () => {
    render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate="2026-09-15"
      />,
    );
    expect(screen.getByText('Just this week')).toBeTruthy();
  });

  it('offers no run length for an undated idea', () => {
    render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId="space_room"
        planKind="gathering"
        createDefaultDate={null}
        allowNullDate
      />,
    );
    expect(screen.queryByText('Just this week')).toBeNull();
  });
});

describe('the church’s own plan keeps its date in front of it', () => {
  it('opens the When section, because the slots to tick live inside it', () => {
    const { container } = render(
      <PrototypeSermonEditorFields
        {...base}
        planSpaceId={null}
        serviceTimes={[
          { id: 'st_1', dayOfWeek: 2, startTime: '10:45', label: 'Morning' },
        ]}
        createDefaultDate="2026-09-15"
      />,
    );
    const chip = container.querySelector('.proto-service-editor__date-chip');
    expect(chip?.getAttribute('aria-expanded')).toBe('true');
    // 2026-09-15 is a Tuesday, so the Tuesday slot is offered.
    expect(screen.getByText(/Morning/)).toBeTruthy();
  });

  it('still calls the entry a sermon', () => {
    render(
      <PrototypeSermonEditorFields {...base} planSpaceId={null} createDefaultDate="2026-09-15" />,
    );
    expect(screen.getByPlaceholderText('Sermon title')).toBeTruthy();
  });
});
