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
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from '../../prototype/settings/SettingsShell';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
import PrototypeHomeCardCarousel from '../../prototype/PrototypeHomeCardCarousel';
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

/** Phone-ish frame for congregant-facing scenes. */
function PhoneChrome({ children }: { children: ReactNode }) {
  return (
    <div className="proto-theme" style={{ width: 380, maxWidth: '100%', margin: '0 auto' }}>
      <div
        style={{
          background: 'var(--pds-bg-canvas)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 20,
          overflow: 'hidden',
          minHeight: 460,
        }}
      >
        {children}
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
            <PrototypeHomeCardCarousel
              items={[...FROM_YOUR_CHURCH_CARDS]}
              ariaLabel="From your church"
              renderItem={(card) => (
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                >
                  <div className="proto-home-card__body">
                    <div className="proto-home-card__title-row">
                      <span className="proto-home-card__icon-orb" aria-hidden>
                        <ProtoSpaceMenuIcon color="blue" size={13} />
                      </span>
                      <p className="pds-list-title proto-home-card__title">{card.title}</p>
                      <span className="proto-home-card__chevron" aria-hidden>
                        <Icon name="caret-right" size={11} />
                      </span>
                    </div>
                    <div className="proto-home-card__meta">
                      <span className="proto-home-card__meta-item">{card.meta}</span>
                    </div>
                  </div>
                </button>
              )}
            />
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
            <Icon name="circle-info" size={11} aria-hidden /> Curriculum from your church. Save or start a note of your
            own.
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
            <p className="proto-caption proto-home-section__eyebrow">This Sunday</p>
            <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-this-sunday">
              <div className="proto-home-card__body">
                <div className="proto-home-card__title-row">
                  <span className="proto-home-card__icon-orb" aria-hidden>
                    <ProtoSpaceMenuIcon color="paper" size={28} radius={8} iconName="church" />
                  </span>
                  <div className="proto-church-hub__row-text">
                    <p className="pds-list-title proto-home-card__title">No Condemnation</p>
                    <p className="proto-caption proto-church-hub__row-meta">Life in the Spirit</p>
                  </div>
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                  >
                    <Icon name="plus" size={12} aria-hidden />
                    <span className="proto-glass-action__label">New note</span>
                  </button>
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
  { date: 'Aug 9', title: 'No Condemnation', meta: 'Romans 8:1-11 · Life in the Spirit' },
  { date: 'Aug 16', title: 'Led by the Spirit', meta: 'Romans 8:12-17 · Life in the Spirit' },
  { date: 'Aug 23', title: 'Groaning and Glory', meta: 'No passage yet · Life in the Spirit' },
];

/** Staff Teaching plan — the `sermon_tools` surface, expanded. */
function TeachingPlanScene({ mode }: { mode: 'list' | 'lapsed' }) {
  const lapsed = mode === 'lapsed';
  return (
    <div>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <div className="proto-home-section">
            <button type="button" className="proto-church-hub__lane-action proto-church-staff__toggle">
              <Icon name="caret-down" size={10} aria-hidden /> Teaching plan · 3
            </button>

            <div className="proto-teaching-plan">
              <ul className="proto-teaching-plan__list">
                {TEACHING_PLAN_ROWS.map((row) => (
                  <li key={row.date} className="proto-teaching-plan__row">
                    <button
                      type="button"
                      className="proto-teaching-plan__row-button"
                      disabled={lapsed}
                    >
                      <span className="proto-teaching-plan__date">{row.date}</span>
                      <span className="proto-teaching-plan__row-text">
                        <span className="pds-list-title proto-teaching-plan__title">{row.title}</span>
                        <span className="proto-caption proto-teaching-plan__meta">{row.meta}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {lapsed ? (
                <p className="proto-caption proto-teaching-plan__empty">
                  Your church plan has lapsed. Everything already planned stays visible to your
                  congregation; subscribe to add more.
                </p>
              ) : (
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
                  Add a service
                </button>
              )}
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
              sublabel="Congregants — read and copy only"
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
    default:
      return null;
  }
}
