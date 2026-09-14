/**
 * The room's "Coming up" card leads with the study, not the day.
 *
 * It used to head the card "This Tuesday · Tuesdays · 7:00pm" with the subject
 * underneath. A room's subject is what it is studying; when it meets is an
 * attribute of that. Rendered rather than source-read because what matters is
 * which text lands in the eyebrow and which in the row, and that is a fact
 * about the DOM.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1', getToken: async () => 't' }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));
vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({
    isMobileSidebar: false,
    closeDrawer: () => {},
    beginPrototypeComposeSession: () => {},
  }),
}));

/** A Tuesday, far enough out that the eyebrow reads as a weekday rather than "Today". */
const SERVICE_DATE = '2099-09-15';
const comingUp = vi.fn();
vi.mock('../../../hooks/queries/useSpaceComingUp', () => ({
  useSpaceComingUp: () => comingUp(),
}));

const PrototypeSpaceComingUp = (await import('../PrototypeSpaceComingUp')).default;

function withPlan(overrides: Record<string, unknown> = {}) {
  comingUp.mockReturnValue({
    data: {
      space: { id: 'sp_1', title: 'Romans Study Group', meetingDay: 2, meetingTime: '19:00' },
      services: [
        {
          id: 'svc_1',
          serviceDate: SERVICE_DATE,
          serviceTime: null,
          times: [],
          title: 'The Spirit of adoption',
          reference: 'Romans 8:14-16',
          seriesTitle: 'Life in the Spirit',
          viewerNoteId: null,
          starter: null,
          ...overrides,
        },
      ],
    },
  });
  return render(<PrototypeSpaceComingUp spaceId="sp_1" />);
}

describe('the study is the subject', () => {
  it('puts the run in the eyebrow and the day in the row', () => {
    const { container } = withPlan();
    const eyebrow = container.querySelector('.proto-home-section__eyebrow');
    const meta = container.querySelector('.proto-church-tools__row-meta');

    expect(eyebrow?.textContent).toBe('Life in the Spirit');
    // The day moved down here, beside the passage, with the hour attached.
    expect(meta?.textContent).toContain('Romans 8:14-16');
    expect(meta?.textContent).toContain('Tuesday');
    expect(meta?.textContent).toContain('7:00');
  });

  it('never says the weekday twice', () => {
    /*
      The old line was "This Tuesday · Tuesdays · 7:00pm" — `sermonEyebrow`
      already names the day, so the room's declared weekday only repeated it.
    */
    const { container } = withPlan();
    const text = container.textContent ?? '';
    expect(text.match(/Tuesday/g) ?? []).toHaveLength(1);
  });

  it('falls back to naming the section when the study has no run', () => {
    const { container } = withPlan({ seriesTitle: null });
    expect(container.querySelector('.proto-home-section__eyebrow')?.textContent).toBe('Coming up');
  });

  it('does not call the entry a gathering', () => {
    const { container } = withPlan();
    expect(container.innerHTML).not.toMatch(/gathering/i);
  });

  it('keeps the study title as the row it opens', () => {
    const { container } = withPlan();
    expect(container.querySelector('.proto-church-tools__row-title')?.textContent).toBe(
      'The Spirit of adoption',
    );
  });

  it('still renders nothing at all when the room has no plan', () => {
    comingUp.mockReturnValue({ data: { space: undefined, services: [] } });
    const { container } = render(<PrototypeSpaceComingUp spaceId="sp_1" />);
    expect(container.innerHTML).toBe('');
  });
});
