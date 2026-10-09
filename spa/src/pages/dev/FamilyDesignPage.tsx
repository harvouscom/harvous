/**
 * Dev-only demo of Family Accounts: one household with a child in it, seen three ways.
 * Open http://localhost:<port>/__dev/family-design while `npm run dev` runs.
 *
 * Each column is the real Settings › Family screen (`FamilyView`) inside a
 * `FamilyDemoContext`, so the family hooks read progress from the fixture and every button is
 * a no-op that says what it would have done — nothing here can reach a real family. The
 * controls step Kit's request to become an adult member through each state, and pause the
 * family the way Harvous support would.
 */
import { useMemo, useState } from 'react';
import '../../styles/prototype-shell.css';
import '../../styles/prototype-components.css';
import { toast } from '@/utils/toast';
import { FamilyDemoContext, type FamilyDemo } from '../../hooks/queries/family-demo';
import type { FamilyMember, FamilyProgressEntry, FamilyRoleRequest } from '../../hooks/queries/useFamily';
import { FamilyView, type InFamily } from '../prototype/settings/PrototypeFamilyPage';

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

type RequestState = 'none' | 'waiting' | 'waiting-14' | 'declined' | 'reviewing';

const REQUEST_STATES: { key: RequestState; label: string }[] = [
  { key: 'none', label: 'Hasn’t asked' },
  { key: 'waiting', label: 'Asked 3 days ago' },
  { key: 'waiting-14', label: 'No answer in 15 days' },
  { key: 'declined', label: 'Parent said not now' },
  { key: 'reviewing', label: 'Harvous reviewing' },
];

const MEMBERS: FamilyMember[] = [
  { userId: 'u_derek', role: 'parent', isOwner: true, isMe: false, displayName: 'Derek J.', profileImageUrl: null, userColor: 'blue', covered: true, joinedAt: iso(30) },
  { userId: 'u_sam', role: 'parent', isOwner: false, isMe: false, displayName: 'Sam J.', profileImageUrl: null, userColor: 'green', covered: true, joinedAt: iso(29) },
  { userId: 'u_kit', role: 'child', isOwner: false, isMe: false, displayName: 'Kit J.', profileImageUrl: null, userColor: 'purple', covered: true, joinedAt: iso(28) },
  { userId: 'u_ruth', role: 'adult', isOwner: false, isMe: false, displayName: 'Ruth J.', profileImageUrl: null, userColor: 'orange', covered: true, joinedAt: iso(20) },
];

const KIT_PROGRESS: FamilyProgressEntry = {
  userId: 'u_kit',
  displayName: 'Kit J.',
  lastActive: 'week',
  chaptersRead: 11,
  booksRead: ['Psalms', 'Mark', 'Romans'],
  notesWritten: 4,
};

function kitRequest(state: RequestState): FamilyRoleRequest | null {
  const base = { id: 'freq_demo', userId: 'u_kit', displayName: 'Kit J.', toRole: 'adult' as const, decidedVia: null };
  switch (state) {
    case 'none':
      return null;
    case 'waiting':
      return { ...base, status: 'pending', createdAt: iso(3), decidedAt: null, escalatedAt: null, askAgainAt: null, escalationOpensAt: new Date(Date.now() + 11 * DAY).toISOString() };
    case 'waiting-14':
      return { ...base, status: 'pending', createdAt: iso(15), decidedAt: null, escalatedAt: null, askAgainAt: null, escalationOpensAt: iso(1) };
    case 'declined':
      return { ...base, status: 'declined', createdAt: iso(5), decidedAt: iso(2), decidedVia: 'parent', escalatedAt: null, askAgainAt: new Date(Date.now() + 28 * DAY).toISOString(), escalationOpensAt: iso(2) };
    case 'reviewing':
      return { ...base, status: 'pending', createdAt: iso(16), decidedAt: null, escalatedAt: iso(1), askAgainAt: null, escalationOpensAt: null };
  }
}

function familyFor(me: string, state: RequestState, frozen: boolean): InFamily {
  const viewer = MEMBERS.find((m) => m.userId === me)!;
  const request = kitRequest(state);
  const isParent = viewer.role === 'parent';
  return {
    family: {
      id: 'fam_demo',
      name: 'Johnson',
      spaceId: 'space_demo',
      spaceAvailable: true,
      ownerUserId: 'u_derek',
      ownerFirstName: 'Derek',
      sponsoring: true,
      frozen,
      members: MEMBERS.map((m) => ({ ...m, isMe: m.userId === me })),
      invites: isParent
        ? [{ id: 'finv_demo', role: 'child', label: 'for Tyler', url: 'https://app.harvous.com/family/join/demo', expiresAt: new Date(Date.now() + 5 * DAY).toISOString(), createdAt: iso(2) }]
        : [],
      // Parents see pending requests; the child sees their own latest; adults see none.
      requests: isParent
        ? request && request.status === 'pending'
          ? [request]
          : []
        : viewer.role === 'child' && request
          ? [request]
          : [],
    },
    me: { userId: me, role: viewer.role, isOwner: viewer.isOwner, hasOwnPlus: false },
    maxMembers: 6,
  };
}

function Panel({ title, note, me, state, frozen }: { title: string; note: string; me: string; state: RequestState; frozen: boolean }) {
  const demo = useMemo<FamilyDemo>(
    () => ({
      id: `${me}-${state}-${frozen}`,
      // The progress endpoint's rule: parents get the children, a child gets themself, adults nothing.
      progress: me === 'u_ruth' ? [] : [KIT_PROGRESS],
      onAction: (label) => toast.info(`Demo: “${label}” would happen here. Nothing was changed.`),
    }),
    [me, state, frozen],
  );
  const data = familyFor(me, state, frozen);
  return (
    <div className="dev-family__col">
      <p className="pds-caption dev-col-label">{title}</p>
      <p className="pds-caption dev-family__note">{note}</p>
      <div className="dev-family__pane">
        <FamilyDemoContext.Provider value={demo}>
          {/* Keyed so each state starts on the main screen, not a leftover sub-screen. */}
          <FamilyView key={demo.id} data={data} />
        </FamilyDemoContext.Provider>
      </div>
    </div>
  );
}

export default function FamilyDesignPage() {
  const [state, setState] = useState<RequestState>('waiting');
  const [frozen, setFrozen] = useState(false);
  return (
    <div className="proto-theme dev-family">
      <style>{DEV_CSS}</style>
      <header className="dev-family__header">
        <h1 className="pds-list-title">Family Accounts — what each person sees</h1>
        <p className="pds-caption">
          The Johnson family: Derek (owner, pays for Plus), Sam (parent), Kit (child, 15) and Ruth (adult member). The real
          Settings › Family screen in each column. Fixture data; buttons do nothing but say what they would do.
        </p>
        <div className="dev-family__controls">
          <span className="pds-caption dev-col-label" style={{ margin: 0 }}>Kit’s request</span>
          <div className="proto-chip-bar" role="tablist" aria-label="Kit's request">
            {REQUEST_STATES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={state === s.key}
                className={`proto-chip${state === s.key ? ' proto-chip--selected' : ''}`}
                onClick={() => setState(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="pds-caption dev-family__toggle">
            <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} /> Paused by Harvous support
          </label>
        </div>
      </header>

      <section className="dev-family__grid">
        <Panel
          title="Parent — Derek"
          note="Sees Kit’s progress (counts and book names), answers Kit’s request, invites and arranges the family."
          me="u_derek"
          state={state}
          frozen={frozen}
        />
        <Panel
          title="Child — Kit"
          note="Sees exactly what parents see about them. Asks to become an adult member; can always leave."
          me="u_kit"
          state={state}
          frozen={frozen}
        />
        <Panel
          title="Adult member — Ruth"
          note="Shares the Family Space and the plan. Sees no one’s progress, and no one sees hers."
          me="u_ruth"
          state={state}
          frozen={frozen}
        />
      </section>
    </div>
  );
}

const DEV_CSS = `
.dev-family { min-height: 100vh; padding: 40px 24px 64px; background: var(--pds-bg-page); color: var(--pds-text-primary); box-sizing: border-box; }
.dev-family__header { max-width: 1500px; margin: 0 auto 24px; display: flex; flex-direction: column; gap: 8px; }
.dev-family__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 8px; }
.dev-family__toggle { display: inline-flex; align-items: center; gap: 6px; }
.dev-family__grid { max-width: 1500px; margin: 0 auto; display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
.dev-col-label { color: var(--pds-text-tertiary); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.dev-family__note { color: var(--pds-text-secondary); margin: 0 0 10px; min-height: 2.6em; }
.dev-family__pane { background: var(--pds-bg-surface, var(--pds-paper-sheet)); border: 0.5px solid var(--pds-border); border-radius: 16px; overflow: hidden; }
`;
