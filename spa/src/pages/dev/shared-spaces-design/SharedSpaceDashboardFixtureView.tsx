/**
 * Renders the shared space dashboard from fixture data — design gallery and dev preview.
 */
import { useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { homeSpotlightThreadEyebrow } from '@/utils/prototype-home-trends';
import { sharedThreadNoteCountPreview } from '../../prototype/shared-space-dashboard';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import SharedSpaceNoteAuthorChip from '../../prototype/SharedSpaceNoteAuthorChip';
import SharedSpaceSocialGreeting from '../../prototype/SharedSpaceSocialGreeting';
import PrototypeSpacePeopleSheet from '../../prototype/PrototypeSpacePeopleSheet';
import PrototypeListEmptyState from '../../prototype/PrototypeListEmptyState';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
import PrototypeHomeRow from '../../prototype/PrototypeHomeRow';
import HomeSection from '../../prototype/PrototypeHomeSection';
import { useProtoHomeViewClassName } from '../../prototype/useProtoHomeViewEnter';
import { sharedSpacePeopleHeaderLabel, type SharedSpaceNoteCardSlot } from '../../prototype/shared-space-dashboard';
import type { SharedSpaceDashboardFixture } from './shared-space-dashboard-fixtures';
import { fixtureToSpaceDetail } from './shared-space-dashboard-fixtures';

const PREVIEW_MAX = 90;

function noteRowTitle(note: SpaceNoteRow): string {
  const stripped = stripServerAutoUntitledNoteTitleForDisplay(note.title ?? null);
  if (stripped) return stripped;
  const preview = stripHtmlForListPreview(note.content ?? '', 48);
  if (preview) return preview;
  return `Note N${note.simpleNoteId?.toString().padStart(3, '0') ?? ''}`;
}

function noteRowPreview(note: SpaceNoteRow): string {
  const titleUsesPreview =
    !stripServerAutoUntitledNoteTitleForDisplay(note.title ?? null) &&
    stripHtmlForListPreview(note.content ?? '', 48) === noteRowTitle(note);
  if (titleUsesPreview) return '';
  const raw = note.content ?? '';
  if (!raw.trim()) return '';
  return stripHtmlForListPreview(raw, PREVIEW_MAX);
}

function noteKindIcon(noteType: string | undefined): IconName {
  if (noteType === 'scripture') return 'book';
  if (noteType === 'resource') return 'link';
  return 'note-sticky';
}

/**
 * A note as a row, matching what the live dashboard renders.
 *
 * Still a fixture copy rather than the real component — the live view is bound to
 * `useActiveSpace`, `useSpace` and the nav query, which is why this harness exists at all.
 * But it now builds from the same `PrototypeHomeRow` the real one does, so the two can only
 * drift in *content*, not in anatomy. They had already drifted in anatomy: the live view
 * moved to rows and this scene kept previewing cards.
 */
function FixtureNoteRow({
  cardSlot,
  authorName,
  authorColor,
  isOwn,
  showEyebrow = true,
}: {
  cardSlot: SharedSpaceNoteCardSlot;
  authorName: string;
  authorColor: string;
  isOwn: boolean;
  showEyebrow?: boolean;
}) {
  const { note, eyebrow } = cardSlot;
  const preview = noteRowPreview(note);

  return (
    <PrototypeHomeRow
      icon={noteKindIcon(note.noteType)}
      title={noteRowTitle(note)}
      meta={[
        showEyebrow ? eyebrow : null,
        preview,
        <SharedSpaceNoteAuthorChip
          key="author"
          displayName={authorName}
          color={authorColor}
          isSelf={isOwn}
        />,
        '2d',
      ]}
      onClick={() => {}}
    />
  );
}

export default function SharedSpaceDashboardFixtureView({
  fixture,
  showFixtureBanner = false,
}: {
  fixture: SharedSpaceDashboardFixture;
  /** Design gallery only — explains that some blocks alternate in production. */
  showFixtureBanner?: boolean;
}) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const {
    spaceTitle,
    spaceColor,
    spaceId,
    spaceDescription,
    isOwner,
    peopleCount,
    bannerNewCount,
    members,
    contributorIntro,
    selfDisplayName,
    currentThread,
    spotlightThread,
    topPassage,
    noteCardSlots,
    resolveAuthor,
  } = fixture;

  const openPeopleSheet = () => {
    setAboutOpen(false);
    setPeopleOpen(true);
  };

  const homeViewClassName = useProtoHomeViewClassName(true, spaceId);

  return (
    <div className="proto-sidebar-root proto-shared-space-dashboard">
      {showFixtureBanner ? (
        <div
          className="proto-caption"
          style={{
            margin: '8px 12px 0',
            padding: '8px 10px',
            borderRadius: 10,
            background: 'var(--pds-fill-secondary)',
            color: 'var(--pds-text-secondary)',
          }}
          role="note"
        >
          Fixture preview — in the live app, the new-since line and social greeting do not appear together.
          {!isOwner ? ' Member view: no owner settings gear.' : null}
        </div>
      ) : import.meta.env.DEV && !isOwner ? (
        <div
          className="proto-caption"
          style={{
            margin: '8px 12px 0',
            padding: '6px 10px',
            borderRadius: 10,
            background: 'var(--pds-fill-secondary)',
            color: 'var(--pds-text-secondary)',
          }}
          role="note"
        >
          Dev fixture: member view — use <code style={{ fontSize: 11 }}>?sharedSpaceFixture=full</code> for owner
          settings.
        </div>
      ) : null}

      <div className="proto-shared-space-header">
        <div className="proto-shared-space-header__row">
          <ProtoSpaceMenuIcon color={spaceColor} size={30} radius={9} />
          <div className="proto-shared-space-header__meta">
            <div className="pds-list-title proto-shared-space-header__title" title={spaceTitle}>
              {spaceTitle}
            </div>
            <button type="button" className="proto-shared-space-header__people" onClick={openPeopleSheet}>
              <span>{sharedSpacePeopleHeaderLabel(peopleCount)}</span>
              {isOwner ? (
                <>
                  <span className="proto-shared-space-header__dot" aria-hidden>
                    ·
                  </span>
                  <span className="proto-shared-space-header__invite">Invite</span>
                </>
              ) : null}
            </button>
          </div>
          <div className="proto-shared-space-header__actions">
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              aria-label="About this space"
              title="About this space"
              onClick={() => setAboutOpen(true)}
            >
              <Icon name="circle-info" size={15} />
            </button>
            {isOwner ? (
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                title="Space settings"
                aria-label="Space settings"
                onClick={openPeopleSheet}
              >
                <Icon name="gear" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        <div className={homeViewClassName}>
          {bannerNewCount > 0 ? (
            <div className="proto-home-section">
              <p className="proto-home-greeting">
                {bannerNewCount === 1 ? (
                  <>
                    Since you were last here, there&apos;s{' '}
                    <button
                      type="button"
                      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
                      aria-label="View new notes"
                    >
                      <span>1 new note</span>
                    </button>{' '}
                    to catch up on.
                  </>
                ) : (
                  <>
                    Since you were last here, there are{' '}
                    <button
                      type="button"
                      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
                      aria-label="View new notes"
                    >
                      <span>{bannerNewCount} new notes</span>
                    </button>{' '}
                    to catch up on.
                  </>
                )}
              </p>
            </div>
          ) : null}

          {contributorIntro && !bannerNewCount ? (
            <div className="proto-home-section">
              <SharedSpaceSocialGreeting
                selfFirstName={selfDisplayName}
                intro={contributorIntro}
                presenceOthers={[]}
                onOpenNotes={() => {}}
                onOpenPeople={() => {}}
              />
            </div>
          ) : null}

          {/* Mirrors sharedThreadDashboardModel().showCurrentThreadBlock — members with
              no current Thread see nothing here rather than an empty-state apology. */}
          {currentThread || isOwner ? (
          <div className="proto-home-section">
            <p className="proto-caption proto-home-section__eyebrow">Current Thread</p>
            {currentThread ? (
              <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
                <PrototypeHomeRow
                  icon="arrow-right-arrow-left"
                  title={currentThread.title}
                  meta={[sharedThreadNoteCountPreview(currentThread.noteCount)]}
                  onClick={() => {}}
                />
              </div>
            ) : (
              <div className="proto-list-create-empty">
                <PrototypeListEmptyState iconName="arrow-right-arrow-left" title="No thread yet." />
                <button type="button" className="proto-shared-thread-action proto-shared-thread-action--primary">
                  Start a Thread
                </button>
              </div>
            )}
          </div>
          ) : null}

          {spotlightThread ? (
            <HomeSection title={homeSpotlightThreadEyebrow(spotlightThread.noteCount)}>
              <PrototypeHomeRow
                icon="arrow-right-arrow-left"
                title={spotlightThread.title}
                meta={[
                  `${spotlightThread.noteCount} ${spotlightThread.noteCount === 1 ? 'note' : 'notes'} in this space`,
                ]}
                onClick={() => {}}
              />
            </HomeSection>
          ) : null}

          {topPassage ? (
            <HomeSection title="Showing up in your notes">
              <PrototypeHomeRow
                icon="scroll"
                title={topPassage.displayRef}
                meta={[
                  `Across ${topPassage.noteCount} ${topPassage.noteCount === 1 ? 'note' : 'notes'} in this space`,
                ]}
                onClick={() => {}}
              />
            </HomeSection>
          ) : null}

          {/* Grouped into one section of rows, the way the live dashboard groups them —
              the heading carries the eyebrow so the rows drop their own. */}
          {noteCardSlots.length > 0 ? (
            <HomeSection title={noteCardSlots[0].eyebrow}>
              {noteCardSlots.map((slot) => {
                const { isOwn, authorName, authorColor } = resolveAuthor(slot.note);
                return (
                  <FixtureNoteRow
                    key={slot.note.id}
                    cardSlot={slot}
                    authorName={authorName}
                    authorColor={authorColor}
                    isOwn={isOwn}
                    showEyebrow={false}
                  />
                );
              })}
            </HomeSection>
          ) : null}
        </div>
      </div>

      {/*
        One sheet, two doors — the same merge the product made. `i` opens it on the room's
        letter, the gear on its settings; the fixture's space is passed in because there is no
        row behind it for `useSpace` to find.
      */}
      <PrototypeSpacePeopleSheet
        open={aboutOpen || peopleOpen}
        onOpenChange={(next) => {
          if (next) return;
          setAboutOpen(false);
          setPeopleOpen(false);
        }}
        initialView={aboutOpen ? 'letter' : 'details'}
        spaceDetail={fixtureToSpaceDetail(fixture)}
        spaceId={spaceId}
        spaceTitle={spaceTitle}
        spaceColor={spaceColor}
        spaceDescription={spaceDescription}
        viewerIsOwner={isOwner}
      />
    </div>
  );
}
