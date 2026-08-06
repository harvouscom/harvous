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
import PublicJoinSpaceHero from '../../public/PublicJoinSpaceHero';
import PrototypePlannerBoard from '../../prototype/planner/PrototypePlannerBoard';
import PrototypePlannerCalendar from '../../prototype/planner/PrototypePlannerCalendar';
import PrototypePlannerList from '../../prototype/planner/PrototypePlannerList';
import PrototypePlannerScopeChips from '../../prototype/planner/PrototypePlannerScopeChips';
import type {
  PlannerSelection,
  PlannerView,
} from '../../prototype/planner/PrototypeExpandedPlanner';
import type { TeachingPlanSermon } from '../../../hooks/queries/useChurchTeachingPlan';
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
                leadingAccent="var(--pds-highlight-sky-blue)"
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
          <div className="proto-home-section">
            <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable proto-this-sunday">
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

const TEACHING_PLAN_ROWS = [
  { month: 'Aug', day: '9', title: 'No Condemnation', meta: 'Romans 8:1-11 · Life in the Spirit' },
  { month: 'Aug', day: '16', title: 'Led by the Spirit', meta: 'Romans 8:12-17 · Life in the Spirit' },
  { month: 'Aug', day: '23', title: 'Groaning and Glory', meta: 'No passage yet · Life in the Spirit' },
];

/* The lane below the sermons, and the reason the date is a tile: both lanes
   have to start their titles on the same edge. */
const TEACHING_PLAN_SERIES = [
  { title: 'Life in the Spirit', weeks: '8 weeks' },
  { title: 'Advent', weeks: '4 weeks' },
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
                  key={row.day}
                  type="button"
                  className="proto-church-tools__row"
                  disabled={lapsed}
                >
                  <span className="proto-church-tools__row-date">
                    <span className="proto-church-tools__row-date-month">{row.month}</span>
                    <span className="proto-church-tools__row-date-day">{row.day}</span>
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">{row.title}</span>
                    <span className="proto-caption proto-church-tools__row-meta">{row.meta}</span>
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
                    <span className="proto-caption proto-church-tools__row-meta">
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
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="timeline" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">{entry.title}</span>
                    <span className="proto-caption proto-church-tools__row-meta">{entry.weeks}</span>
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
                <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable proto-this-sunday">
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

            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Following</p>
              <ul className="proto-church-hub__list">
                <HubChannelRow title="Youth" meta="Weekly · 2 days ago" unseen={2} />
                <HubChannelRow title="Adult education" meta="Weekly · last week" />
              </ul>
            </div>

            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">More from your church</p>
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
                    <span className="proto-caption proto-church-tools__row-meta">
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
                    <span className="proto-caption proto-church-tools__row-meta">1 person</span>
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
                    <span className="proto-caption proto-church-tools__row-meta">
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

/* Enough channels that the switcher has to be a picker rather than a row of
   chips — the case a one-channel fixture would never show. */
const PLANNER_CHANNELS = [
  { id: 'space_youth', title: 'Youth' },
  { id: 'space_adult_ed', title: 'Adult education' },
  { id: 'space_kids', title: 'Kids' },
  { id: 'space_womens', title: "Women's Bible study" },
  { id: 'space_mens', title: "Men's breakfast" },
];

function PlannerScene({ view, canWrite = true }: { view: PlannerView; canWrite?: boolean }) {
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [planSpaceId, setPlanSpaceId] = useState<string | null>(null);
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);
  const services = plannerFixtures();
  const readOnlyReason = canWrite ? null : ('lapsed' as const);
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
              canWrite={canWrite}
              readOnlyReason={readOnlyReason}
              defaultDay={0}
              selection={selection}
              onSelect={setSelection}
              onMove={noop}
            />
          ) : view === 'calendar' ? (
            <PrototypePlannerCalendar
              services={services}
              serviceTimes={PLANNER_SERVICE_TIMES}
              canWrite={canWrite}
              selection={selection}
              onSelect={setSelection}
              onMoveToDate={noop}
            />
          ) : (
            <PrototypePlannerList
              services={services}
              serviceTimes={PLANNER_SERVICE_TIMES}
              canWrite={canWrite}
              readOnlyReason={readOnlyReason}
              selection={selection}
              onSelect={setSelection}
            />
          )}
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
    case '19-planner-board-readonly':
      return <PlannerScene view="board" canWrite={false} />;
    default:
      return null;
  }
}
