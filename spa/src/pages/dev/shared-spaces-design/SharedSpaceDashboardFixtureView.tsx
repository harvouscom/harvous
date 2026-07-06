/**
 * Renders the shared space dashboard from fixture data — design gallery and dev preview.
 */
import { useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { homeSpotlightThreadEyebrow } from '@/utils/prototype-home-trends';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import SharedSpaceNoteAuthorChip from '../../prototype/SharedSpaceNoteAuthorChip';
import SharedSpaceSocialGreeting from '../../prototype/SharedSpaceSocialGreeting';
import SharedSpaceAboutSheet from '../../prototype/SharedSpaceAboutSheet';
import PrototypeSpacePeopleSheet from '../../prototype/PrototypeSpacePeopleSheet';
import ProtoSpaceMenuIcon from '../../prototype/ProtoSpaceMenuIcon';
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

function FixtureNoteCard({
  slot,
  authorName,
  authorColor,
  isOwn,
}: {
  slot: SharedSpaceNoteCardSlot;
  authorName: string;
  authorColor: string;
  isOwn: boolean;
}) {
  const { note, eyebrow } = slot;
  const preview = noteRowPreview(note);

  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      onClick={() => {}}
    >
      <p className="proto-caption proto-home-card__eyebrow">{eyebrow}</p>
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <Icon name={noteKindIcon(note.noteType)} size={13} />
          </span>
          <p className="pds-list-title proto-home-card__title">{noteRowTitle(note)}</p>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
        {preview ? <p className="pds-list-preview proto-home-card__preview">{preview}</p> : null}
        <div className="proto-home-card__meta">
          <SharedSpaceNoteAuthorChip displayName={authorName} color={authorColor} isSelf={isOwn} />
          <span className="proto-home-card__meta-sep" aria-hidden>
            ·
          </span>
          <span className="proto-home-card__meta-item">2d</span>
        </div>
      </div>
    </button>
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
    spotlightThread,
    topPassage,
    noteCardSlots,
    resolveAuthor,
  } = fixture;

  const openPeopleSheet = () => {
    setAboutOpen(false);
    setPeopleOpen(true);
  };

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
        <div className="proto-home-view">
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

          {spotlightThread ? (
            <div className="proto-home-section">
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
              >
                <p className="proto-caption proto-home-card__eyebrow">
                  {homeSpotlightThreadEyebrow(spotlightThread.noteCount)}
                </p>
                <div className="proto-home-card__body">
                  <div className="proto-home-card__title-row">
                    <span className="proto-home-card__icon-orb" aria-hidden>
                      <Icon name="arrow-right-arrow-left" size={13} />
                    </span>
                    <p className="pds-list-title proto-home-card__title">{spotlightThread.title}</p>
                    <span className="proto-home-card__chevron" aria-hidden>
                      <Icon name="caret-right" size={11} />
                    </span>
                  </div>
                  <div className="proto-home-card__meta">
                    <span className="proto-home-card__meta-item">
                      {spotlightThread.noteCount} {spotlightThread.noteCount === 1 ? 'note' : 'notes'} in this space
                    </span>
                  </div>
                </div>
              </button>
            </div>
          ) : null}

          {topPassage ? (
            <div className="proto-home-section">
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
              >
                <p className="proto-caption proto-home-card__eyebrow">Showing up in your notes</p>
                <div className="proto-home-card__body">
                  <div className="proto-home-card__title-row">
                    <span className="proto-home-card__icon-orb" aria-hidden>
                      <Icon name="book" size={13} />
                    </span>
                    <p className="pds-list-title proto-home-card__title">{topPassage.displayRef}</p>
                    <span className="proto-home-card__chevron" aria-hidden>
                      <Icon name="caret-right" size={11} />
                    </span>
                  </div>
                  <div className="proto-home-card__meta">
                    <span className="proto-home-card__meta-item">
                      Across {topPassage.noteCount} {topPassage.noteCount === 1 ? 'note' : 'notes'} in this space
                    </span>
                  </div>
                </div>
              </button>
            </div>
          ) : null}

          {noteCardSlots.map((slot) => {
            const { isOwn, authorName, authorColor } = resolveAuthor(slot.note);
            return (
              <div key={slot.note.id} className="proto-home-section">
                <FixtureNoteCard slot={slot} authorName={authorName} authorColor={authorColor} isOwn={isOwn} />
              </div>
            );
          })}
        </div>
      </div>

      <SharedSpaceAboutSheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        space={fixtureToSpaceDetail(fixture)}
        members={members}
      />

      <PrototypeSpacePeopleSheet
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        spaceId={spaceId}
        spaceTitle={spaceTitle}
        spaceColor={spaceColor}
        spaceDescription={spaceDescription}
        viewerIsOwner={isOwner}
      />
    </div>
  );
}
