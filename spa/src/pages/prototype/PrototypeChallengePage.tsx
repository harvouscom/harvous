/**
 * `/challenges/{id}` — one path, one step at a time.
 *
 * Every step ends with the reader owning something. That is the rule the page is built around,
 * so each step kind has a way to produce an artifact rather than just a Done button: a `link`
 * step opens the connect sheet, a `summary` step writes a note, an `evidence` step sends them
 * to the note to add the detail. Done is always available too — the reader may have done the
 * work outside the app, and a path that will not let you say so is a form, not a study aid.
 *
 * Skip is beside Done on every step and carries no penalty. A skipped step resolves, the path
 * still completes, and nothing anywhere calls it a miss. Someone who reads five prompts and
 * decides none of them is what they need has answered the challenge honestly.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import { useChallenge } from '../../hooks/queries/useChallenges';
import {
  useCompleteChallengeStep,
  useSetChallengeStatus,
} from '../../hooks/mutations/useChallengeMutations';
import { useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../hooks/useHasFeature';
import {
  CHALLENGE_ARCHIVE_COPY,
  CHALLENGE_PAUSE_COPY,
  CHALLENGE_RETIRED_COPY,
  CHALLENGE_STEP_DONE_COPY,
  CHALLENGE_STEP_SKIP_COPY,
} from './proto-review-copy';
import { prototypeChallengesRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { encodeNoteSlug } from '@/utils/ids';
import type { ChallengeStep } from '@/utils/challenge-templates';

export default function PrototypeChallengePage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { challengeId?: string };
  const challengeId = params.challengeId ?? null;
  const challenges = useHasFeature('challenges');
  const { isGuest } = useHarvousIdentity();
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const query = useChallenge(challengeId);
  const completeStep = useCompleteChallengeStep();
  const setStatus = useSetChallengeStatus();
  const createNote = useCreateSimpleNote();

  const [response, setResponse] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);

  const challenge = query.data?.challenge ?? null;
  const context = query.data?.context ?? null;

  const verseMarkup = useMemo(
    () => (context?.verseText ? { __html: context.verseText } : null),
    [context?.verseText],
  );

  /*
   * Before the pending check, which for a guest never resolves: both queries behind this
   * page are `enabled: authReady`, and a disabled query stays pending forever — so this
   * route showed a guest a spinner with no end. The list page already answers this way.
   */
  if (isGuest) {
    return (
      <div className="proto-feed">
        <article className="proto-feed-sheet">
          <header className="proto-feed-sheet__head">
            <div className="proto-feed-sheet__title">
              <h2 className="proto-feed-sheet__day">Challenges</h2>
            </div>
          </header>
          <div className="proto-feed-sheet__body">
            <p className="proto-feed-sheet__rest">
              A challenge is a short path through study you have already written. Make an
              account to start building one.
            </p>
          </div>
        </article>
      </div>
    );
  }

  if (query.isPending || !challenges.ready) {
    return <ProtoSpaceLoading label="Loading this challenge" />;
  }

  if (!challenge) {
    return (
      <div className="proto-feed">
        <article className="proto-feed-sheet">
          <div className="proto-feed-sheet__body">
            <p className="proto-feed-sheet__rest">This challenge is no longer here.</p>
          </div>
        </article>
      </div>
    );
  }

  const step: ChallengeStep | undefined = challenge.steps[challenge.currentStepIndex];
  const finished = challenge.status === 'completed';
  const retired = challenge.status === 'retired';

  const resolve = (status: 'done' | 'skipped', artifactNoteId?: string) => {
    if (!step) return;
    completeStep.mutate(
      {
        challengeId: challenge.id,
        stepKey: step.key,
        status,
        artifactNoteId,
        response: response.trim() || undefined,
      },
      { onSuccess: () => setResponse('') },
    );
  };

  /**
   * A summary step writes a real note, titled after the path.
   *
   * The reader's own words become an ordinary note in their library — searchable, connectable,
   * theirs — rather than a string in a JSON column that only this page can show them. The note
   * id goes on the step, so the finished path can point back at what it produced.
   */
  const writeSummaryNote = () => {
    if (!homeSpaceId || !response.trim()) {
      resolve('done');
      return;
    }
    createNote.mutate(
      {
        spaceId: homeSpaceId,
        title: challenge.title,
        content: `<p>${escapeHtml(response.trim())}</p>`,
      },
      {
        onSuccess: (result) => {
          // An offline-queued create has no server id yet; the step still resolves, it just
          // does not get a link back to the note until the queue drains.
          const created = (result as { note?: { id?: string } })?.note;
          resolve('done', typeof created?.id === 'string' ? created.id : undefined);
        },
        onError: () => resolve('done'),
      },
    );
  };

  return (
    <div className="proto-feed">
      <article className="proto-feed-sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            <h2 className="proto-feed-sheet__day">{challenge.title}</h2>
            <button
              type="button"
              className="proto-sidebar-back-tile proto-feed-sheet__forward"
              onClick={() => void navigate({ to: prototypeChallengesRouteTo() })}
              aria-label="Back to challenges"
              title="Back to challenges"
            >
              <Icon name="caret-right" size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="proto-feed-sheet__body proto-challenge">
          {/* Written by the note cascade when a source note is deleted. Said plainly, because
              the alternative is a path that silently stops and reads as the reader's fault. */}
          {retired ? <p className="proto-feed-sheet__rest">{CHALLENGE_RETIRED_COPY}</p> : null}

          {finished ? (
            <p className="proto-feed-sheet__rest">
              You worked all the way through this. What you wrote is in your notes.
            </p>
          ) : null}

          {verseMarkup ? (
            <div className="proto-challenge__verse proto-challenge__verse--scripture" dangerouslySetInnerHTML={verseMarkup} />
          ) : null}
          {context?.cloze ? (
            <p className="proto-challenge__cloze">{context.cloze.display}</p>
          ) : null}

          {step && !finished && !retired ? (
            <section className="proto-challenge__step">
              <p className="proto-caption">
                {/* A position, not a score. */}
                Step {challenge.currentStepIndex + 1} of {challenge.totalSteps}
              </p>
              <h3 className="proto-challenge__step-title">{step.title}</h3>
              <p className="proto-challenge__step-prompt">{step.prompt}</p>

              {step.kind !== 'link' ? (
                <textarea
                  className="proto-challenge__response"
                  placeholder="Write it here, or work in the note itself"
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={4}
                />
              ) : null}

              <div className="proto-challenge__actions">
                {step.kind === 'link' ? (
                  <button
                    type="button"
                    className="proto-settings-btn"
                    onClick={() => setConnectOpen(true)}
                  >
                    Link a note
                  </button>
                ) : null}

                {(step.kind === 'evidence' || step.kind === 'recall') && challenge.sourceNoteId ? (
                  <button
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary"
                    onClick={() =>
                      void navigate({
                        to: prototypeNoteRouteTo(),
                        params: { noteId: encodeNoteSlug(challenge.sourceNoteId!) },
                      })
                    }
                  >
                    Open the note
                  </button>
                ) : null}

                <button
                  type="button"
                  className="proto-settings-btn"
                  disabled={completeStep.isPending || createNote.isPending}
                  onClick={() => (step.kind === 'summary' ? writeSummaryNote() : resolve('done'))}
                >
                  {CHALLENGE_STEP_DONE_COPY}
                </button>
                {/* Beside Done, not hidden in a menu. Skipping is a real answer and should cost
                    exactly as much as finishing. */}
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  disabled={completeStep.isPending}
                  onClick={() => resolve('skipped')}
                >
                  {CHALLENGE_STEP_SKIP_COPY}
                </button>
              </div>
            </section>
          ) : null}

          <PrototypeHomeSection title="The path">
            {challenge.steps.map((s, index) => (
              <PrototypeHomeRow
                key={s.key}
                icon={
                  s.status === 'done'
                    ? 'circle-check'
                    : s.status === 'skipped'
                      ? 'circle-minus'
                      : 'list-check'
                }
                title={s.title}
                meta={[
                  index === challenge.currentStepIndex && !finished ? 'Where you are' : null,
                  s.artifactNoteId ? 'Made a note' : null,
                ]}
                chevron={Boolean(s.artifactNoteId)}
                onClick={
                  s.artifactNoteId
                    ? () =>
                        void navigate({
                          to: prototypeNoteRouteTo(),
                          params: { noteId: encodeNoteSlug(s.artifactNoteId!) },
                        })
                    : undefined
                }
              />
            ))}
          </PrototypeHomeSection>

          {!finished && !retired ? (
            <div className="proto-challenge__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                onClick={() =>
                  setStatus.mutate({ challengeId: challenge.id, status: 'paused' })
                }
              >
                {CHALLENGE_PAUSE_COPY}
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                onClick={() =>
                  setStatus.mutate({ challengeId: challenge.id, status: 'archived' })
                }
              >
                {CHALLENGE_ARCHIVE_COPY}
              </button>
            </div>
          ) : null}
        </div>
      </article>

      {/* The same picker the note editor uses to connect notes — a link step should make the
          identical kind of edge, not a challenge-shaped imitation of one. */}
      {homeSpaceId && challenge.sourceNoteId ? (
        <PrototypeConnectNoteSheet
          open={connectOpen}
          onOpenChange={setConnectOpen}
          spaceId={homeSpaceId}
          parentNoteId={challenge.sourceNoteId}
          placement="centered"
          onConnectedWithThread={(_studyThreadId, linkedNoteId) => {
            setConnectOpen(false);
            resolve('done', linkedNoteId);
          }}
        />
      ) : null}
    </div>
  );
}

/** The reader's summary goes into note HTML, so their angle brackets stay their angle brackets. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
