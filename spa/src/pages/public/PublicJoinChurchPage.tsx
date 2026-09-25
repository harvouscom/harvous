/**
 * `/churches/join/:token` — a church's join link, usually reached from a QR on a
 * bulletin or a slide.
 *
 * It does what Settings › My Church does in four screens, on one page: shows the
 * church, carries a visitor through sign-up, connects them, and lets them choose
 * which of its channels to follow. Nothing is preselected — connecting never
 * follows everything (docs/CHURCH_V2_ROADMAP.md, "What stays true").
 *
 * Signed out, it goes to **sign-up** rather than sign-in, the way the Discover page
 * does: someone scanning their church's QR most likely has no account yet. The
 * picked channels are parked for the return trip and the connection replays once,
 * because pressing "Create your free account" beside them already said yes.
 *
 * Someone connected to another church is told so before anything happens, and the
 * button names the switch — moving releases the old church's channel follows.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { APIError } from '../../lib/api';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { hasGuestSession } from '../../lib/guest-session';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { useChurchJoinPreview, useRedeemChurchJoinLink } from '../../hooks/queries/useChurchJoin';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import Icon from '@/components/react/Icon';
import { getThreadColorCSS } from '@/utils/colors';
import { PublicTopBar, PublicErrorState } from './public-shared';

const PENDING_KEY = 'pendingChurchJoin';
const PENDING_TTL_MS = 600_000;
/** App.tsx's PendingDiscoverToastBridge — generic in everything but its name. */
const PENDING_TOAST_KEY = 'pendingDiscoverToast';

type Pending = { token: string; channelIds: string[]; timestamp: number };

function readPending(token: string): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    if (parsed.token !== token || Date.now() - (parsed.timestamp ?? 0) > PENDING_TTL_MS) return null;
    return { token, channelIds: Array.isArray(parsed.channelIds) ? parsed.channelIds : [], timestamp: parsed.timestamp ?? 0 };
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function placeLine(city: string | null, state: string | null): string | null {
  const parts = [city, state].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

export default function PublicJoinChurchPage() {
  const { token } = useParams({ from: '/churches/join/$token' });
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const preview = useChurchJoinPreview(token);
  const redeem = useRedeemChurchJoinLink(token);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(readPending(token)?.channelIds ?? []));
  const [message, setMessage] = useState<string | null>(null);
  const [needsSwitchConfirm, setNeedsSwitchConfirm] = useState(false);
  /* Connecting toasts and navigates, so the replay after sign-up fires once even if
     the effect re-runs. */
  const replayedRef = useRef(false);

  const data = preview.data;
  const church = data?.church;
  const viewer = data?.viewer;
  /* Channels already theirs — followed, or led as staff — show as done and can't be toggled. */
  const following = useMemo(
    () => new Set([...(viewer?.followingIds ?? []), ...(viewer?.leadingIds ?? [])]),
    [viewer?.followingIds, viewer?.leadingIds],
  );
  const leading = useMemo(() => new Set(viewer?.leadingIds ?? []), [viewer?.leadingIds]);
  const connection = viewer?.connection ?? 'none';
  const newPicks = [...picked].filter((id) => !following.has(id));

  /*
    A church with ministries lists its channels under them — "Youth", "Kids" — with church-wide
    ones last and unheaded; one with none keeps the single flat list.
  */
  const channelGroups = useMemo(() => {
    const channels = data?.channels ?? [];
    const ministries = data?.ministries ?? [];
    const groups = ministries.map((ministry) => ({
      id: ministry.id as string | null,
      name: ministry.name as string | null,
      channels: channels.filter((channel) => channel.ministryId === ministry.id),
    }));
    const headed = new Set(groups.flatMap((group) => group.channels.map((channel) => channel.id)));
    const rest = channels.filter((channel) => !headed.has(channel.id));
    if (rest.length) {
      groups.push({ id: null, name: groups.length ? 'Church-wide' : null, channels: rest });
    }
    return groups
      .filter((group) => group.channels.length > 0)
      .map((group) => ({ ...group, pickable: group.channels.map((c) => c.id).filter((id) => !following.has(id)) }));
  }, [data?.channels, data?.ministries, following]);

  function pickGroup(ids: string[]) {
    setPicked((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggle(id: string) {
    if (following.has(id)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function connect(confirmSwitch: boolean) {
    if (!church) return;
    setMessage(null);
    try {
      const result = await redeem.mutateAsync({ channelIds: newPicks, confirmSwitch });
      clearPending();
      clearPendingAuthRedirect();
      const followedCount = result.followed.length;
      const toast = result.followsSkipped
        ? `You're connected to ${result.church.name}. Its channels aren't open to follow right now.`
        : result.alreadyConnected
          ? followedCount > 0
            ? `Following ${followedCount === 1 ? 'one more channel' : `${followedCount} more channels`} from ${result.church.name}`
            : `You're connected to ${result.church.name}`
          : `You're connected to ${result.church.name}`;
      try {
        sessionStorage.setItem(PENDING_TOAST_KEY, JSON.stringify({ message: toast }));
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        void navigate({ to: prototypeHomeRouteTo() as never });
      }, 250);
    } catch (error) {
      if (error instanceof APIError && error.code === 'CHURCH_SWITCH_CONFIRM_REQUIRED') {
        setNeedsSwitchConfirm(true);
        setMessage(null);
        return;
      }
      setMessage(
        error instanceof APIError && error.status === 410
          ? 'This link is no longer active. Ask your church for a new one.'
          : error instanceof Error
            ? error.message
            : 'Could not connect. Try again in a moment.',
      );
    }
  }

  function goToSignUp(toSignIn = false) {
    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ token, channelIds: [...picked], timestamp: Date.now() } satisfies Pending),
      );
    } catch {
      /* ignore */
    }
    writePendingAuthRedirect(window.location.href);
    if (toSignIn) {
      void navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as never });
      return;
    }
    if (hasGuestSession()) {
      // A guest keeps their guest attribution and skips the exit prompt on the way out.
      leaveForSignUp();
      void navigate({ to: guestSignUpHref() as never });
      return;
    }
    void navigate({ to: `/sign-up?redirect_url=${encodeURIComponent(window.location.href)}` as never });
  }

  /* Back from sign-up (or sign-in) with a choice already made: finish it, once.
     Only for someone with no church — anyone else has a decision to make here. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !data || replayedRef.current) return;
    const pending = readPending(token);
    if (!pending) return;
    replayedRef.current = true;
    if (data.viewer.connection === 'none') {
      void connect(false);
    } else {
      clearPending();
    }
    // `connect` reads the latest state through closures set this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, data, token]);

  const busy = redeem.isPending;
  const place = church ? placeLine(church.city, church.state) : null;
  const switching = connection === 'elsewhere';

  let primaryLabel: string;
  if (!isSignedIn) primaryLabel = 'Create your free account';
  else if (busy) primaryLabel = 'Connecting…';
  else if (connection === 'here') primaryLabel = newPicks.length > 0 ? 'Follow' : 'Open Harvous';
  else if (switching) primaryLabel = church ? `Switch to ${church.name}` : 'Switch churches';
  else primaryLabel = 'Connect';

  function handlePrimary() {
    if (!isSignedIn) {
      goToSignUp();
      return;
    }
    if (connection === 'here' && newPicks.length === 0) {
      void navigate({ to: prototypeHomeRouteTo() as never });
      return;
    }
    void connect(switching || needsSwitchConfirm);
  }

  const failed = preview.isError;
  const expired = failed && preview.error instanceof APIError && preview.error.status === 410;

  return (
    <>
      {church ? <title>{`${church.name} | Harvous`}</title> : null}
      <div className="public-page">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />

        <div className="public-body">
          <div className="public-content">
            {preview.isLoading || (!data && !failed) ? (
              <div className="page-loading" />
            ) : !data || !church ? (
              <PublicErrorState
                title={expired ? 'This link is no longer active' : 'This link isn’t working'}
                message="Ask your church for its current Harvous link or QR code."
              />
            ) : (
              <>
                {/* Where the viewer stands goes in the kicker, once, rather than as a coloured
                    status line floating over the button. */}
                <p className="public-creator">
                  {connection === 'here' ? 'You’re connected' : 'Your church is on Harvous'}
                </p>

                <div className="public-card public-join-church">
                  <div className="public-join-church__head">
                    <span className="public-join-church__glyph" aria-hidden>
                      <Icon name="church" size={20} />
                    </span>
                    <div className="public-join-church__head-text">
                      <h1 className="public-card__title">{church.name}</h1>
                      {place ? <p className="public-card__meta">{place}</p> : null}
                    </div>
                  </div>

                  <p className="public-join-church__lede">
                    {data.channels.length === 0
                      ? 'Connect, and what your church publishes shows up on your Home beside your own study.'
                      : connection === 'here'
                        ? 'What these channels publish shows up on your Home, beside your own study.'
                        : 'Pick what to follow. What they publish shows up on your Home, beside your own study.'}
                  </p>

                  {channelGroups.map((group) => (
                    <div key={group.id ?? 'church-wide'} className="public-join-church__group">
                      {group.name ? (
                        <div className="public-join-church__group-head">
                          <span className="public-join-church__group-name">{group.name}</span>
                          {group.pickable.length > 1 ? (
                            <button
                              type="button"
                              className="public-join-church__group-all"
                              disabled={busy}
                              onClick={() => pickGroup(group.pickable)}
                            >
                              {group.pickable.every((id) => picked.has(id)) ? 'Clear' : 'Pick all'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      <ul className="public-join-church__channels">
                        {group.channels.map((channel) => {
                          const isYours = following.has(channel.id);
                          const isPicked = picked.has(channel.id);
                          const tile = (
                            <span
                              className="public-join-church__tile"
                              style={{ background: getThreadColorCSS(channel.color) }}
                              aria-hidden
                            >
                              <Icon name="rss" size={13} />
                            </span>
                          );
                          const text = (
                            <span className="public-join-church__channel-text">
                              <span className="public-join-church__channel-title">{channel.title}</span>
                              {channel.description ? (
                                <span className="public-join-church__channel-meta">{channel.description}</span>
                              ) : null}
                            </span>
                          );
                          return (
                            <li key={channel.id}>
                              {isYours ? (
                                /* Already theirs: a row with a quiet tag, not a disabled toggle. */
                                <div className="public-join-church__channel public-join-church__channel--static">
                                  {tile}
                                  {text}
                                  <span className="public-join-church__tag">
                                    {leading.has(channel.id) ? 'Leading' : 'Following'}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="public-join-church__channel"
                                  aria-pressed={isPicked}
                                  disabled={busy}
                                  onClick={() => toggle(channel.id)}
                                >
                                  {tile}
                                  {text}
                                  <span
                                    className={`public-join-church__check${isPicked ? ' public-join-church__check--on' : ''}`}
                                    aria-hidden
                                  >
                                    {isPicked ? <Icon name="check" size={11} /> : null}
                                  </span>
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}

                  <div className="public-join-church__foot">
                    {switching || needsSwitchConfirm ? (
                      <p className="public-join-church__notice" role="status">
                        {viewer?.elsewhereName
                          ? `You’re connected to ${viewer.elsewhereName}. Switching removes its channels from your Home.`
                          : 'You’re connected to another church. Switching removes its channels from your Home.'}
                      </p>
                    ) : null}
                    {message ? (
                      <p className="public-join-church__notice public-join-church__notice--error" role="alert">
                        {message}
                      </p>
                    ) : null}
                    <button type="button" className="public-cta-btn" disabled={busy} onClick={handlePrimary}>
                      {primaryLabel}
                    </button>
                    {!isSignedIn ? (
                      <button type="button" className="public-join-church__text-btn" onClick={() => goToSignUp(true)}>
                        I already have an account
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="public-footer public-footer--rich">
                  <span className="public-footer__tag">
                    Your notes stay yours. Your church shares its study with you, and never
                    sees what you write.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
