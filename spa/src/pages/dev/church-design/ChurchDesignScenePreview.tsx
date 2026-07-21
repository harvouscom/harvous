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
import { PrototypeSectionHeader } from '../../prototype/design-system';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from '../../prototype/settings/SettingsShell';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
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
                      Create broadcast space
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
          Mockup — the connect flow is unbuilt. Today this page stores free-text church fields only.
        </SpeculativeNote>
      ) : null}
      <SettingsShell>
        <SettingsIntro>
          {connected
            ? 'You receive study from your church.'
            : 'Tell us where you worship. We use this to connect you if your church joins Harvous.'}
        </SettingsIntro>
        {connected ? (
          <SettingsGroup>
            <SettingsRow
              label="Testament Made"
              sublabel="Nashville, TN · connected"
              leadingIcon="church"
              leadingAccent="var(--pds-highlight-sky-blue)"
              badge="Connected"
              onClick={() => {}}
            />
            <SettingsRow label="From your church" sublabel="1 study space you follow" value="Announcements" onClick={() => {}} />
            <SettingsRow label="Disconnect" destructive trailing="none" onClick={() => {}} />
          </SettingsGroup>
        ) : (
          <SettingsGroup>
            <SettingsRow label="Church name" value="Testament Made" onClick={() => {}} />
            <SettingsRow label="City" value="Nashville" onClick={() => {}} />
            <SettingsRow label="State" value="TN" onClick={() => {}} />
            <SettingsRow label="Country" value="United States" onClick={() => {}} />
          </SettingsGroup>
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

function FromYourChurchScene() {
  return (
    <div>
      <SpeculativeNote>
        Mockup — a Home section fed by the connected church’s broadcast spaces.
      </SpeculativeNote>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <PrototypeSectionHeader variant="list">From your church</PrototypeSectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {[
              { title: 'This Sunday — Romans 8', meta: 'Testament Made · posted Friday' },
              { title: 'Fall study: The Sermon on the Mount', meta: 'Testament Made · 6 notes' },
            ].map((card) => (
              <article
                key={card.title}
                className="proto-glass-surface"
                style={{
                  borderRadius: 12,
                  padding: 12,
                  border: '0.5px solid var(--pds-border)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <ProtoSpaceMenuIcon color="blue" size={24} />
                <div style={{ flexShrink: 1, minWidth: 0 }}>
                  <p className="pds-list-title" style={{ margin: 0 }}>
                    {card.title}
                  </p>
                  <p className="pds-caption" style={{ margin: 0, color: 'var(--pds-text-secondary)' }}>
                    {card.meta}
                  </p>
                </div>
              </article>
            ))}
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
        Mockup — an org-owned space (type=&apos;public&apos; + orgId). Members follow and copy; only staff author, so
        there is no compose affordance.
      </SpeculativeNote>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <ProtoSpaceMenuIcon color="blue" size={28} />
            <div>
              <p className="pds-list-title" style={{ margin: 0 }}>
                Announcements
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
            <Icon name="circle-info" size={11} aria-hidden /> Your church posts here. Save anything to your own notes.
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

function BroadcastNoteScene() {
  return (
    <div>
      <SpeculativeNote>
        Mockup — reading a church note. Copy uses the existing copy-lineage rails, so attribution survives.
      </SpeculativeNote>
      <PhoneChrome>
        <div style={{ padding: 16 }}>
          <p className="pds-caption" style={{ margin: '0 0 10px', color: 'var(--pds-text-secondary)' }}>
            <Icon name="church" size={11} aria-hidden /> Testament Made · Pastor Derek
          </p>
          <p className="pds-list-title" style={{ margin: '0 0 8px' }}>
            This Sunday — Romans 8
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.55 }}>
            We&apos;ll be walking through the first seventeen verses. Come having read the chapter once.
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: 'var(--pds-text-secondary)' }}>
            Big idea: there is therefore now no condemnation.
          </p>
          <button type="button" className="proto-settings-btn proto-settings-btn--primary">
            Save to my notes
          </button>
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
          <SettingsIntro>Announcements · Testament Made</SettingsIntro>
          <SettingsGroup>
            <SettingsRow
              label="Derek J"
              sublabel="Space owner · staff"
              leadingIcon="person"
              leadingAccent="var(--pds-highlight-sky-blue)"
              badge="Owner"
              trailing="none"
            />
            <SettingsRow
              label="Hannah P"
              sublabel="Synced from Clerk org"
              leadingIcon="person"
              leadingAccent="var(--pds-highlight-coral-rose)"
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
      return <BroadcastNoteScene />;
    case '10-staff-roles':
      return <StaffRolesScene />;
    default:
      return null;
  }
}
