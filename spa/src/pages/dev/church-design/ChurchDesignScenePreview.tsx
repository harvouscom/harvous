/**
 * Fixture previews for the church-org design gallery — production CSS classes
 * and real components where they exist. Edit the linked files; HMR updates here.
 *
 * Admin scenes mirror shipped UI (AdminChurchesPanel). Everything marked
 * `speculative` in the registry is design exploration for unbuilt phases —
 * treat those as mockups, not as a contract.
 */
import { useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { spaceCoverFromThreadColor } from '@/utils/space-cover';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from '../../prototype/settings/SettingsShell';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
import ProtoServiceDateTile from '../../prototype/ProtoServiceDateTile';
import PublicJoinSpaceHero from '../../public/PublicJoinSpaceHero';
import PrototypePlannerBoard from '../../prototype/planner/PrototypePlannerBoard';
import PrototypePlannerCalendar from '../../prototype/planner/PrototypePlannerCalendar';
import PrototypePlannerList from '../../prototype/planner/PrototypePlannerList';
import PrototypePlannerScopeChips from '../../prototype/planner/PrototypePlannerScopeChips';
import PrototypePlannerSeries from '../../prototype/planner/PrototypePlannerSeries';
import PrototypeLibraryManagerItems from '../../prototype/library/PrototypeLibraryManagerItems';
import type { LibrarySelection } from '../../prototype/library/PrototypeExpandedLibraryManager';
import type {
  PlannerSelection,
  PlannerView,
} from '../../prototype/planner/PrototypeExpandedPlanner';
import type { TeachingPlanSermon } from '../../../hooks/queries/useChurchTeachingPlan';
import { buildSeriesAccentLookup } from '../../../lib/church-services';
import PrototypeHomeRow from '../../prototype/PrototypeHomeRow';
import type { ChurchDesignScene } from './sceneRegistry';
import '@/styles/admin-usage.css';
import '@/styles/admin-publish.css';

const FIXTURE_CHURCH = {
  name: 'Testament Made',
  orgId: 'org_3GnOjMcEV0amiCb0Xdxe67xXDAN',
  location: 'Nashville, TN',
  spaceCount: 1,
};

/** Frame that mimics the admin content column. */
function AdminChrome({ children }: { children: ReactNode }) {
  return (
    <div className="proto-theme" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          background: 'var(--pds-bg-canvas)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 16,
          padding: 20,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Phone-ish frame for congregant-facing scenes.
 *
 * Scrolls like a phone screen. The gallery shell sets `overflow: hidden` on
 * html and body, so nothing scrolls at the page level — a scene taller than
 * the stage was simply clipped. Capping the frame to the stage and letting it
 * scroll internally is also the truer preview: a real phone scrolls the
 * screen, not the page.
 */
function PhoneChrome({ children }: { children: ReactNode }) {
  return (
    <div className="proto-theme" style={{ width: 380, maxWidth: '100%', margin: '0 auto' }}>
      <div
        style={{
          background: 'var(--pds-bg-canvas)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 20,
          overflowX: 'hidden',
          overflowY: 'auto',
          minHeight: 460,
          maxHeight: 'calc(100vh - 230px)',
          // Keeps the rounded corners clipping the hero art while scrolling.
          isolation: 'isolate',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The expanded sidebar's footprint, at the width it actually gets.
 *
 * Wider than every other frame here because that is the whole point of the
 * surface — a board previewed at phone width would be a different design.
 */
function ExpandedPanelChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="proto-theme" style={{ width: '100%', maxWidth: 1040, margin: '0 auto' }}>
      <div
        className="proto-sidebar-expanded-panel"
        style={{
          // The panel's structure lives in prototype-shell.css, which this
          // gallery deliberately does not import — it previews components, not
          // the app shell. So the frame is restated here: statically placed so
          // scenes can stack, and a column flex so the body fills the height.
          position: 'static',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: 'calc(100vh - 230px)',
          minHeight: 460,
          overflow: 'hidden',
          borderRadius: 18,
          background: 'var(--pds-bg-page)',
          border: '0.5px solid var(--pds-border)',
          animation: 'none',
        }}
      >
        <div className="proto-sidebar-expanded-panel__header">
          <div className="proto-sidebar-expanded-panel__header-lead">
            <button type="button" className="proto-side-panel__action-btn" aria-label="Collapse">
              <Icon name="down-left-and-up-right-to-center" size={14} />
            </button>
            <span className="proto-sidebar-expanded-panel__title">{title}</span>
          </div>
        </div>
        <div
          className="proto-sidebar-expanded-panel__body"
          style={{ minWidth: 0, flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SpeculativeNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="pds-caption"
      style={{
        margin: '0 0 14px',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--pds-bg-sidebar)',
        color: 'var(--pds-text-secondary)',
      }}
    >
      {children}
    </p>
  );
}

// ─── Admin scenes (shipped UI) ──────────────────────────────────────────────

function AdminRegisterForm() {
  return (
    <form className="admin-publish__form" onSubmit={(e) => e.preventDefault()}>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="scene-org-id">
          Clerk organization
        </label>
        <select id="scene-org-id" className="admin-publish__select" defaultValue="">
          <option value="">Select an organization…</option>
          <option value="org_fixture">Testament Made · 1/20 staff</option>
        </select>
      </div>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="scene-church-name">
          Church name
        </label>
        <input id="scene-church-name" className="admin-publish__input" placeholder="Testament Made" readOnly />
      </div>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="scene-church-city">
          City / State / Country
        </label>
        {/* proto reset sets `* { flex-shrink: 0 }` — inputs must opt into shrinking or they overflow. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="scene-church-city"
            className="admin-publish__input"
            style={{ flex: '1 1 0', minWidth: 0 }}
            placeholder="City"
            readOnly
          />
          <input
            className="admin-publish__input"
            style={{ flex: '1 1 0', minWidth: 0 }}
            placeholder="State"
            aria-label="State"
            readOnly
          />
          <input
            className="admin-publish__input"
            style={{ flex: '1 1 0', minWidth: 0 }}
            placeholder="Country"
            aria-label="Country"
            readOnly
          />
        </div>
      </div>
      <button type="submit" className="admin-action-btn admin-action-btn--emphasis">
        Register church
      </button>
    </form>
  );
}

function AdminChurchesScene({ mode }: { mode: 'empty' | 'list' | 'expanded' }) {
  const [expanded, setExpanded] = useState(mode === 'expanded');

  return (
    <AdminChrome>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section>
          <h3>Register a church</h3>
          <p style={{ margin: '4px 0 12px', opacity: 0.75 }}>
            Create the organization in the Clerk dashboard first (staff/volunteers only, 20 seats per church —
            congregants never join the Clerk org), then pick it here.
          </p>
          <AdminRegisterForm />
        </section>

        <section>
          <h3>Churches</h3>
          {mode === 'empty' ? (
            <p className="admin-publish__empty">No churches registered yet.</p>
          ) : (
            <div className="admin-publish__space-list">
              <article className="admin-publish__space-card">
                <button
                  type="button"
                  className="admin-publish__space-header"
                  onClick={() => setExpanded((v) => !v)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  <span className="admin-publish__space-title">{FIXTURE_CHURCH.name}</span>
                  <span className="admin-publish__space-meta">
                    {FIXTURE_CHURCH.location} · {FIXTURE_CHURCH.spaceCount} space
                  </span>
                </button>
                {expanded ? (
                  <div className="admin-publish__space-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code>{FIXTURE_CHURCH.orgId}</code>
                      <button type="button" className="admin-action-btn">
                        Copy org id
                      </button>
                      <button type="button" className="admin-action-btn">
                        Sync staff
                      </button>
                      <button type="button" className="admin-action-btn">
                        Deactivate
                      </button>
                    </div>
                    <button type="button" className="admin-action-btn">
                      Create ministry channel
                    </button>
                  </div>
                ) : null}
              </article>
            </div>
          )}
        </section>
      </div>
    </AdminChrome>
  );
}

// ─── Connect scenes ─────────────────────────────────────────────────────────

function ChurchSettingsScene({ connected }: { connected: boolean }) {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      {connected ? (
        <SpeculativeNote>
          Mockup — congregant connect shipped in v2.18.0 (self-select from the Here&apos;s My Church
          directory). Multi-church memberships are still design-only.
        </SpeculativeNote>
      ) : (
        <SpeculativeNote>
          Live page: discovery fields for matching + staff “churches you help lead” from ministry channels.
          Connect and set-home shipped in v2.18.0.
        </SpeculativeNote>
      )}
      <SettingsShell>
        <SettingsIntro>
          You can belong to more than one church. Your home church is the one that appears in From your
          church on Home.
        </SettingsIntro>
        {connected ? (
          <>
            <p className="proto-caption" style={{ margin: '0 0 8px', color: 'var(--pds-text-tertiary)' }}>
              Home church
            </p>
            <SettingsGroup>
              <SettingsRow
                label="Testament Made"
                sublabel="Nashville, TN"
                leadingIcon="church"
                badge="Home"
                onClick={() => {}}
              />
              <SettingsRow
                label="From your church"
                sublabel="1 ministry channel you follow"
                value="Adult education"
                onClick={() => {}}
              />
              <SettingsRow label="Change home church" onClick={() => {}} />
              <SettingsRow label="Leave home church" destructive trailing="none" onClick={() => {}} />
            </SettingsGroup>
            <p className="proto-caption" style={{ margin: '0 0 8px', color: 'var(--pds-text-tertiary)' }}>
              Other churches
            </p>
            <SettingsGroup>
              <SettingsRow
                label="Crossroads"
                sublabel="Franklin, TN · connected"
                leadingIcon="church"
                onClick={() => {}}
              />
              <SettingsRow label="Set as home" trailing="none" onClick={() => {}} />
            </SettingsGroup>
          </>
        ) : (
          <>
            <p className="proto-caption" style={{ margin: '0 0 8px', color: 'var(--pds-text-tertiary)' }}>
              Home church
            </p>
            <SettingsGroup>
              <SettingsRow
                label="Not connected yet"
                sublabel="When you connect, that church becomes your home."
                badge="Soon"
                trailing="none"
                disabled
              />
            </SettingsGroup>
            <p className="proto-caption" style={{ margin: '0 0 8px', color: 'var(--pds-text-tertiary)' }}>
              Help us find your home church
            </p>
            <SettingsGroup>
              <SettingsRow label="Church name" value="Testament Made" onClick={() => {}} />
              <SettingsRow label="City" value="Nashville" onClick={() => {}} />
              <SettingsRow label="State" value="TN" onClick={() => {}} />
              <SettingsRow label="Country" value="United States" onClick={() => {}} />
            </SettingsGroup>
          </>
        )}
      </SettingsShell>
    </div>
  );
}

function ConnectPromptScene() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <SpeculativeNote>
        Mockup — delivered when a registered church matches the user’s free-text church fields.
      </SpeculativeNote>
      <div
        className="proto-theme proto-glass-surface"
        style={{
          borderRadius: 16,
          padding: 18,
          border: '0.5px solid var(--pds-border)',
          background: 'var(--pds-bg-canvas)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--pds-bg-sidebar)',
              flexShrink: 0,
            }}
          >
            <Icon name="church" size={18} />
          </span>
          <div style={{ flexShrink: 1, minWidth: 0 }}>
            <p className="pds-list-title" style={{ margin: 0 }}>
              Testament Made is on Harvous
            </p>
            <p className="pds-caption" style={{ margin: '4px 0 12px', color: 'var(--pds-text-secondary)' }}>
              Connect to receive the studies your church publishes. Your notes stay private — connecting only lets
              them share study with you.
            </p>
            {/* proto reset sets `* { flex-shrink: 0 }` — shrink must be opted into explicitly. */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--primary"
                style={{ flex: '1 1 0', minWidth: 0 }}
              >
                Connect
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                style={{ flex: '1 1 0', minWidth: 0 }}
              >
                Not my church
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Receive scenes ─────────────────────────────────────────────────────────

const FROM_YOUR_CHURCH_CARDS = [
  { id: 'romans-8', title: 'This Sunday — Romans 8', meta: 'Adult education · starter ready' },
  { id: 'sermon-on-the-mount', title: 'Fall study: The Sermon on the Mount', meta: 'Adult education · 6 notes' },
] as const;

function FromYourChurchScene() {
  return (
    <div>
      <SpeculativeNote>
        Mockup — Home study feed from followed ministry education channels (not a bulletin). Shipped
        in v2.18.0; renders only for a viewer who follows at least one channel.
      </SpeculativeNote>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <div className="proto-home-section">
            <p className="proto-caption proto-home-section__eyebrow">From your church</p>
            {/*
              Mirrors the shipped ChurchFeedCard exactly: a stacked list (not a
              carousel), a 28px rss orb, and the meta INSIDE row-text 2px under
              the title. The old mock used proto-home-card__meta, which carries
              `margin-top: 8px` — a gap the real card doesn't have.
            */}
            <ul className="proto-church-hub__list">
              {FROM_YOUR_CHURCH_CARDS.map((card) => (
                <li key={card.title}>
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                  >
                    <div className="proto-home-card__body">
                      <div className="proto-home-card__title-row">
                        <span className="proto-home-card__icon-orb" aria-hidden>
                          <ProtoSpaceMenuIcon color="blue" size={28} radius={8} iconName="rss" />
                        </span>
                        <div className="proto-church-hub__row-text">
                          <p className="pds-list-title proto-home-card__title">{card.title}</p>
                          <p className="proto-caption proto-church-hub__row-meta">{card.meta}</p>
                        </div>
                        <span className="proto-home-card__chevron" aria-hidden>
                          <Icon name="caret-right" size={11} />
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

function BroadcastSpaceScene() {
  return (
    <div>
      <SpeculativeNote>
        Mockup — ministry education channel (type=&apos;public&apos; + orgId). Followers read and copy; only staff
        author — no congregant compose into the channel.
      </SpeculativeNote>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <ProtoSpaceMenuIcon color="blue" size={28} />
            <div>
              <p className="pds-list-title" style={{ margin: 0 }}>
                Adult education
              </p>
              <p className="pds-caption" style={{ margin: 0, color: 'var(--pds-text-secondary)' }}>
                Testament Made · following
              </p>
            </div>
          </div>
          <p
            className="pds-caption"
            style={{
              margin: '10px 0 14px',
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--pds-bg-sidebar)',
              color: 'var(--pds-text-secondary)',
            }}
          >
            <Icon name="circle-info" size={11} aria-hidden /> Keep any of this in your own words.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['This Sunday — Romans 8', 'Midweek: Psalm 23 reflections', 'Fall study kickoff'].map((title) => (
              <article
                key={title}
                style={{
                  borderRadius: 12,
                  padding: 12,
                  border: '0.5px solid var(--pds-border)',
                }}
              >
                <p className="pds-list-title" style={{ margin: 0 }}>
                  {title}
                </p>
                <p className="pds-caption" style={{ margin: '2px 0 0', color: 'var(--pds-text-secondary)' }}>
                  Pastor Derek
                </p>
              </article>
            ))}
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

/**
 * The shipped This Sunday card, in the real CSS.
 *
 * Rendered above the daily passage pill on Home so the two can be compared —
 * the whole design question here is whether two passage cards read as crowded.
 */
function ThisSundayScene() {
  return (
    <div>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          {/*
            Built from the real `PrototypeHomeRow`, not a copy of its markup.
            This scene drifted twice — once when Home moved from cards to rows,
            and again when study material was added to the card that no longer
            existed — because it was hand-rolled. Rendering the component is
            what makes "matches what shipped" a property rather than a chore.

            One panel, hairline rows: the service, then whatever ministries
            published for it, then the ministry reporting its own gathering.
            No coloured tiles — a colour would claim the sermon came from a room.
          */}
          <div className="proto-home-section proto-home-section--group">
            <p className="proto-caption proto-home-section__eyebrow">Following</p>
            <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-home-section__list">
              <PrototypeHomeRow
                icon="church"
                title="No Condemnation"
                meta={['Sunday\u2019s sermon', '10:30 AM', 'Life in the Spirit']}
              />
              <PrototypeHomeRow
                icon="rss"
                title="Romans 8 discussion guide"
                meta={['Study material', 'Students']}
              />
              <PrototypeHomeRow
                icon="rss"
                title={'Life in the Spirit \u2014 week 3'}
                meta={['Study material', 'Adult Ed']}
              />
              {/* A context reporting its own next gathering, named in the meta
                  line where the eyebrow now lives. */}
              <PrototypeHomeRow
                icon="user-group"
                title="Who You Are In Christ"
                meta={['This Wednesday \u00b7 Youth', '6:30 PM']}
              />
            </div>
          </div>

          {/* The card it has to coexist with. */}
          <div className="proto-home-section">
            <div className="proto-daily-passage-pill proto-daily-passage-pill--home">
              <div className="proto-daily-passage-pill__content">
                <p className="proto-caption proto-daily-passage-pill__eyebrow">Today&apos;s Passage</p>
                <p className="pds-list-title proto-daily-passage-pill__reference">Psalm 34:8</p>
              </div>
            </div>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

/* ISO dates, not pre-split month/day strings: the rows render through the real
   `ProtoServiceDateTile`, so the fixture feeds it what a sermon actually holds.
   The hand-written copy this replaces had drifted — no aria-label, and its two
   spans were both exposed to screen readers as loose text. */
const TEACHING_PLAN_ROWS = [
  { iso: '2026-08-09', title: 'No Condemnation', meta: 'Romans 8:1-11 · Life in the Spirit' },
  { iso: '2026-08-16', title: 'Led by the Spirit', meta: 'Romans 8:12-17 · Life in the Spirit' },
  { iso: '2026-08-23', title: 'Groaning and Glory', meta: 'No passage yet · Life in the Spirit' },
];

/* The lane below the sermons, and the reason the date is a tile: both lanes
   have to start their titles on the same edge. */
/* Dated, because the real lane draws a series with the same tile its sermons
   use — the glyph this fixture carried was replaced in production and the
   scene had drifted behind it. */
const TEACHING_PLAN_SERIES = [
  { title: 'Life in the Spirit', iso: '2026-08-09', weeks: '8 weeks · Aug 9 – Sep 27' },
  { title: 'Advent', iso: '2026-11-29', weeks: '4 weeks · Nov 29 – Dec 20' },
];

/**
 * Staff planner — the destination the hub's "Planner" row opens.
 *
 * No caret disclosure: the collapsed-footnote pattern is what the hub rework
 * retired. This is a proper view — a lane head with the one action as a glass
 * pill, and the services contained in the same card anatomy as Church tools,
 * with the date as a compact overline column where the tool icon would sit.
 */
function TeachingPlanScene({ mode }: { mode: 'list' | 'lapsed' }) {
  const lapsed = mode === 'lapsed';
  return (
    <div>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <div className="proto-home-section">
            <div className="proto-church-tools__lane-head">
              <p className="proto-caption proto-home-section__eyebrow">Planner</p>
              {lapsed ? null : (
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                >
                  <Icon name="plus" size={12} aria-hidden />
                  <span className="proto-glass-action__label">Add service</span>
                </button>
              )}
            </div>

            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {TEACHING_PLAN_ROWS.map((row) => (
                <button
                  key={row.iso}
                  type="button"
                  className="proto-church-tools__row"
                  disabled={lapsed}
                >
                  <ProtoServiceDateTile iso={row.iso} />
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">{row.title}</span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">{row.meta}</span>
                  </span>
                  <span className="proto-church-tools__row-chevron" aria-hidden>
                    <Icon name="caret-right" size={11} />
                  </span>
                </button>
              ))}

              {lapsed ? (
                <div className="proto-church-tools__row proto-church-tools__row--status">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="circle-exclamation" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    {/* Short enough not to truncate at this width — a billing
                        warning that reads "Your church plan has lap…" is worse
                        than no warning. */}
                    <span className="pds-list-title proto-church-tools__row-title">
                      Plan ended
                    </span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                      Planned services stay visible
                    </span>
                  </span>
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                  >
                    <span className="proto-glass-action__label">Renew</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* The Series lane, present so the two leading slots can be checked
                against each other — a date tile and an icon tile on one edge is
                the whole reason the date stopped being a text column. */}
            <div className="proto-church-tools__lane-head proto-church-tools__lane-head--stacked">
              <p className="proto-caption proto-home-section__eyebrow">Series</p>
            </div>
            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {TEACHING_PLAN_SERIES.map((entry) => (
                <button
                  key={entry.title}
                  type="button"
                  className="proto-church-tools__row"
                  disabled={lapsed}
                >
                  <ProtoServiceDateTile iso={entry.iso} />
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">{entry.title}</span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">{entry.weeks}</span>
                  </span>
                  <span className="proto-church-tools__row-chevron" aria-hidden>
                    <Icon name="caret-right" size={11} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

// ─── Service page (the surface a service opens into) ────────────────────────

const SERVICE_PASSAGE_HTML = `
  <p><sup>1</sup>So now there is no condemnation for those who belong to Christ Jesus.
  <sup>2</sup>And because you belong to him, the power of the life-giving Spirit has freed
  you from the power of sin that leads to death.</p>
  <p><sup>3</sup>The law of Moses was unable to save us because of the weakness of our
  sinful nature.</p>
`;

/**
 * One section of the service page.
 *
 * Buildability note: these are template headings inside ONE editor, not
 * separately-stored fields. Per-section storage would be a new data model and
 * would break "the note is canonical" — you must be able to open this note in
 * the plain editor later and see the same content.
 *
 * `prompt` is the guided-studies upgrade path: today the section source is the
 * church's org template headings; later it can be a staff-authored question,
 * with no redesign of this chrome.
 */
function ServiceSection({
  heading,
  prompt,
  body,
}: {
  heading: string;
  prompt?: string;
  body?: string;
}) {
  return (
    <section className="proto-service-page__section">
      {/* An H2 like any note heading — because in the real editor that is
          literally what it is (the org template's heading). */}
      <h2 className="proto-service-page__section-heading">{heading}</h2>
      {/*
        The prompt IS the placeholder. It used to be a third row above a
        separate "Write here…" line, which said the same thing twice and made
        every section three rows of chrome deep. One line now: their words, or
        the invitation to write them — exactly how an empty paragraph under a
        template heading behaves in TipTap.
      */}
      {body ? (
        <p className="proto-service-page__section-body">{body}</p>
      ) : (
        <p className="proto-service-page__section-placeholder">{prompt ?? 'Write here…'}</p>
      )}
    </section>
  );
}

function ServicePageScene({ mode }: { mode: 'fresh' | 'returning' | 'topical' }) {
  const topical = mode === 'topical';
  const returning = mode === 'returning';
  // The series channel's cover art — the same identity system spaces use. This
  // is what makes it a *place*: a note has no cover, no masthead, no art.
  const cover = spaceCoverFromThreadColor(topical ? 'green' : 'blue');

  return (
    <div>
      <SpeculativeNote>
        Design exploration — the surface a service opens into, instead of a blank note. Cover +
        masthead speak the space About-dialog language; the writing area is still the
        congregant&apos;s own note in My Home (same lineage, same Recall, same privacy), with
        sections as template headings inside one editor, not stored fields.
      </SpeculativeNote>
      <PhoneChrome>
        <div className="proto-service-page">
          {/* The same paper sheet a note lives on (--pds-paper-sheet + subtle
              shadow, inset from the column like proto-editor-paper). The
              church chrome is the letterhead; the writing below is the note. */}
          <div className="proto-service-page__paper">
          <div className="proto-service-page__hero">
            <PublicJoinSpaceHero space={{ color: topical ? 'green' : 'blue', cover }} />
            <p className="proto-service-page__hero-eyebrow">
              {returning ? 'Last Sunday' : 'This Sunday'}
            </p>
          </div>

          <header className="proto-service-page__masthead">
            <span className="proto-service-page__masthead-icon" aria-hidden>
              <ProtoSpaceMenuIcon
                color={topical ? 'green' : 'blue'}
                size={44}
                radius={12}
                iconName="church"
              />
            </span>
            {topical ? null : (
              <p className="proto-caption proto-service-page__series">Life in the Spirit</p>
            )}
            <h1 className="proto-service-page__title">
              {topical ? 'Carrying Each Other' : 'No Condemnation'}
            </h1>
            <p className="proto-caption proto-service-page__church">
              {topical ? 'New Hope Assembly of God' : 'Romans 8:1-11 · New Hope Assembly of God'}
            </p>
          </header>

          {topical ? null : (
            <div className="proto-service-page__passage">
              <div
                className="proto-service-page__passage-html scripture-pill-chrome__passage-html"
                dangerouslySetInnerHTML={{ __html: SERVICE_PASSAGE_HTML }}
              />
              <p className="proto-service-page__passage-credit">NLT</p>
            </div>
          )}

          {/* From here down it is simply the note, on the same paper. */}
          <div className="proto-service-page__notes">
            <div className="proto-service-page__notes-head">
              {/* The church can't see any of this — the one thing worth saying
                  here, said once. */}
              <p className="proto-caption proto-service-page__notes-label">
                <Icon name="lock" size={9} aria-hidden /> Private to you
              </p>
            </div>

            {/* Prompts are short because they render as placeholder text —
                a question mark and a full sentence read as a worksheet. */}
            <ServiceSection
              heading="Big idea"
              prompt="The one line worth keeping"
              body={returning ? 'Condemnation is a verdict, not a feeling. It has already been given.' : undefined}
            />
            <ServiceSection
              heading="Application"
              prompt="Where this lands this week"
              body={returning ? 'Stop re-litigating Tuesday.' : undefined}
            />
          </div>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

// ─── Staff scene ────────────────────────────────────────────────────────────

function StaffRolesScene() {
  return (
    <div>
      <SpeculativeNote>
        Mockup of the sync result — staff sync mirrors Clerk org members as leaders. Owner is always the space
        creator; congregant followers stay members and are never touched by sync.
      </SpeculativeNote>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <SettingsShell>
          <SettingsIntro>Adult education · Testament Made</SettingsIntro>
          <SettingsGroup>
            {/*
              Role is carried by the icon shape and the badge, not by colour.
              These three sat in sky-blue, coral-rose and grey, which read as
              three unrelated kinds of thing rather than one roster — and put
              the loudest colour on the least interesting fact. All grey now;
              the silhouettes do the work.
            */}
            <SettingsRow
              label="Derek J"
              sublabel="Space owner · staff"
              leadingIcon="id-card-clip"
              badge="Owner"
              trailing="none"
            />
            <SettingsRow
              label="Hannah P"
              sublabel="Synced from Clerk org"
              leadingIcon="book-open-reader"
              badge="Leader"
              trailing="none"
            />
            <SettingsRow
              label="248 following"
              sublabel="They read and keep their own notes"
              leadingIcon="user-group"
              badge="Members"
              trailing="none"
            />
          </SettingsGroup>
        </SettingsShell>
      </div>
    </div>
  );
}

// ─── Reworked hub ───────────────────────────────────────────────────────────

function HubChannelRow({
  title,
  meta,
  unseen,
}: {
  title: string;
  meta: string;
  unseen?: number;
}) {
  return (
    <li>
      <button
        type="button"
        className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      >
        <div className="proto-home-card__body">
          <div className="proto-home-card__title-row">
            <span className="proto-home-card__icon-orb" aria-hidden>
              <ProtoSpaceMenuIcon color="paper" size={28} radius={8} iconName="rss" />
              {unseen ? <span className="proto-space-switcher-dot" aria-hidden /> : null}
            </span>
            <div className="proto-church-hub__row-text">
              <p className="pds-list-title proto-home-card__title">{title}</p>
              <p className="proto-caption proto-church-hub__row-meta">{meta}</p>
            </div>
            {unseen ? <span className="proto-space-switcher-badge">{unseen}</span> : null}
            <span className="proto-home-card__chevron" aria-hidden>
              <Icon name="caret-right" size={11} />
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

/** Church identity header — same shape as the shipped hub. */
function HubHeader() {
  return (
    <div className="proto-shared-space-header">
      <div className="proto-shared-space-header__row">
        <span className="proto-shared-space-header__church-icon" aria-hidden>
          <Icon name="church" size={18} />
        </span>
        <div className="proto-shared-space-header__meta">
          <div className="pds-list-title proto-shared-space-header__title">
            New Hope Assembly of God
          </div>
          <p className="proto-caption proto-shared-space-header__location">Urbandale, IA</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Congregant hub — the catalog, and nothing else.
 *
 * The point of a separate scene: verify this view stands alone with zero staff
 * chrome. Anything a congregant cannot act on has no business here.
 */
function HubCongregantScene() {
  return (
    <div>
      <SpeculativeNote>
        Design exploration — congregant view. This Sunday leads (it is the appointment);
        channels are the catalog. No plan banner, no teaching plan, no team.
      </SpeculativeNote>
      <PhoneChrome>
        <div className="proto-church-hub">
          <HubHeader />
          <div className="proto-home-view" style={{ padding: '4px 14px 18px' }}>
            <div className="proto-home-section">
                {/* Nothing attached — the common case, and it renders exactly
                    the card that existed before study material had a home. */}
                <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--split proto-this-sunday">
                <div className="proto-this-sunday__main proto-home-card--tappable">
                <p className="proto-caption proto-home-card__eyebrow">Sunday&rsquo;s sermon</p>
                <div className="proto-home-card__body">
                  <div className="proto-home-card__title-row">
                    <span className="proto-home-card__icon-orb" aria-hidden>
                      <Icon name="church" size={13} />
                    </span>
                    <p className="pds-list-title proto-home-card__title">No Condemnation</p>
                    <span className="proto-home-card__chevron" aria-hidden>
                      <Icon name="caret-right" size={11} />
                    </span>
                  </div>
                  <div className="proto-home-card__meta">
                    <span className="proto-home-card__meta-item">Life in the Spirit</span>
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Following</p>
              <ul className="proto-church-hub__list">
                <HubChannelRow title="Youth" meta="Weekly · 2 days ago" unseen={2} />
                <HubChannelRow title="Adult education" meta="Weekly · last week" />
              </ul>
            </div>

            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Discover</p>
              <ul className="proto-church-hub__list">
                <li>
                  <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-church-hub__browse-row">
                    <div className="proto-home-card__body">
                      <div className="proto-home-card__title-row">
                        <span className="proto-home-card__icon-orb" aria-hidden>
                          <ProtoSpaceMenuIcon color="paper" size={28} radius={8} iconName="rss" />
                        </span>
                        <div className="proto-church-hub__row-text">
                          <p className="pds-list-title proto-home-card__title">Women&apos;s study</p>
                          <p className="proto-caption proto-church-hub__row-meta">Every other week</p>
                        </div>
                        {/* Same control as New note — one action language everywhere. */}
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                        >
                          <Icon name="plus" size={12} aria-hidden />
                          <span className="proto-glass-action__label">Follow</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

/**
 * Staff hub — the screenshot that prompted this rework, redesigned.
 *
 * Three problems it fixes: the pilot banner was a text slab shouting at the
 * top; create actions were bare text links; and staff tooling was interleaved
 * with the congregation-facing catalog instead of grouped as its own thing.
 */
function HubStaffScene() {
  return (
    <div>
      <SpeculativeNote>
        Design exploration — staff view. The catalog reads the same as a congregant&apos;s;
        everything staff-only is grouped into &ldquo;Tools&rdquo; at the bottom, with
        plan status as a row inside it rather than a banner on top.
      </SpeculativeNote>
      <PhoneChrome>
        <div className="proto-church-hub">
          <HubHeader />
          <div className="proto-home-view" style={{ padding: '4px 14px 18px' }}>
            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Channels</p>
              <ul className="proto-church-hub__list">
                <HubChannelRow title="Youth" meta="Weekly · you publish here" />
              </ul>
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-church-tools__add"
              >
                <Icon name="plus" size={12} aria-hidden />
                <span className="proto-glass-action__label">New channel</span>
              </button>
            </div>

            {/* Empty lane: caption and action collapse into one quiet row rather
                than a heading, an apology, and a link stacked three deep. */}
            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Shared spaces</p>
              <div className="proto-church-tools__empty-row">
                <p className="proto-caption proto-church-hub__empty-lane">None yet</p>
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                >
                  <Icon name="plus" size={12} aria-hidden />
                  <span className="proto-glass-action__label">New space</span>
                </button>
              </div>
            </div>

            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Tools</p>
              <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                <button type="button" className="proto-church-tools__row">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="calendar" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">Planner</span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                      Next: Aug 9 · Romans 8:1-11
                    </span>
                  </span>
                  <span className="proto-church-tools__row-chevron" aria-hidden>
                    <Icon name="caret-right" size={11} />
                  </span>
                </button>

                <button type="button" className="proto-church-tools__row">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="user-group" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">Team</span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">1 person</span>
                  </span>
                  <span className="proto-church-tools__row-chevron" aria-hidden>
                    <Icon name="caret-right" size={11} />
                  </span>
                </button>

                {/* Plan status: a row, not a banner. Lapsed is the only state
                    that earns prominence, and it gets it by colour, not size. */}
                <div className="proto-church-tools__row proto-church-tools__row--status">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="clock" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">
                      29 days left in your pilot
                    </span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                      Congregation unaffected
                    </span>
                  </span>
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                  >
                    <span className="proto-glass-action__label">Continue</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PhoneChrome>
    </div>
  );
}

/**
 * Planner fixtures — one idea, a run of Sundays, and a midweek gathering, so
 * the board shows a populated Ideas column, a busy week, and a card whose
 * weekday differs from the plan's default service day.
 */
const PLANNER_SERVICE_TIMES = [
  { id: 'cstm_morning', dayOfWeek: 0, startTime: '09:00', label: null },
  { id: 'cstm_late', dayOfWeek: 0, startTime: '10:45', label: null },
  { id: 'cstm_midweek', dayOfWeek: 3, startTime: '18:30', label: 'Midweek' },
];

function plannerFixtures(): TeachingPlanSermon[] {
  /* Anchored to today so the board's "This week" column is never empty in the
     gallery — a fixed date would drift out of the visible weeks. */
  const today = new Date();
  const iso = (offsetDays: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nextSundayOffset = (7 - today.getDay()) % 7;
  const base = {
    serviceTime: null,
    starterTemplateId: null,
    updatedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  return [
    {
      ...base,
      id: 'svc_idea_habakkuk',
      serviceDate: null,
      serviceTimeIds: [],
      title: 'Habakkuk in a hard year',
      seriesId: null,
      seriesTitle: null,
      reference: null,
      createdAt: '2026-08-04T00:00:00.000Z',
    },
    {
      ...base,
      id: 'svc_idea_advent',
      serviceDate: null,
      serviceTimeIds: [],
      title: 'Advent — four kinds of waiting',
      seriesId: null,
      seriesTitle: null,
      reference: null,
      createdAt: '2026-08-02T00:00:00.000Z',
    },
    {
      ...base,
      id: 'svc_1',
      serviceDate: iso(nextSundayOffset),
      serviceTimeIds: ['cstm_morning', 'cstm_late'],
      title: 'No Condemnation',
      seriesId: 'csrs_spirit',
      seriesTitle: 'Life in the Spirit',
      reference: 'Romans 8:1-11',
    },
    {
      ...base,
      id: 'svc_2',
      serviceDate: iso(nextSundayOffset + 3),
      serviceTimeIds: ['cstm_midweek'],
      title: 'What the law could not do',
      seriesId: null,
      seriesTitle: null,
      reference: 'Romans 8:3',
    },
    {
      ...base,
      id: 'svc_3',
      serviceDate: iso(nextSundayOffset + 7),
      serviceTimeIds: ['cstm_morning', 'cstm_late'],
      title: 'Led by the Spirit',
      seriesId: 'csrs_spirit',
      seriesTitle: 'Life in the Spirit',
      reference: 'Romans 8:12-17',
    },
    {
      ...base,
      id: 'svc_4',
      serviceDate: iso(nextSundayOffset + 14),
      serviceTimeIds: ['cstm_morning'],
      title: 'Groaning and glory',
      seriesId: 'csrs_spirit',
      seriesTitle: 'Life in the Spirit',
      reference: 'Romans 8:18-25',
    },
    {
      ...base,
      id: 'svc_5',
      serviceDate: iso(nextSundayOffset + 21),
      serviceTimeIds: ['cstm_morning'],
      title: 'The God who waits',
      seriesId: 'csrs_advent',
      seriesTitle: 'Four kinds of waiting',
      reference: 'Isaiah 64:1-9',
    },
    {
      /* No passage yet — the placeholder card, still carrying its run. A week
         the series is holding open is exactly what the rail has to survive. */
      ...base,
      id: 'svc_6',
      serviceDate: iso(nextSundayOffset + 28),
      serviceTimeIds: ['cstm_morning'],
      title: 'Four kinds of waiting',
      seriesId: 'csrs_advent',
      seriesTitle: 'Four kinds of waiting',
      reference: null,
    },
    {
      ...base,
      id: 'svc_past',
      serviceDate: iso(nextSundayOffset - 7),
      serviceTimeIds: ['cstm_morning', 'cstm_late'],
      title: 'The Spirit of adoption',
      seriesId: 'csrs_spirit',
      seriesTitle: 'Life in the Spirit',
      reference: 'Romans 8:14-16',
    },
  ];
}

/* Two runs, two colours, and one of them left uncoloured on purpose: the
   derived accent is what every pre-existing series will actually render with,
   so the gallery has to show it beside a chosen one. */
const PLANNER_SERIES = [
  { id: 'csrs_spirit', color: 'purple' },
  { id: 'csrs_advent', color: null },
];

/** The Series view's own rows — a chosen colour beside a derived one. */
const PLANNER_SERIES_ROWS = [
  {
    id: 'csrs_spirit',
    title: 'Life in the Spirit',
    serviceCount: 4,
    color: 'purple',
    description: null,
  },
  {
    id: 'csrs_advent',
    title: 'Four kinds of waiting',
    serviceCount: 2,
    color: null,
    description: 'Advent, one posture a week',
  },
];

/* Enough channels that the switcher has to be a picker rather than a row of
   chips — the case a one-channel fixture would never show. */
/* Distinct colours and both lanes, because that is what the picker now draws:
   a channel gets the broadcast glyph, a shared space the gathering one, each on
   its own tile. A fixture of five identical entries would hide the whole thing. */
const PLANNER_CHANNELS = [
  { id: 'space_youth', title: 'Youth', color: 'orange', ministry: true },
  { id: 'space_adult_ed', title: 'Adult education', color: 'blue', ministry: true },
  { id: 'space_kids', title: 'Kids', color: 'green', ministry: true },
  { id: 'space_womens', title: "Women's Bible study", color: 'purple', ministry: false },
  { id: 'space_mens', title: "Men's breakfast", color: 'yellow', ministry: false },
];

function PlannerScene({ view, canWrite = true }: { view: PlannerView; canWrite?: boolean }) {
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [planSpaceId, setPlanSpaceId] = useState<string | null>(null);
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);
  const services = plannerFixtures();
  const accentFor = buildSeriesAccentLookup(PLANNER_SERIES);
  /* The planner views take the sentence now, not the reason code — the church
     lane's wording for a paused pilot, which is what this scene previews. */
  const readOnlyMessage = canWrite
    ? null
    : 'This plan is read-only while the church pilot is paused.';
  /* The church lane's noun. The views say "Plan a sermon" with it. */
  const plannerItemNoun = 'sermon';
  const noop = () => undefined;

  return (
    <ExpandedPanelChrome title="Planner">
      <div className="proto-planner">
        <div className="proto-planner__main">
          <div style={{ padding: '10px 14px 0' }}>
            <PrototypePlannerScopeChips
              plannableSpaces={PLANNER_CHANNELS}
              planSpaceId={planSpaceId}
              lastChannelId={lastChannelId}
              onChange={(next) => {
                setPlanSpaceId(next);
                if (next) setLastChannelId(next);
              }}
            />
          </div>
          {view === 'board' ? (
            <PrototypePlannerBoard
              services={services}
              serviceTimes={PLANNER_SERVICE_TIMES}
              accentFor={accentFor}
              canWrite={canWrite}
              readOnlyMessage={readOnlyMessage}
              defaultDay={0}
              selection={selection}
              onSelect={setSelection}
              onMove={noop}
            />
          ) : view === 'calendar' ? (
            <PrototypePlannerCalendar
              services={services}
              serviceTimes={PLANNER_SERVICE_TIMES}
              accentFor={accentFor}
              canWrite={canWrite}
              readOnlyMessage={readOnlyMessage}
              itemNoun={plannerItemNoun}
              selection={selection}
              onSelect={setSelection}
              onMoveToDate={noop}
            />
          ) : view === 'list' ? (
            <PrototypePlannerList
              services={services}
              serviceTimes={PLANNER_SERVICE_TIMES}
              accentFor={accentFor}
              canWrite={canWrite}
              readOnlyMessage={readOnlyMessage}
              itemNoun={plannerItemNoun}
              selection={selection}
              onSelect={setSelection}
            />
          ) : (
            <PrototypePlannerSeries
              series={PLANNER_SERIES_ROWS}
              services={services}
              accentFor={accentFor}
              openSeriesId={null}
              canWrite={canWrite}
              readOnlyMessage={readOnlyMessage}
              itemNoun={plannerItemNoun}
              onOpen={noop}
              onNewSeries={noop}
            />
          )}
        </div>
      </div>
    </ExpandedPanelChrome>
  );
}

/**
 * The marquee standard, at the widths that actually clip.
 *
 * Every label here is deliberately longer than its box: hovering any row, chip,
 * card, or header should slide the tail into view and ease back. Under
 * `prefers-reduced-motion: reduce` nothing moves and the ellipsis stays — that
 * fallback is the point of the scene as much as the animation is.
 */
function MarqueeScene() {
  const long = 'Wednesday Night Intergenerational Bible Study and Supper';
  const longer = 'New Hope Assembly of God of Greater Nashville';
  return (
    <PhoneChrome>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <p className="proto-caption" style={{ marginBottom: 6, opacity: 0.6 }}>
            Header (hovers itself)
          </p>
          <div className="proto-shared-space-header">
            <div className="proto-shared-space-header__row">
              <span className="proto-shared-space-header__church-icon" aria-hidden>
                <Icon name="church" size={18} />
              </span>
              <div className="proto-shared-space-header__meta">
                <p
                  className="proto-caption proto-shared-space-header__church proto-marquee"
                  title={longer}
                >
                  <span>{longer}</span>
                </p>
                <div
                  className="pds-list-title proto-shared-space-header__title proto-marquee"
                  title={long}
                >
                  <span>{long}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/*
          Both scope bars, and both inside `__header-lead` — which is the whole point.

          This scene used to render the church-hub bar alone and bare, outside that container.
          That missed the bug twice over: `__header-lead` is where the chips are `flex: 0 0 auto`
          (sized to their content), and paired mode is the shape where *every* chip is a
          marquee, so nothing holds the bar open. The gallery stayed green across 91 scenes
          while the real planner drew an empty pill.
        */}
        <div>
          <p className="proto-caption" style={{ marginBottom: 6, opacity: 0.6 }}>
            Scope chip — church hub (hovers itself)
          </p>
          <div className="proto-sidebar-expanded-panel__header-lead">
            <div className="proto-chip-bar proto-planner-scope" role="radiogroup" aria-label="Plan">
              <button type="button" role="radio" aria-checked={false} className="proto-chip">
                Church
              </button>
              <button
                type="button"
                role="radio"
                aria-checked
                className="proto-chip proto-planner-scope__channel proto-chip--selected"
              >
                <span className="proto-planner-scope__channel-name proto-marquee" title={long}>
                  <span>{long}</span>
                </span>
                <Icon name="caret-down" size={9} aria-hidden className="proto-planner-scope__caret" />
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="proto-caption" style={{ marginBottom: 6, opacity: 0.6 }}>
            Scope chip — paired room (both labels are marquees)
          </p>
          <div className="proto-sidebar-expanded-panel__header-lead">
            <div className="proto-chip-bar proto-planner-scope" role="radiogroup" aria-label="Plan">
              {[long, longer].map((title, i) => (
                <button
                  key={title}
                  type="button"
                  role="radio"
                  aria-checked={i === 0}
                  className={`proto-chip proto-planner-scope__room${i === 0 ? ' proto-chip--selected' : ''}`}
                  title={title}
                >
                  <span className="proto-planner-scope__channel-name proto-marquee">
                    <span>{title}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="proto-caption" style={{ marginBottom: 6, opacity: 0.6 }}>
            Rows (the row is the hover surface)
          </p>
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            {[long, longer].map((text) => (
              <button key={text} type="button" className="proto-church-tools__row">
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name="timeline" size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span
                    className="pds-list-title proto-church-tools__row-title proto-marquee"
                    title={text}
                  >
                    <span>{text}</span>
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">8 weeks</span>
                </span>
                <span className="proto-church-tools__row-chevron" aria-hidden>
                  <Icon name="caret-right" size={11} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="proto-caption" style={{ marginBottom: 6, opacity: 0.6 }}>
            Board card (the card is the hover surface)
          </p>
          <div style={{ width: 232 }}>
            <span className="proto-planner-card proto-marquee-hover-root">
              <span className="pds-list-title proto-planner-card__title proto-marquee" title={long}>
                <span>{long}</span>
              </span>
              <span className="proto-caption proto-planner-card__meta">
                9:00 &amp; 10:45 AM · Romans 8:1-11
              </span>
            </span>
          </div>
        </div>
      </div>
    </PhoneChrome>
  );
}

const LIBRARY_FIXTURES = [
  {
    id: 'libi_1',
    kind: 'link',
    title: 'Romans 8 — Douglas Moo commentary notes',
    description: null,
    sourceUrl: 'https://example.org/moo-romans-8',
    sourceDomain: 'example.org',
    sourceSiteName: null,
    sourceImage: null,
    fileName: null,
    fileMime: null,
    fileBytes: null,
    access: 'members' as const,
    scopes: [],
    createdByUserId: 'user_1',
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'libi_2',
    kind: 'link',
    title: 'Leader prep: handling hard questions about suffering',
    description: null,
    sourceUrl: 'https://example.org/leader-prep',
    sourceDomain: 'example.org',
    sourceSiteName: null,
    sourceImage: null,
    fileName: null,
    fileMime: null,
    fileBytes: null,
    access: 'leaders' as const,
    scopes: [{ scopeKind: 'space' as const, spaceId: 'space_youth' }],
    createdByUserId: 'user_1',
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'libi_3',
    kind: 'link',
    title: 'Advent readings for families',
    description: null,
    sourceUrl: 'https://example.org/advent',
    sourceDomain: 'example.org',
    sourceSiteName: null,
    sourceImage: null,
    fileName: null,
    fileMime: null,
    fileBytes: null,
    access: 'members' as const,
    scopes: [
      { scopeKind: 'space' as const, spaceId: 'space_youth' },
      { scopeKind: 'space' as const, spaceId: 'space_kids' },
    ],
    createdByUserId: 'user_1',
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  },
];

const LIBRARY_SPACES = [
  { id: 'space_youth', title: 'Youth', color: 'orange', ministry: true },
  { id: 'space_kids', title: 'Kids', color: 'green', ministry: true },
];

/** The catalog at the width where audience and rooms fit on the row. */
function LibraryManagerScene() {
  const [selection, setSelection] = useState<LibrarySelection>(null);
  return (
    <ExpandedPanelChrome title="Resource library">
      <div className="proto-planner">
        <div className="proto-planner__main">
          <PrototypeLibraryManagerItems
            items={LIBRARY_FIXTURES}
            canCurate
            plannableSpaces={LIBRARY_SPACES}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      </div>
    </ExpandedPanelChrome>
  );
}

/**
 * The review queue, with the "why" that makes a suggestion weighable.
 *
 * Presentational copy of the real row so the scene needs no network — the live
 * component takes an orgId and fetches.
 */
function LibrarySuggestionQueueScene() {
  const rows = [
    {
      id: 's1',
      title: 'The Bible Project — Romans overview video',
      domain: 'bibleproject.com',
      who: 'Marta Nguyen',
      when: 'yesterday',
      note: 'We watched this in small group and it landed for people who find Romans heavy.',
    },
    {
      id: 's2',
      title: 'Free Advent devotional PDF',
      domain: 'example.org',
      who: 'Dave Ellison',
      when: '3 days ago',
      note: null,
    },
  ];
  return (
    <ExpandedPanelChrome title="Resource library">
      <div className="proto-planner">
        <div className="proto-planner__main">
          <div className="proto-planner-list">
            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="proto-church-tools__row proto-church-tools__row--status proto-library-suggestion"
                >
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="inbox" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span
                      className="pds-list-title proto-church-tools__row-title proto-marquee"
                      title={row.title}
                    >
                      <span>{row.title}</span>
                    </span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                      {row.domain} · {row.who} · {row.when}
                    </span>
                    {row.note ? (
                      <span className="proto-caption proto-library-suggestion__note">
                        “{row.note}”
                      </span>
                    ) : null}
                  </span>
                  <span className="proto-library-suggestion__actions">
                    <button
                      type="button"
                      className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                    >
                      <span className="proto-glass-action__label">Add it</span>
                    </button>
                    <button type="button" className="proto-sheet-quiet-action">
                      Not now
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ExpandedPanelChrome>
  );
}

export default function ChurchDesignScenePreview({ scene }: { scene: ChurchDesignScene }) {
  switch (scene.id) {
    case '01-admin-empty':
      return <AdminChurchesScene mode="empty" />;
    case '02-admin-registered':
      return <AdminChurchesScene mode="list" />;
    case '03-admin-church-actions':
      return <AdminChurchesScene mode="expanded" />;
    case '04-settings-church-unconnected':
      return <ChurchSettingsScene connected={false} />;
    case '05-connect-prompt':
      return <ConnectPromptScene />;
    case '06-settings-church-connected':
      return <ChurchSettingsScene connected />;
    case '07-from-your-church':
      return <FromYourChurchScene />;
    case '08-broadcast-space':
      return <BroadcastSpaceScene />;
    case '09-broadcast-note':
      return <ThisSundayScene />;
    case '10-staff-roles':
      return <StaffRolesScene />;
    case '11-teaching-plan':
      return <TeachingPlanScene mode="list" />;
    case '12-teaching-plan-lapsed':
      return <TeachingPlanScene mode="lapsed" />;
    case '13-service-page':
      return <ServicePageScene mode="fresh" />;
    case '13b-service-page-returning':
      return <ServicePageScene mode="returning" />;
    case '13c-service-page-topical':
      return <ServicePageScene mode="topical" />;
    case '14-hub-congregant':
      return <HubCongregantScene />;
    case '15-hub-staff':
      return <HubStaffScene />;
    case '16-planner-board':
      return <PlannerScene view="board" />;
    case '17-planner-calendar':
      return <PlannerScene view="calendar" />;
    case '18-planner-list':
      return <PlannerScene view="list" />;
    case '18b-planner-series':
      return <PlannerScene view="series" />;
    case '19-planner-board-readonly':
      return <PlannerScene view="board" canWrite={false} />;
    case '20-marquee-labels':
      return <MarqueeScene />;
    case '21-library-manager':
      return <LibraryManagerScene />;
    case '22-library-suggestions':
      return <LibrarySuggestionQueueScene />;
    default:
      return null;
  }
}
