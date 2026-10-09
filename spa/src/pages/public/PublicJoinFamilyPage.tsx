/**
 * `/family/join/:token` — a family invite, sent by a parent from Settings › Family.
 *
 * Drawn the way a shared-space invite is (`PublicJoinSpacePage`): the Family Space's own
 * cover as the hero, a paper-stack letter with the room's accent tile, who invited you and how
 * many are already in it. It shows the room's looks only, never its threads or notes.
 *
 * The page's real job is still consent. Under the room sits the role this invite is for and
 * exactly what that role shares, and the redeem sends the role back (`acknowledgedRole`), so
 * the server refuses a join that didn't see it. See docs/future/FAMILY_ACCOUNTS.md.
 *
 * Signed out, it goes to sign-up and returns here; unlike the church join page it does not
 * replay the join, so the button that names the role is always pressed on purpose.
 */
import { useSyncExternalStore, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import Icon from '@/components/react/Icon';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { enterSpaceUrl } from '@/utils/enter-space-link';
import { avatarGlyphColorForAccent, spaceIconAccentHex } from '@/utils/space-cover';
import { FAMILY_ROLE_LABEL } from '@/lib/family-roles';
import { joinFamilyLabel } from '@/lib/family-name';
import { APIError } from '../../lib/api';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveJoinCoverDisplay } from '../../lib/space-cover-display';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { hasGuestSession } from '../../lib/guest-session';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { useFamilyInvitePreview, useRedeemFamilyInvite } from '../../hooks/queries/useFamily';
import PublicJoinSpaceHero from './PublicJoinSpaceHero';
import { PublicErrorState, PublicTopBar } from './public-shared';

/** App.tsx's PendingDiscoverToastBridge — generic in everything but its name. */
const PENDING_TOAST_KEY = 'pendingDiscoverToast';

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function peopleLine(count: number): string {
  return count === 1 ? '1 person in this family' : `${count} people in this family`;
}

export default function PublicJoinFamilyPage() {
  const { token } = useParams({ from: '/family/join/$token' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const preview = useFamilyInvitePreview(token);
  const redeem = useRedeemFamilyInvite(token);
  const [message, setMessage] = useState<string | null>(null);
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  const data = preview.data;
  const roleLabel = data ? FAMILY_ROLE_LABEL[data.role].toLowerCase() : '';
  const room = data?.space
    ? {
        color: data.space.color,
        backgroundGradient: data.space.backgroundGradient,
        cover: { light: data.space.coverBgLight ?? null, dark: data.space.coverBgDark ?? null },
      }
    : null;
  const coverDisplay = room ? resolveJoinCoverDisplay(room, colorScheme) : null;
  const inviterAccent = data?.inviter ? (colorScheme === 'dark' ? data.inviter.accentDark : data.inviter.accentLight) : null;
  const inviterAvatarStyle = inviterAccent
    ? ({
        '--public-join-avatar-bg': inviterAccent,
        '--public-join-avatar-color': avatarGlyphColorForAccent(inviterAccent, colorScheme) ?? undefined,
      } as CSSProperties)
    : undefined;

  function goToSignUp(toSignIn = false) {
    writePendingAuthRedirect(window.location.href);
    const back = encodeURIComponent(window.location.href);
    if (toSignIn) {
      void navigate({ to: `/sign-in?redirect_url=${back}` as never });
      return;
    }
    if (hasGuestSession()) {
      leaveForSignUp();
      void navigate({ to: guestSignUpHref() as never });
      return;
    }
    void navigate({ to: `/sign-up?redirect_url=${back}` as never });
  }

  async function join() {
    if (!data) return;
    setMessage(null);
    try {
      const result = await redeem.mutateAsync(data.role);
      clearPendingAuthRedirect();
      try {
        sessionStorage.setItem(
          PENDING_TOAST_KEY,
          JSON.stringify({
            message: result.alreadyMember ? `You’re already in ${data.familyName}` : `You joined ${data.familyName}`,
          }),
        );
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        void navigate({ to: enterSpaceUrl(result.spaceId) as never });
      }, 250);
    } catch (error) {
      if (error instanceof APIError && error.code === 'ALREADY_IN_FAMILY') {
        setMessage('You’re already in another family. Leave it in Settings › Family first, then open this link again.');
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Could not join. Try again in a moment.');
    }
  }

  const busy = redeem.isPending;
  const failed = preview.isError;
  const usable = data && data.valid;

  return (
    <>
      {data ? <title>{`${data.familyName} | Harvous`}</title> : null}
      <div className="public-page">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
        <div className="public-body">
          <div className="public-content public-content--upgrade public-content--join">
            {usable && room ? <PublicJoinSpaceHero space={room} /> : null}
            {preview.isLoading || (!data && !failed) ? (
              <div className="page-loading" />
            ) : !data ? (
              <PublicErrorState
                icon={<Icon name="link" size={24} />}
                title="This invite isn’t working"
                message="Ask whoever sent it for a new one."
              />
            ) : !data.valid ? (
              <PublicErrorState
                icon={<Icon name="link" size={24} />}
                title={data.reason ?? 'This invite is no longer active'}
                message="Ask whoever sent it for a new one."
              />
            ) : (
              <SubtleContentMount variant="fade">
                <>
                  <div className="public-paper-stack public-paper-stack--upgrade public-paper-stack--join">
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
                    <article
                      className={`public-addon-letter public-join-letter${coverDisplay?.isImage ? ' public-join-letter--hero-cover' : ''}`}
                    >
                      {coverDisplay && !coverDisplay.isImage ? (
                        <div className="public-join-letter__color-band" style={coverDisplay.bandStyle} aria-hidden />
                      ) : null}

                      <div className="public-addon-letter__header public-join-letter__header">
                        <span
                          className={`public-addon-letter__icon public-join-letter__icon space-icon-tile${colorScheme === 'dark' ? ' space-icon-tile--on-dark' : ''}`}
                          aria-hidden
                          style={{ ['--space-icon-accent' as string]: spaceIconAccentHex(data.space?.color, colorScheme) }}
                        >
                          <Icon name="user-group" size={22} />
                        </span>
                        <p className="public-addon-letter__tagline public-join-letter__invite">
                          {data.inviterFirstName
                            ? `${data.inviterFirstName} invited you to join their family on Harvous.`
                            : 'You’re invited to join a family on Harvous.'}
                        </p>
                        <h1 className="public-addon-letter__title">{data.familyName}</h1>
                      </div>

                      <div className="public-join-letter__body">
                        {data.space?.description ? (
                          <p className="public-join-letter__description">{data.space.description}</p>
                        ) : null}
                        <div className="public-join-letter__social">
                          <div className="public-join-letter__avatars" aria-hidden>
                            {data.inviter?.profileImageUrl ? (
                              <span
                                className="public-join-letter__avatar public-join-letter__avatar--photo"
                                style={{ backgroundImage: `url(${data.inviter.profileImageUrl})` }}
                              />
                            ) : (
                              <span className="public-join-letter__avatar" style={inviterAvatarStyle}>
                                {(data.inviterFirstName ?? '?').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <p className="public-join-letter__social-text">{peopleLine(data.memberCount ?? 1)}</p>
                        </div>

                        {/* What joining means, stated before the button that agrees to it. */}
                        <section className="public-join-family__role" aria-label={`Joining as ${article(roleLabel)} ${roleLabel}`}>
                          <p className="public-join-family__role-kicker">
                            You’d join as {article(roleLabel)} {roleLabel}
                          </p>
                          <p className="public-join-family__role-summary">{data.disclosure.summary}</p>
                          {data.role === 'child' ? (
                            <ul className="public-join-family__shares" role="list">
                              {data.disclosure.shares.map((line) => (
                                <li key={line}>
                                  <Icon name="eye" size={12} aria-hidden />
                                  <span>{line}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <p className="public-join-family__role-never">
                            <Icon name="lock" size={11} aria-hidden />
                            <span>{data.disclosure.never}</span>
                          </p>
                        </section>
                      </div>

                      <div className="public-addon-letter__cta public-join-letter__cta">
                        {message ? (
                          <p className="public-join-family__error" role="alert">
                            {message}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="upgrade-primary-btn"
                          disabled={busy}
                          onClick={() => (isSignedIn ? void join() : goToSignUp())}
                        >
                          {!isSignedIn
                            ? 'Create your free account'
                            : busy
                              ? 'Joining…'
                              : joinFamilyLabel(data.familyName)}
                        </button>
                        {!isSignedIn ? (
                          <button type="button" className="public-join-church__text-btn" onClick={() => goToSignUp(true)}>
                            I already have an account
                          </button>
                        ) : null}
                      </div>
                    </article>
                  </div>
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
            )}
          </div>
        </div>
      </div>
    </>
  );
}
