/**
 * Fixture previews for Shared Spaces design gallery — uses production CSS classes
 * and real components where possible. Edit styles in the linked files; HMR updates here.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import UpgradePageContent from '@/components/react/UpgradePageContent';
import { PublicTopBar } from '../../public/public-shared';
import PublicJoinSpaceLetter from '../../public/PublicJoinSpaceLetter';
import PublicJoinSpaceHero from '../../public/PublicJoinSpaceHero';
import PrototypeSharedNoteReadOnlyBanner from '../../prototype/PrototypeSharedNoteReadOnlyBanner';
import SharedSpaceNoteAuthorChip from '../../prototype/SharedSpaceNoteAuthorChip';
import ProtoConfirmDialog from '../../prototype/ProtoConfirmDialog';
import ProtoPopoverShell from '../../prototype/ProtoPopoverShell';
import ProtoHouseIcon from '../../prototype/ProtoHouseIcon';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from '../../prototype/settings/SettingsShell';
import PrototypeSpaceSettingsSection from '../../prototype/PrototypeSpaceSettingsSection';
import SharedSpaceInviteExpiryPicker from '../../prototype/SharedSpaceInviteExpiryPicker';
import type { InviteExpiryPreset } from '../../../lib/shared-space-invite-expiry';
import { PROTO_TOOLBAR_ICON_SIZE } from '../../prototype/proto-toolbar-tokens';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor, spaceIconAccentHex, avatarGlyphColorForAccent, spaceCoverFromThreadColor } from '@/utils/space-cover';
import { imagePresetById, imagePresetUrl } from '../../../lib/prototype-background';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../../lib/prototype-background';
import SharedSpaceDashboardFixtureView from './SharedSpaceDashboardFixtureView';
import {
  SHARED_SPACE_DASHBOARD_FIXTURE_FULL,
  SHARED_SPACE_DASHBOARD_FIXTURE_SOCIAL,
} from './shared-space-dashboard-fixtures';
import type { SharedSpacesDesignScene } from './sceneRegistry';

const FIXTURE_SPACE = {
  title: 'Romans Study Group',
  color: 'purple',
  description: 'Weekly notes on Paul’s letter — everyone adds observations.',
};

const FIXTURE_MEMBERS = [
  { name: 'Test O.', color: 'purple', role: 'owner' as const },
  { name: 'Test J.', color: 'green', role: 'member' as const },
  { name: 'You', color: 'blue', role: 'member' as const, isSelf: true },
];

function ProtoChrome({ children, width = 360 }: { children: ReactNode; width?: number }) {
  return (
    <div className="proto-theme" style={{ width, maxWidth: '100%', margin: '0 auto' }}>
      <div
        className="proto-shell proto-shell--no-footer"
        style={{
          display: 'grid',
          gridTemplateColumns: `${width}px 1fr`,
          minHeight: 420,
          borderRadius: 16,
          overflow: 'hidden',
          border: '0.5px solid var(--pds-border)',
        }}
      >
        <aside style={{ background: 'var(--pds-bg-sidebar)', borderRight: '0.5px solid var(--pds-border)' }}>
          {children}
        </aside>
        <main style={{ background: 'var(--pds-bg-canvas)', padding: 24, color: 'var(--pds-text-secondary)', fontSize: 13 }}>
          Main column preview
        </main>
      </div>
    </div>
  );
}

function AddonScene({ active }: { active: boolean }) {
  return (
    <div className="public-page" style={{ minHeight: 'auto' }}>
      <PublicTopBar isSignedIn={!active} signedInCtaLabel="Back to my Harvous" />
      <div className="public-body">
        <div className="public-content public-content--upgrade">
          <SubtleContentMount variant="fade">
            <UpgradePageContent
              initialHasSharedSpaces={active}
              publishableKey={null}
              sharedSpacesPlanId=""
              designPreview={{ signedIn: active }}
            />
          </SubtleContentMount>
        </div>
      </div>
    </div>
  );
}

function SettingsAddonsScene({ active }: { active: boolean }) {
  return (
    <SettingsShell>
      <SettingsIntro>Optional paid upgrades for your Bible study.</SettingsIntro>
      <SettingsGroup>
        <SettingsRow
          label="Shared Spaces"
          sublabel="Host spaces for group study. Free to join."
          leadingIcon="user-group"
          leadingAccent="var(--pds-highlight-coral-rose)"
          badge={active ? 'Active' : 'In 1 space'}
          onClick={() => {}}
        />
        <SettingsRow
          label="Review"
          sublabel="Spaced practice from your notes and highlights."
          leadingIcon="rotate-left"
          leadingAccent="var(--pds-highlight-sky-blue)"
          badge="Coming later"
          trailing="none"
          disabled
        />
      </SettingsGroup>
      {active ? (
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
          Manage Add-On
        </button>
      ) : null}
    </SettingsShell>
  );
}

function SpaceSwitcherScene({ creating }: { creating?: boolean }) {
  return (
    <div className="proto-theme" style={{ width: 280 }}>
      <ProtoPopoverShell className="proto-menu__popover" role="menu" aria-label="Spaces preview" style={{ position: 'relative' }}>
        <div className="proto-menu-section" role="group">
          <button type="button" className="proto-menu-item" aria-checked={false}>
            <span className="proto-menu-item__icon" aria-hidden>
              <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
            </span>
            <span className="proto-menu-item__label">My Home</span>
          </button>
        </div>
        <div className="proto-menu-section" role="group">
          <button type="button" className="proto-menu-item" aria-checked>
            <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
              <ProtoSpaceMenuIcon color={FIXTURE_SPACE.color} />
            </span>
            <span className="proto-menu-item__label" title={FIXTURE_SPACE.title}>
              {FIXTURE_SPACE.title}
            </span>
            <span className="proto-menu-item__check" aria-hidden>
              <Icon name="check" size={12} />
            </span>
          </button>
        </div>
        {creating ? (
          <div className="proto-space-switcher__create-form">
            <div className="proto-space-switcher__preview" aria-hidden>
              <span className="proto-menu-item__icon proto-menu-item__icon--space">
                <ProtoSpaceMenuIcon color="blue" />
              </span>
              <span className="proto-menu-item__label proto-space-switcher__preview-title">
                New study space
              </span>
            </div>
            <input
              type="text"
              defaultValue="New study space"
              readOnly
              className="proto-space-switcher__create-input"
            />
            <div className="proto-space-switcher__create-colors">
              {SPACE_COVER_PICKER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  aria-pressed={color === 'blue'}
                  className={
                    color === 'blue'
                      ? 'proto-shared-space-settings__color proto-shared-space-settings__color--selected'
                      : 'proto-shared-space-settings__color'
                  }
                  style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(color) }}
                >
                  {color === 'blue' ? <Icon name="check" size={12} /> : null}
                </button>
              ))}
            </div>
            <div className="proto-space-switcher__create-actions">
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
                Cancel
              </button>
              <button type="button" className="proto-settings-btn">
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="proto-menu-section">
            <button type="button" className="proto-menu-item">
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="plus" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">New shared space</span>
            </button>
          </div>
        )}
      </ProtoPopoverShell>
    </div>
  );
}

function SharedSidebarScene({ asMember }: { asMember?: boolean }) {
  const notes = [
    { title: 'Romans 8 — Spirit vs flesh', author: asMember ? 'Test O.' : 'You', color: asMember ? 'purple' : 'blue', isOwn: !asMember, preview: 'Paul contrasts life in the Spirit…' },
    { title: 'July 3, 2026', author: asMember ? 'You' : 'Test J.', color: asMember ? 'blue' : 'teal', isOwn: asMember, preview: 'Member observation on adoption…' },
  ];
  return (
    <ProtoChrome>
      <div className="proto-sidebar-root">
        <div className="proto-shared-space-header">
          <div className="proto-shared-space-header__row">
            <ProtoSpaceMenuIcon color={FIXTURE_SPACE.color} size={30} radius={9} />
            <div className="proto-shared-space-header__meta">
              <div className="pds-list-title proto-shared-space-header__title" title={FIXTURE_SPACE.title}>
                {FIXTURE_SPACE.title}
              </div>
              <button type="button" className="proto-shared-space-header__people">
                <span>3 people</span>
                {!asMember ? (
                  <>
                    <span className="proto-shared-space-header__dot" aria-hidden>
                      ·
                    </span>
                    <span className="proto-shared-space-header__invite">Invite</span>
                  </>
                ) : null}
              </button>
            </div>
            {!asMember ? (
              <button type="button" className="proto-toolbar-icon-btn" aria-label="Space settings">
                <Icon name="gear" size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <ul className="proto-note-list" style={{ padding: '8px 0' }}>
          {notes.map((note) => (
            <li key={note.title} className="proto-note-row-item">
              <button type="button" className="proto-note-row__main">
                <div className="proto-note-row__title-line">
                  <span className="pds-list-title proto-note-row__title-text">{note.title}</span>
                </div>
                <div className="pds-list-preview proto-note-row__preview">
                  <SharedSpaceNoteAuthorChip displayName={note.author} color={note.color} isSelf={note.isOwn} />
                  <span>{note.preview}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ProtoChrome>
  );
}

function PeopleSheetScene() {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  // Interactive so the gallery exercises the real hub → sub-view navigation.
  const [view, setView] = useState<'hub' | 'people' | 'invites' | 'details'>('hub');
  const [inviteExpiryPreset, setInviteExpiryPreset] = useState<InviteExpiryPreset>('30d');
  const [inviteCustomDate, setInviteCustomDate] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const memberAvatarStyle = (color?: string | null): React.CSSProperties => {
    const bg = spaceIconAccentHex(color || 'blue', colorScheme);
    return { background: bg, color: avatarGlyphColorForAccent(bg, colorScheme) ?? undefined };
  };

  const memberList = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {FIXTURE_MEMBERS.map((m) => (
        <div key={m.name} className="proto-shared-people-row">
          <span className="proto-shared-people-row__avatar" aria-hidden style={memberAvatarStyle(m.color)}>
            {m.name.charAt(0)}
          </span>
          <span className="proto-shared-people-row__name">{m.name}</span>
          {m.isSelf ? <span className="proto-shared-people-row__tag">You</span> : null}
          {m.role === 'owner' ? (
            <span className="proto-shared-people-row__tag proto-shared-people-row__tag--owner">Owner</span>
          ) : null}
          {m.isSelf ? (
            <button type="button" className="proto-shared-people-row__action">
              Leave space
            </button>
          ) : m.role !== 'owner' ? (
            <button type="button" className="proto-shared-people-row__action proto-shared-people-row__action--destructive">
              Remove
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="proto-theme" style={{ width: 360 }}>
      <ProtoPopoverShell
        className="proto-connect-note-popover proto-create-folder-popover"
        style={{ position: 'relative' }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet proto-shared-manage-sheet">
          <div className="proto-study-thread-popover__header">
            <div className="proto-study-thread-popover__title-row">
              {view !== 'hub' ? (
                <button
                  type="button"
                  className="proto-side-panel__action-btn"
                  onClick={() => setView('hub')}
                  aria-label="Back"
                  title="Back"
                >
                  <Icon name="caret-left" size={14} />
                </button>
              ) : (
                <ProtoSpaceMenuIcon color={FIXTURE_SPACE.color} size={44} radius={13} glyphSize={18} />
              )}
              <span className="proto-study-thread-popover__title-block">
                <span className="proto-study-thread-popover__title">
                  {view === 'people'
                    ? 'People'
                    : view === 'invites'
                      ? 'Invite links'
                      : view === 'details'
                        ? 'Space settings'
                        : 'Manage space'}
                </span>
                <span className="proto-study-thread-popover__subtitle">{FIXTURE_SPACE.title}</span>
              </span>
            </div>
            <button type="button" className="proto-side-panel__action-btn" aria-label="Close" title="Close">
              <Icon name="xmark" size={12} />
            </button>
          </div>
          <div className="proto-connect-note-sheet__scroll">
            {view === 'hub' ? (
              <div className="proto-settings__content">
                <SettingsGroup>
                  <SettingsRow
                    label="People"
                    sublabel="Members and access"
                    value={String(FIXTURE_MEMBERS.length)}
                    onClick={() => setView('people')}
                  />
                  <SettingsRow
                    label="Invite links"
                    sublabel="Create and share invites"
                    value="1 active"
                    onClick={() => setView('invites')}
                  />
                  <SettingsRow
                    label="Space settings"
                    sublabel="Name, description, and color"
                    onClick={() => setView('details')}
                  />
                </SettingsGroup>
              </div>
            ) : view === 'people' ? (
              memberList
            ) : view === 'invites' ? (
              <>
                <div className="proto-shared-invite">
                  <div className="proto-share-popover__url-row">
                    <input
                      type="text"
                      readOnly
                      value="app.harvous.com/spaces/join/abc123"
                      className="proto-share-popover__url-input"
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="Invite link"
                    />
                    <button type="button" className="proto-share-popover__copy" aria-label="Copy invite link">
                      <Icon name="copy" size={14} aria-hidden />
                      Copy
                    </button>
                  </div>
                  <div className="proto-share-popover__actions">
                    <span className="proto-shared-invite__expiry">Expires Aug 12</span>
                    <button type="button" className="proto-share-popover__link-action proto-share-popover__link-action--danger">
                      Turn off link
                    </button>
                  </div>
                </div>
                {isCreatingInvite ? (
                  <div className="proto-shared-invite-create">
                    <SharedSpaceInviteExpiryPicker
                      preset={inviteExpiryPreset}
                      customDate={inviteCustomDate}
                      onPresetChange={setInviteExpiryPreset}
                      onCustomDateChange={setInviteCustomDate}
                    />
                    <div className="proto-space-switcher__create-actions">
                      <button
                        type="button"
                        className="proto-settings-btn proto-settings-btn--secondary"
                        onClick={() => setIsCreatingInvite(false)}
                      >
                        Cancel
                      </button>
                      <button type="button" className="proto-settings-btn">
                        Create link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="proto-add-notes-sheet__footer">
                    <button
                      type="button"
                      className="proto-share-popover__primary"
                      onClick={() => setIsCreatingInvite(true)}
                    >
                      New invite link
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <PrototypeSpaceSettingsSection
                  spaceId="space_design_fixture"
                  initialTitle={FIXTURE_SPACE.title}
                  initialColor={FIXTURE_SPACE.color}
                  initialDescription={FIXTURE_SPACE.description}
                />
                <div className="proto-shared-manage-danger">
                  <button type="button" className="proto-share-popover__link-action proto-share-popover__link-action--danger">
                    Delete space
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </ProtoPopoverShell>
    </div>
  );
}

const JOIN_FIXTURE_SPACE = {
  id: 'space_design_fixture',
  title: FIXTURE_SPACE.title,
  color: FIXTURE_SPACE.color,
  description: FIXTURE_SPACE.description,
  ownerDisplayName: 'Test O.',
  isHarvousOwned: false,
  // Owner appearance = Sky; members = Mint / Lilac (Settings › Appearance canvas hexes).
  ownerAccentLight: '#d7eaff',
  ownerAccentDark: '#152536',
  memberCount: 3,
  memberPreviews: [
    { initial: 'M', accentLight: '#dbf0cd', accentDark: '#1e2e22' },
    { initial: 'J', accentLight: '#f3dfff', accentDark: '#2a2438' },
  ],
  notes: [{ id: 'note_fixture', title: 'Romans 8 — Spirit vs flesh', noteType: 'note' as const }],
};

function JoinCoverColorsScene() {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  return (
    <div className="public-page" style={{ minHeight: 'auto', padding: '24px 16px' }}>
      <p className="pds-caption" style={{ marginBottom: 16, textAlign: 'center', color: 'var(--pds-text-secondary)' }}>
        Join hero backgrounds for each space picker color ({colorScheme} mode)
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        {SPACE_COVER_PICKER_COLORS.map((color) => {
          const cover = spaceCoverFromThreadColor(color);
          const modeCover = colorScheme === 'dark' ? cover.dark : cover.light;
          const presetId = modeCover?.kind === 'image-preset' ? modeCover.presetId : null;
          const preset = presetId ? imagePresetById(presetId) : null;
          const imageUrl = preset ? imagePresetUrl(preset) : null;
          const swatch = spacePickerSwatchColor(color, colorScheme);

          return (
            <div
              key={color}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '0.5px solid var(--pds-border)',
                background: 'var(--site-paper)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  height: 120,
                  background: swatch,
                  backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: spaceIconAccentHex(color, colorScheme),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{color}</span>
                {presetId ? (
                  <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 'auto' }}>{presetId}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JoinPageScene({ signedIn, alreadyMember }: { signedIn?: boolean; alreadyMember?: boolean }) {
  const fixtureSpace = {
    ...JOIN_FIXTURE_SPACE,
    isAlreadyMember: Boolean(alreadyMember),
  };

  return (
    <div className="public-page" style={{ minHeight: 'auto' }}>
      <PublicTopBar isSignedIn={Boolean(signedIn)} />
      <div className="public-body">
        <div className="public-content public-content--upgrade">
          <PublicJoinSpaceHero space={{ color: FIXTURE_SPACE.color }} />
          <SubtleContentMount variant="fade">
            <>
              <PublicJoinSpaceLetter
                space={fixtureSpace}
                isSignedIn={Boolean(signedIn)}
                signInHref="/sign-in"
                onJoin={() => {}}
                onGoToSpace={() => {}}
              />
              <div className="public-footer public-footer--rich">
                <span className="public-footer__tag">
                  Harvous is a notes app for Bible study.{' '}
                  <a href="https://harvous.com" target="_blank" rel="noopener noreferrer" className="public-footer__cta">
                    harvous.com
                  </a>
                </span>
              </div>
            </>
          </SubtleContentMount>
        </div>
      </div>
    </div>
  );
}

function CopyMenuScene() {
  return (
    <div className="proto-theme" style={{ width: 260 }}>
      <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu">
        <div className="proto-copy-space-group-label">Spaces you host</div>
        <button type="button" className="proto-menu-item">
          <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
            <ProtoSpaceMenuIcon color={FIXTURE_SPACE.color} />
          </span>
          <span className="proto-menu-item__label">{FIXTURE_SPACE.title}</span>
        </button>
        <div className="proto-copy-space-group-label">Spaces you&apos;ve joined</div>
        <button type="button" className="proto-menu-item">
          <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
            <ProtoSpaceMenuIcon color="teal" />
          </span>
          <span className="proto-menu-item__label">Acts Community</span>
        </button>
      </ProtoPopoverShell>
    </div>
  );
}

function ConfirmScene({ label }: { label: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setRect(anchorRef.current?.getBoundingClientRect() ?? null);
  }, []);
  return (
    <div className="proto-theme" style={{ padding: 48, position: 'relative', minHeight: 200 }}>
      <button ref={anchorRef} type="button" className="proto-menu-item">
        <span className="proto-menu-item__label">{label}</span>
      </button>
      {rect ? (
        <ProtoConfirmDialog
          anchorRect={rect}
          confirmLabel={label.includes('Delete') ? 'Delete' : label.includes('Leave') ? 'Leave' : 'Turn off'}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      ) : null}
    </div>
  );
}

export default function SharedSpacesDesignScenePreview({ scene }: { scene: SharedSpacesDesignScene }) {
  switch (scene.id) {
    case '01-addon-inactive':
      return <AddonScene active={false} />;
    case '02-settings-addons':
      return <SettingsAddonsScene active={false} />;
    case '03-addon-active':
      return <AddonScene active />;
    case '04-settings-active':
      return <SettingsAddonsScene active />;
    case '05-space-switcher':
      return <SpaceSwitcherScene />;
    case '06-switcher-create':
      return <SpaceSwitcherScene creating />;
    case '07-shared-sidebar':
      return <SharedSidebarScene />;
    case '08-people-sheet':
      return <PeopleSheetScene />;
    case '09-join-logged-out':
      return <JoinPageScene />;
    case '10-join-logged-in':
      return <JoinPageScene signedIn />;
    case '11-member-sidebar':
      return <SharedSidebarScene asMember />;
    case '12-author-list':
      return <SharedSidebarScene asMember />;
    case '13-readonly-banner':
      return (
        <div className="proto-theme" style={{ maxWidth: 720, margin: '0 auto' }}>
          <PrototypeSharedNoteReadOnlyBanner
            authorDisplayName="Sarah"
            authorUserId="user_sarah"
            authorColor="rose"
          />
          <div style={{ padding: 24, color: 'var(--pds-text-secondary)', fontSize: 14 }}>Note editor preview area</div>
        </div>
      );
    case '14-copy-menu':
      return <CopyMenuScene />;
    case '15-revoke-confirm':
      return <ConfirmScene label="Turn off invite link?" />;
    case '16-leave-confirm':
      return <ConfirmScene label="Leave this space?" />;
    case '17-delete-confirm':
      return <ConfirmScene label="Delete this space?" />;
    case '18-full-dashboard':
      return (
        <ProtoChrome width={360}>
          <SharedSpaceDashboardFixtureView fixture={SHARED_SPACE_DASHBOARD_FIXTURE_FULL} showFixtureBanner />
        </ProtoChrome>
      );
    case '19-social-dashboard':
      return (
        <ProtoChrome width={360}>
          <SharedSpaceDashboardFixtureView fixture={SHARED_SPACE_DASHBOARD_FIXTURE_SOCIAL} showFixtureBanner />
        </ProtoChrome>
      );
    case '20-join-cover-colors':
      return <JoinCoverColorsScene />;
    default:
      return null;
  }
}
