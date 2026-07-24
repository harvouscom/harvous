/**
 * Join-space letter card — paper-stack layout matching /addon and sign-in.
 * Option B: invite tagline + prose body (description, member count).
 */
import { useSyncExternalStore } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { appearanceIconGlyphColor, avatarGlyphColorForAccent, spaceIconAccentHex, type SpaceCoverAppearance } from '@/utils/space-cover';
import { cadenceLabel, type PublishCadence } from '@/utils/channel-publish-cadence';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveJoinCoverDisplay } from '../../lib/space-cover-display';
import { protoRelativeCaption } from '../prototype/proto-time';

export interface PublicJoinSpaceLetterSpace {
  id: string;
  title: string;
  color?: string;
  backgroundGradient?: string;
  cover?: SpaceCoverAppearance;
  description?: string;
  /** Ministry channel feed cadence (staff-declared). */
  publishCadence?: PublishCadence | null;
  lastCurriculumAt?: string | null;
  cadenceStale?: boolean;
  ownerDisplayName: string;
  ownerProfileImageUrl?: string | null;
  /** Owner's Settings › Appearance accent (used for the initial fallback when no photo). */
  ownerAccentLight?: string | null;
  ownerAccentDark?: string | null;
  isHarvousOwned: boolean;
  memberCount: number;
  /** Up to 2 real, anonymized non-owner members (initial + each person's appearance accent). */
  memberPreviews?: Array<{ initial: string; accentLight?: string | null; accentDark?: string | null }>;
  isAlreadyMember: boolean;
  notes?: Array<{ id: string; title: string; noteType?: string; scriptureTranslation?: string; version?: string }>;
  threads?: Array<{ id: string; title: string; color: string; noteCount: number }>;
  /** Glyph on the color tile — Shared Spaces `user-group`, ministry channels `rss`. */
  iconName?: IconName;
}

export interface PublicJoinSpaceLetterProps {
  space: PublicJoinSpaceLetterSpace;
  /** Invite flow (join page) vs read-only about card in shared space dashboard. */
  variant?: 'invite' | 'about';
  isSignedIn?: boolean;
  isJoinPending?: boolean;
  toastMessage?: string;
  toastType?: 'success' | 'error';
  toastVisible?: boolean;
  signInHref?: string;
  onSignInClick?: () => void;
  onJoin?: () => void;
  onGoToSpace?: () => void;
}

function inviteTagline(space: PublicJoinSpaceLetterSpace): string {
  if (space.isHarvousOwned) {
    return "You're invited to join this shared space on Harvous.";
  }
  const host = space.ownerDisplayName || 'A Harvous user';
  return `${host} invited you to join this shared space.`;
}

function memberCountLine(count: number): string {
  return count === 1 ? '1 person in this space' : `${count} people in this space`;
}

function ownerInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

export default function PublicJoinSpaceLetter({
  space,
  variant = 'invite',
  isSignedIn = false,
  isJoinPending = false,
  toastMessage = '',
  toastType = 'error',
  toastVisible = false,
  signInHref = '/sign-in',
  onSignInClick,
  onJoin,
  onGoToSpace,
}: PublicJoinSpaceLetterProps) {
  const isAbout = variant === 'about';
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const coverDisplay = resolveJoinCoverDisplay(space, colorScheme);
  const accentCss = coverDisplay.accentCss;
  const iconAccent = spaceIconAccentHex(space.color, colorScheme);
  const iconGlyphColor = appearanceIconGlyphColor(space.color, colorScheme);
  const tileIconName = space.iconName ?? 'user-group';
  const description = space.description?.trim();
  const cadenceLine = cadenceLabel(space.publishCadence ?? null);
  const lastUpdatedRel = protoRelativeCaption(space.lastCurriculumAt ?? null);
  const staleDisclaimer =
    space.cadenceStale && lastUpdatedRel
      ? `Last updated ${lastUpdatedRel} · May update less often lately`
      : space.cadenceStale
        ? 'May update less often lately'
        : null;

  // Avatar stack: owner first, then up to 2 real (anonymized) members — each tinted by that
  // person's own Settings › Appearance accent for the current color scheme.
  const memberAvatars = (space.memberPreviews ?? []).slice(0, 2);
  const avatarAccentStyle = (accentLight?: string | null, accentDark?: string | null): React.CSSProperties | undefined => {
    const accent = colorScheme === 'dark' ? accentDark : accentLight;
    if (!accent) return undefined;
    const glyph = avatarGlyphColorForAccent(accent, colorScheme);
    return {
      '--public-join-avatar-bg': accent,
      ...(glyph ? { '--public-join-avatar-color': glyph } : null),
    } as React.CSSProperties;
  };

  if (isAbout) {
    return (
      <div className="public-join-letter-about">
        <div className="public-join-letter-about__header">
          <span
            className={`public-join-letter-about__icon space-icon-tile${colorScheme === 'dark' ? ' space-icon-tile--on-dark' : ''}`}
            aria-hidden
            style={{ ['--space-icon-accent' as string]: iconAccent }}
          >
            <Icon name={tileIconName} size={22} />
          </span>
          <h1 className="public-addon-letter__title">{space.title}</h1>
        </div>
        {description ? <p className="public-join-letter-about__description">{description}</p> : null}
        {cadenceLine ? (
          <p className="public-join-letter-about__cadence proto-caption">
            <Icon name="calendar" size={11} aria-hidden />
            <span>{cadenceLine}</span>
          </p>
        ) : null}
        {staleDisclaimer ? (
          <p className="public-join-letter-about__cadence-stale proto-caption">{staleDisclaimer}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`public-paper-stack public-paper-stack--upgrade public-paper-stack--join${isAbout ? ' public-paper-stack--about' : ''}`}>
      <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
      <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
      <article className={`public-addon-letter public-join-letter${coverDisplay.isImage ? ' public-join-letter--hero-cover' : ''}`}>
        {!coverDisplay.isImage ? (
          <div
            className="public-join-letter__color-band"
            style={coverDisplay.bandStyle}
            aria-hidden
          />
        ) : null}

        <div className="public-addon-letter__header public-join-letter__header">
          <span
            className={`public-addon-letter__icon public-join-letter__icon space-icon-tile${colorScheme === 'dark' ? ' space-icon-tile--on-dark' : ''}`}
            aria-hidden
            style={{ ['--space-icon-accent' as string]: iconAccent }}
          >
            <Icon name={tileIconName} size={22} />
          </span>
          {!isAbout ? (
            <p className="public-addon-letter__tagline public-join-letter__invite">{inviteTagline(space)}</p>
          ) : null}
          <h1 className="public-addon-letter__title">{space.title}</h1>
        </div>

        <div className="public-join-letter__body">
          {description ? <p className="public-join-letter__description">{description}</p> : null}
          <div className="public-join-letter__social">
            <div
              className="public-join-letter__avatars"
              aria-hidden
              style={
                {
                  '--public-join-avatar-bg': accentCss,
                  '--public-join-avatar-color': iconGlyphColor,
                } as React.CSSProperties
              }
            >
              {space.ownerProfileImageUrl ? (
                <span
                  className="public-join-letter__avatar public-join-letter__avatar--photo"
                  style={{ backgroundImage: `url(${space.ownerProfileImageUrl})` }}
                />
              ) : (
                <span
                  className="public-join-letter__avatar"
                  style={avatarAccentStyle(space.ownerAccentLight, space.ownerAccentDark)}
                >
                  {ownerInitial(space.ownerDisplayName)}
                </span>
              )}
              {memberAvatars.map((member, i) => (
                <span
                  key={i}
                  className="public-join-letter__avatar"
                  style={avatarAccentStyle(member.accentLight, member.accentDark)}
                >
                  {member.initial}
                </span>
              ))}
            </div>
            <p className="public-join-letter__social-text">{memberCountLine(space.memberCount)}</p>
          </div>
        </div>

        {!isAbout ? (
          <div className="public-addon-letter__cta public-join-letter__cta">
            <div className={`public-join-letter__toast public-toast public-toast--${toastType}${toastVisible ? ' public-toast--visible' : ''}`}>
              {toastMessage}
            </div>
            {!isSignedIn ? (
              <a
                href={signInHref}
                className="upgrade-primary-btn"
                onClick={onSignInClick}
              >
                Join this space
              </a>
            ) : space.isAlreadyMember ? (
              <button type="button" className="upgrade-primary-btn" onClick={onGoToSpace}>
                Go to space
              </button>
            ) : (
              <button
                id="join-space-btn"
                type="button"
                className="upgrade-primary-btn"
                onClick={onJoin}
                disabled={isJoinPending}
              >
                {isJoinPending ? 'Joining…' : 'Join this space'}
              </button>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
}
