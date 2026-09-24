/**
 * Every Review learning card, one per exercise family, in the real dock chrome.
 *
 * The place to look at and refine the cards side by side. Each is rendered in
 * `StudyDockCardShell` with the same stage, pieces and classes the dock uses, so a change to
 * `review-exercises.css` or to a piece shows here and in the app alike. Static: handlers are
 * no-ops and the data is fixture text.
 *
 * Where a family is still drawn inline in `PrototypeReviewDock.tsx` (the altered verse, the
 * keyword boxes, the writing areas, the result), this repeats that markup with the same classes.
 * As each family moves into `review-exercises/`, its card here should switch to the component so
 * the two cannot drift.
 */
import { Fragment, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { REVIEW_EXERCISE_FAMILIES } from '@/utils/review-exercise-families';
import { ExerciseStage } from '../../prototype/review-exercises/ExerciseStage';
import { ChoiceOptions } from '../../prototype/review-exercises/ChoiceOptions';
import { WordBankLine, WordTray } from '../../prototype/review-exercises/WordBank';
import { OrderSlots, OrderTray } from '../../prototype/review-exercises/OrderPieces';
import { GapLine } from '../../prototype/review-exercises/GapLine';
import { OpeningLine, PairRail, Rail } from '../../prototype/review-exercises/RailSlot';
import { InitialsTiles, MarkedExercise, WordTicks } from '../../prototype/review-exercises/VerseSurface';
import { BookShelf, NoteStrip, SpeakerScene, TagSlotScene } from '../../prototype/review-exercises/IllustratedScenes';
import ProtoLoadingDots from '../../prototype/ProtoLoadingDots';
import PrototypeReviewSample from '../../prototype/PrototypeReviewSample';
import type { ReviewSampleView, SampleExerciseKind } from '../../../hooks/queries/useReview';
import {
  REVIEW_ALMOST_COPY,
  REVIEW_ALTERED_CAPTION,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_CHECK_COPY,
  REVIEW_CONTEXT_OPEN_READER_COPY,
  REVIEW_ENOUGH_COPY,
  REVIEW_INITIALS_PLACEHOLDER,
  REVIEW_LOADING_LABEL,
  REVIEW_NEXT_COPY,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_REVEAL_COPY,
  REVIEW_REVEAL_FAILED_COPY,
  REVIEW_REVEAL_RETRY_COPY,
  REVIEW_TRUTH_LABEL,
  REVIEW_TRY_AGAIN_COPY,
} from '../../prototype/proto-review-copy';
import '../../../styles/review-exercises.css';

const none = () => {};
const noMark = () => undefined;
const noGiven = new Map<number, string>();

const JOHN_15_5 = ['“I am the vine; you are the ', '. The one who remains in me bears ', ' fruit.'];
const PSALM_23_1 = 'The LORD is my shepherd; I shall not want.';
const JOHN_3_16 =
  'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.';

type FamilyId = keyof typeof REVIEW_EXERCISE_FAMILIES;

/** The dock's own shell and header, so each card is the card as it appears in the app. */
function Card({
  family,
  label,
  translation,
  children,
}: {
  family?: FamilyId;
  /** Overrides the family's label in the header (the result card, the states). */
  label?: string;
  translation?: string;
  children: ReactNode;
}) {
  const name = label ?? (family ? REVIEW_EXERCISE_FAMILIES[family].label : '');
  return (
    <StudyDockCardShell
      rootClassName="proto-review-dock"
      accentColor="var(--pds-accent)"
      ariaLabel="Review"
      expanded
      animateEnter={false}
      onToggleExpanded={none}
      onDismiss={none}
      headerIcon={<Icon name="arrows-rotate" size={13} aria-hidden />}
      headerTitle={
        <span className="study-dock-card__header-primary-text">
          Review
          <span className="proto-review-dock__header-prompt">{name}</span>
          {translation ? (
            <span className="scripture-pill-chrome__trans-chip proto-review-dock__header-trans">{translation}</span>
          ) : null}
        </span>
      }
    >
      <div className="proto-review-dock__body">{children}</div>
    </StudyDockCardShell>
  );
}

/** One catalogue entry: the family, the rungs it covers, and its card. */
function Entry({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section id={id} style={{ display: 'grid', gap: 6, scrollMarginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
      <p className="pds-caption" style={{ margin: 0 }}>
        {note}
      </p>
      <div style={{ marginInline: -12 }}>{children}</div>
    </section>
  );
}

const hero = (text: string, scripture = true) => (
  <p className="rx-hero" data-scripture={scripture ? '' : undefined} data-size="lg">
    {text}
  </p>
);

const ENTRIES: { id: string; title: string; note: string; card: ReactNode }[] = [
  {
    id: 'blanks-bank',
    title: 'Blanks · word tiles',
    note: 'verse.rebuild, chapter.finish at tier 0. Tap a tile into the next gap; tap a gap to send it back.',
    card: (
      <Card family="blanks" translation="NET">
        <ExerciseStage
          task="Fill in the blanks in John 15:5."
          scene={
            <WordBankLine
              hero="lg"
              segments={JOHN_15_5}
              blankLengths={[8, 4]}
              values={['branches', '']}
              given={noGiven}
              partState={noMark}
              disabled={false}
              onClear={none}
            />
          }
          primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}
        >
          <WordTray bank={['spoken', 'branches', 'unless', 'bear', 'much']} values={['branches', '']} disabled={false} onPlace={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'blanks-typed',
    title: 'Blanks · typed',
    note: 'verse.rebuild, chapter.finish at tier 1 and 2. Gaps sized to their word until tier 2 withdraws the hint.',
    card: (
      <Card family="blanks" translation="NET">
        <ExerciseStage
          task="Fill in the blanks in John 15:5."
          scene={
            <GapLine
              hero="lg"
              segments={JOHN_15_5}
              blankLengths={[8, 4]}
              values={['branches', '']}
              given={noGiven}
              partState={noMark}
              disabled={false}
              onChange={none}
              onSubmit={none}
            />
          }
          primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}
        />
      </Card>
    ),
  },
  {
    id: 'letters-staged',
    title: 'First letters · staged',
    note: 'verse.initials at tier 0 and 1: a share of the words stand on their first letter.',
    card: (
      <Card family="letters" translation="ESV">
        <ExerciseStage
          task="Finish each word from its first letter in Psalm 23:1."
          scene={
            <GapLine
              hero="lg"
              segments={['The LORD is my ', '; I shall not ', '.']}
              blankLengths={[8, 4]}
              letters={['s', 'w']}
              values={['hepherd', '']}
              given={noGiven}
              partState={noMark}
              disabled={false}
              onChange={none}
              onSubmit={none}
            />
          }
          primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}
        />
      </Card>
    ),
  },
  {
    id: 'letters-full',
    title: 'First letters · whole verse',
    note: 'verse.initials at tier 2: each word a tile on its first letter, taking the reader’s word as they write. A word that has lost its letter is shown off, gently; the next tile is outlined.',
    card: (
      <Card family="letters" translation="ESV">
        <ExerciseStage
          task="Write Psalm 23:1 from its first letters."
          scene={<InitialsTiles initials="T L i m s; I s n w." typed="The Lord is my sheep" />}
          primary={{ label: REVIEW_CHECK_COPY, onClick: none }}
        >
          <textarea className="proto-review-dock__attempt" placeholder={REVIEW_INITIALS_PLACEHOLDER} rows={3} readOnly defaultValue="The Lord is my sheep" />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'memory-recall',
    title: 'From memory · finish it',
    note: 'verse.recall at tier 0 and 1: the way in, then the writing area, with a tick per word left to write, filled as words are written. Counted, never read.',
    card: (
      <Card family="memory" translation="ESV">
        <ExerciseStage
          task="Finish John 3:16."
          scene={hero('For God so loved the world, that he gave his only Son …')}
          primary={{ label: REVIEW_CHECK_COPY, onClick: none }}
        >
          <textarea className="proto-review-dock__attempt" placeholder={REVIEW_ATTEMPT_PLACEHOLDER} rows={3} readOnly defaultValue="that whoever believes in him" />
          <WordTicks total={12} typed="that whoever believes in him" />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'memory-reference',
    title: 'From memory · the reference alone',
    note: 'verse.recall at tier 2: only the reference, as the card. No ticks: the top tier withdraws the helpers.',
    card: (
      <Card family="memory" translation="ESV">
        <ExerciseStage
          task="Write John 3:16 from memory."
          scene={<p className="rx-reference">John 3:16</p>}
          primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}
        >
          <textarea className="proto-review-dock__attempt" placeholder={REVIEW_ATTEMPT_PLACEHOLDER} rows={3} readOnly />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'memory-keywords',
    title: 'From memory · name some words',
    note: 'verse.keywords. The verse stays off the card, so the boxes are the card.',
    card: (
      <Card family="memory" translation="ESV">
        <ExerciseStage task="Name three words from John 3:16." primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}>
          <p className="rx-keywords">
            {['loved', '', ''].map((word, index) => (
              <Fragment key={index}>
                {index > 0 ? ' ' : null}
                <input
                  type="text"
                  className="proto-review-dock__blank"
                  style={{ width: '9ch' }}
                  defaultValue={word}
                  aria-label={`Word ${index + 1}`}
                />
              </Fragment>
            ))}
          </p>
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'order',
    title: 'Put in order',
    note: 'verse.sequence, chapter.order. Tap pieces into the numbered places; tap a placed one to take it back.',
    card: (
      <Card family="order" translation="ESV">
        <ExerciseStage
          task="Put John 3:16 back in order."
          scene={
            <OrderSlots
              phrases={['that he gave', 'For God so loved', 'the world,', 'his only Son']}
              placed={[1, 2]}
              partState={noMark}
              disabled={false}
              onRemove={none}
            />
          }
          primary={{ label: REVIEW_CHECK_COPY, onClick: none, disabled: true }}
        >
          <OrderTray phrases={['that he gave', 'For God so loved', 'the world,', 'his only Son']} placed={[1, 2]} disabled={false} onPlace={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'next',
    title: 'What follows · next verse',
    note: 'verse.next. The verse on the rail and a place for what follows; shown empty. The label never names the next reference.',
    card: (
      <Card family="next" translation="ESV">
        <ExerciseStage
          task="Pick the verse that follows Psalm 23:1."
          scene={<Rail fromLabel="Psalm 23:1" from={<p>{PSALM_23_1}</p>} scripture slotLabel="Next verse" fill={null} trailing slotScripture />}
        >
          <ChoiceOptions
            options={['He makes me lie down in green pastures', 'He restores my soul', 'You prepare a table before me', 'Surely goodness and mercy']}
            opening
            disabled={false}
            onPick={none}
          />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'before',
    title: 'What follows · which comes first',
    note: 'verse.before. Two places: the pick goes first, the other follows it. Shown on its way to being marked.',
    card: (
      <Card family="next" translation="ESV">
        <ExerciseStage
          task="Pick which comes first in Psalm 23."
          scene={
            <PairRail
              options={['He restores my soul', 'He makes me lie down in green pastures']}
              fill={{ text: 'He makes me lie down in green pastures', state: 'picked' }}
            />
          }
        >
          <ChoiceOptions
            options={['He restores my soul', 'He makes me lie down in green pastures']}
            pending="He makes me lie down in green pastures"
            opening
            disabled
            onPick={none}
          />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'opening',
    title: 'How it begins',
    note: 'verse.recognize, chapter.verse. The reference and a gap at the head of the line; the rest of the verse is withheld.',
    card: (
      <Card family="opening" translation="ESV">
        <ExerciseStage task="Pick how Philippians 4:13 begins." scene={<OpeningLine reference="Philippians 4:13" fill={null} />}>
          <ChoiceOptions
            options={['I can do all things', 'I have learned in whatever state', 'My God will supply every need', 'Rejoice in the Lord always']}
            opening
            disabled={false}
            onPick={none}
          />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'locate',
    title: 'Where · which passage',
    note: 'verse.locate. A phrase from the verse; the reference is the answer.',
    card: (
      <Card family="where" translation="ESV">
        <ExerciseStage task="Say where this is from." scene={hero('“…I shall not want…”')}>
          <ChoiceOptions options={['Psalm 23:1', 'Psalm 121:1', 'Isaiah 40:31', 'John 10:11']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'book',
    title: 'Where · which book',
    note: 'verse.book. The whole Bible as a shelf of 66 spines; the offered books stand taller and are the only ones that come down. Shown after a wrong pick.',
    card: (
      <Card family="where" translation="ESV">
        <ExerciseStage
          task="Pick the book this is from."
          scene={hero('“…I shall not want…”')}
          missed
          say={<p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p>}
        >
          <BookShelf options={['Genesis', 'Psalms', 'Isaiah', 'John']} missed={['Isaiah']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'who',
    title: 'Who · a verse',
    note: 'verse.person. The verse as a speech bubble from a portrait that fills with the pick; the answers are portraits. Shown on its way to being marked.',
    card: (
      <Card family="who" translation="ESV">
        <ExerciseStage
          task="Pick who 1 Samuel 17:45 is about."
          scene={<SpeakerScene label="1 Samuel 17:45" quote={<p>You come to me with a sword and with a spear and with a javelin, but I come to you in the name of the LORD of hosts.</p>} fill={{ text: 'David', state: 'picked' }} />}
        >
          <ChoiceOptions options={['Saul', 'David', 'Jonathan', 'Samuel']} variant="portrait" pending="David" disabled onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'who-chapter',
    title: 'Who · a chapter',
    note: 'chapter.person. No single verse to quote, so the chapter’s name stands in the bubble.',
    card: (
      <Card family="who" translation="ESV">
        <ExerciseStage task="Pick who appears in John 3." scene={<SpeakerScene quote={<p>John 3</p>} fill={null} />}>
          <ChoiceOptions options={['Nicodemus', 'Lazarus', 'Martha', 'John the Baptist']} variant="portrait" disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'place',
    title: 'Places',
    note: 'verse.place, chapter.place. The verse, and a pin under it for the place it names; the answers carry a pin. (A map waits on place coordinates.)',
    card: (
      <Card family="place" translation="ESV">
        <ExerciseStage
          task="Pick the place Luke 2:4 names."
          scene={
            <TagSlotScene icon="location-dot" label="A place it names" fill={null}>
              {hero('And Joseph also went up from Galilee, from the town of Nazareth, to Judea, to the city of David, which is called Bethlehem.')}
            </TagSlotScene>
          }
        >
          <ChoiceOptions options={['Bethlehem', 'Capernaum', 'Jericho', 'Bethany']} variant="place" disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'theme',
    title: 'Theme',
    note: 'verse.theme. The verse, a tag under it, and the themes as tags. Shown marked right.',
    card: (
      <Card family="theme" translation="ESV">
        <ExerciseStage
          task="Pick the theme Psalm 23:1 carries."
          scene={
            <TagSlotScene icon="tag" label="A theme it carries" fill={{ text: 'Provision', state: 'right' }}>
              {hero(PSALM_23_1)}
            </TagSlotScene>
          }
        >
          <ChoiceOptions options={['Judgment', 'Provision', 'Exile', 'Wisdom']} variant="theme" correct="Provision" disabled onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'crossref',
    title: 'Cross-reference',
    note: 'verse.crossref. The verse, a link, and the place; shown after a wrong tap.',
    card: (
      <Card family="crossref" translation="ESV">
        <ExerciseStage
          task="Pick the passage Psalm 23:1 is cross-referenced with."
          scene={
            <Rail
              fromLabel="Psalm 23:1"
              from={<p>{PSALM_23_1}</p>}
              scripture
              slotLabel="Cross-referenced with"
              fill={{ text: 'Romans 3:23', state: 'wrong' }}
              join="link"
            />
          }
          missed
          say={<p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p>}
        >
          <ChoiceOptions options={['John 10:11', 'Romans 3:23', 'Genesis 1:1', 'Acts 2:38']} missed={['Romans 3:23']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'changed',
    title: 'Changed word',
    note: 'verse.altered. Never dressed as Scripture. The word tapped wears the mark in place; shown after a wrong tap, struck and spent.',
    card: (
      <Card family="changed" translation="ESV">
        <ExerciseStage
          task="One word in John 3:16 has been changed. Find it."
          sceneTone="altered"
          missed
          say={<p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p>}
          scene={
            <>
              <p className="rx-eyebrow">{REVIEW_ALTERED_CAPTION}</p>
              <p className="rx-hero" data-size="md">
                {JOHN_3_16.replace('world', 'church')
                  .split(' ')
                  .map((token, index) => (
                    <Fragment key={index}>
                      {index > 0 ? ' ' : null}
                      <button
                        type="button"
                        className="proto-review-dock__altered-word"
                        data-answer={token === 'gave' ? 'wrong' : undefined}
                        disabled={token === 'gave'}
                      >
                        {token}
                      </button>
                    </Fragment>
                  ))}
              </p>
            </>
          }
        />
      </Card>
    ),
  },
  {
    id: 'marked',
    title: 'What you marked',
    note: 'verse.marked. Pointing at an option paints its words in the verse with the highlighter. Live here: hover an option.',
    card: (
      <Card family="marked" translation="ESV">
        <MarkedExercise
          task="Pick the words you marked in Psalm 23:1."
          verse={PSALM_23_1}
          options={['The LORD is my', 'I shall not want.', 'my shepherd; I', 'is my shepherd;']}
          disabled={false}
          missed={[]}
          correct={null}
          pending={null}
          wrong={null}
          missedNow={false}
          onPick={none}
        />
      </Card>
    ),
  },
  {
    id: 'note',
    title: 'Which note',
    note: 'note.recognize. The reader’s line as a strip torn from a page, the marked span still marked, over a fan of their notes. Hover a note to lift it.',
    card: (
      <Card family="note">
        <ExerciseStage
          task="Pick the note this line is from."
          scene={
            <NoteStrip>
              <p>
                I didn&apos;t know you could have <strong>a relationship with God</strong>.
              </p>
            </NoteStrip>
          }
        >
          <ChoiceOptions options={['Start of it', 'The first book', 'Romans 8, slowly', 'My journey']} variant="note" disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'cited',
    title: 'Which passage',
    note: 'note.passage, note.annotation. The reader’s line on the rail (their prose, body face) and the passage it cites.',
    card: (
      <Card family="cited">
        <ExerciseStage
          task="Pick a passage you cited in Shepherd psalms."
          scene={
            <Rail
              fromLabel="Shepherd psalms"
              from={<p>“David writes from the field, not the throne…”</p>}
              slotLabel="A passage you cited"
              fill={null}
              join="link"
            />
          }
        >
          <ChoiceOptions options={['Psalm 100:3', 'Psalm 23:1', 'Ezekiel 34:11', 'John 10:14']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'linked',
    title: 'What you linked · from a note',
    note: 'note.connect. The note on the rail and the note it links to; shown marked right.',
    card: (
      <Card family="linked">
        <ExerciseStage
          task="Pick a note you linked to Shepherd psalms."
          scene={
            <Rail
              fromLabel="Shepherd psalms"
              from={<p>“Provision here is about presence, not supply.”</p>}
              slotLabel="Linked to"
              fill={{ text: 'The good shepherd', state: 'right' }}
              join="link"
            />
          }
        >
          <ChoiceOptions
            options={['Exile timeline', 'Sermon on contentment', 'The good shepherd', 'Advent, week one']}
            correct="The good shepherd"
            disabled
            onPick={none}
          />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'linked-verse',
    title: 'What you linked · from a verse',
    note: 'verse.connect. The verse on the rail and the note it was cited in.',
    card: (
      <Card family="linked" translation="ESV">
        <ExerciseStage
          task="Pick the note you cited Psalm 23:1 in."
          scene={<Rail fromLabel="Psalm 23:1" from={<p>{PSALM_23_1}</p>} scripture slotLabel="Cited in" fill={null} join="link" />}
        >
          <ChoiceOptions options={['Shepherd psalms', 'Exile timeline', 'Sermon on contentment', 'Advent, week one']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'self-rated',
    title: 'Self-rated · before the reveal',
    note: 'highlight, connection and Thread items: no answer key and no writing box (writing from memory is for Scripture). Think of it, then open the note.',
    card: (
      <Card label="Your note">
        <ExerciseStage task="What did you write about Romans 8:28?" primary={{ label: REVIEW_REVEAL_COPY, onClick: none }} />
      </Card>
    ),
  },
  {
    id: 'self-rated-verdict',
    title: 'Self-rated · judging it',
    note: 'After looking: all three answers, "I recalled it" the one accent. The paper-stack edge (ds-15, Review card origin) carries the same three.',
    card: (
      <Card label="Your note">
        <ExerciseStage
          task="What did you write about Romans 8:28?"
          scene={hero('And we know that for those who love God all things work together for good.')}
          actions={
            <>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact rx-primary">
                {REVIEW_REVEALED_ACK_COPY}
              </button>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact rx-primary">
                {REVIEW_ALMOST_COPY}
              </button>
              <button type="button" className="proto-settings-btn proto-settings-btn--compact rx-primary">
                {REVIEW_RECALLED_COPY}
              </button>
            </>
          }
        />
      </Card>
    ),
  },
  {
    id: 'missed',
    title: 'State · after a miss',
    note: 'Any choice card after a wrong tap: the option struck and spent, the band tinted, one more go.',
    card: (
      <Card family="where" translation="ESV">
        <ExerciseStage
          task="Pick the book this is from."
          scene={hero(PSALM_23_1)}
          missed
          say={<p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p>}
        >
          <ChoiceOptions options={['Genesis', 'Psalms', 'Isaiah', 'John']} missed={['Isaiah']} disabled={false} onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'right',
    title: 'State · marked right',
    note: 'The moment the server marks a tap right, before the result takes the card.',
    card: (
      <Card family="where" translation="ESV">
        <ExerciseStage task="Pick the book this is from." scene={hero(PSALM_23_1)}>
          <ChoiceOptions options={['Genesis', 'Psalms', 'Isaiah', 'John']} correct="Psalms" disabled onPick={none} />
        </ExerciseStage>
      </Card>
    ),
  },
  {
    id: 'loading',
    title: 'State · loading and failed',
    note: 'The question with dots where its exercise will be; a reveal that did not load.',
    card: (
      <div style={{ display: 'grid', gap: 12 }}>
        <Card family="opening" translation="ESV">
          <ExerciseStage
            task="Pick how Philippians 4:13 begins."
            scene={
              <div className="proto-review-dock__loading">
                <ProtoLoadingDots label={REVIEW_LOADING_LABEL} />
              </div>
            }
          />
        </Card>
        <Card family="opening" translation="ESV">
          <ExerciseStage
            task="Pick how Philippians 4:13 begins."
            scene={<p className="proto-review-dock__caption">{REVIEW_REVEAL_FAILED_COPY}</p>}
            primary={{ label: REVIEW_REVEAL_RETRY_COPY, onClick: none }}
          />
        </Card>
      </div>
    ),
  },
  {
    id: 'result',
    title: 'The result',
    note: 'The same card turned over: the question, what the reader picked, the verse as it reads, the verdict.',
    card: (
      <Card family="opening" translation="ESV">
        <div className="proto-review-dock__result">
          <div className="proto-review-dock__result-scroll">
            <p className="proto-review-dock__prompt proto-review-dock__prompt--asked">Pick the verse that is in Romans 14.</p>
            <div className="proto-review-dock__answer">
              <p className="proto-caption proto-review-dock__truth-label">What you picked</p>
              <p className="proto-review-dock__verse proto-review-dock__verse--yours proto-review-dock__verse--pick">
                <span data-answer="right">So then let us pursue what makes for…</span>
              </p>
            </div>
            <div className="proto-review-dock__answer">
              <p className="proto-caption proto-review-dock__truth-label">{REVIEW_TRUTH_LABEL}</p>
              <p className="proto-review-dock__verse proto-review-dock__verse--scripture">
                <sup className="verse-num">19</sup>So then let us pursue what makes for peace and for mutual upbuilding.
              </p>
            </div>
            <div className="proto-review-dock__verdict" data-outcome="recalled">
              <span className="proto-review-dock__verdict-icon" aria-hidden>
                <Icon name="check" size={13} />
              </span>
              <p className="proto-review-dock__result-text">
                <span className="proto-review-dock__result-outcome">{REVIEW_OUTCOME_ACK_COPY.recalled}</span>
                <span className="proto-review-dock__result-next">Back in 2 days.</span>
              </p>
            </div>
          </div>
          <div className="proto-review-dock__actions proto-review-dock__actions--footer">
            <button type="button" className="proto-settings-btn proto-settings-btn--compact">
              {REVIEW_NEXT_COPY}
            </button>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact">
              {REVIEW_ENOUGH_COPY}
            </button>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact">
              {REVIEW_CONTEXT_OPEN_READER_COPY}
            </button>
          </div>
        </div>
      </Card>
    ),
  },
  {
    id: 'sample',
    title: 'The free sample (Home)',
    note: 'PrototypeReviewSample, the one Review question a free account is offered, on Home. The same stage and pieces as the dock; the chooser swaps between the four ways of asking.',
    card: <SampleShowcase />,
  },
];

/*
 * The free sample, the real component, on fixture data: the one Review card a free account sees,
 * on Home rather than in the dock. The chooser works here by swapping fixtures, where on Home it
 * asks the server for the other question.
 */
const SAMPLE_FIXTURES: Record<SampleExerciseKind, ReviewSampleView['exercise']> = {
  blanks: {
    kind: 'blanks',
    cloze: {
      segments: ['“I am the vine; you are the ', '. The one who ', ' in me bears much fruit.'],
      blankLengths: [8, 7],
      bank: ['spoken', 'remains', 'branches', 'unless'],
    },
    blankCount: 2,
  },
  letters: { kind: 'letters', initials: 'I a t v; y a t b.', wordCount: 8 },
  order: { kind: 'order', phrases: ['you are the branches.', '“I am the vine;', 'The one who remains in me'] },
  next: {
    kind: 'next',
    options: ['You are already clean', 'If anyone does not remain in me', 'Remain in me, and I will remain in you'],
    verse: '“I am the vine; you are the branches. The one who remains in me — and I in him — bears much fruit.',
  },
};

function SampleShowcase() {
  const [kind, setKind] = useState<SampleExerciseKind>('blanks');
  return (
    <div className="proto-review-section" style={{ borderRadius: 16, border: '1px solid var(--pds-border-control)' }}>
      <PrototypeReviewSample
        key={kind}
        sample={{
          reference: 'John 15:5',
          source: 'yours',
          translation: 'NET',
          exercise: SAMPLE_FIXTURES[kind],
          available: ['blanks', 'letters', 'order', 'next'],
        }}
        day="gallery"
        maxAttempts={2}
        onSeePlus={none}
        onNotNow={none}
        onExerciseChange={setKind}
      />
    </div>
  );
}

export default function ReviewCardsScene() {
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 780 }}>
      {/* A jump list: 28 cards at full height is a long page. */}
      <nav aria-label="Review cards" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ENTRIES.map((entry) => (
          <a key={entry.id} href={`#${entry.id}`} className="proto-chip" style={{ textDecoration: 'none' }}>
            {entry.title}
          </a>
        ))}
      </nav>
      {ENTRIES.map((entry) => (
        <Entry key={entry.id} id={entry.id} title={entry.title} note={entry.note}>
          {entry.card}
        </Entry>
      ))}
    </div>
  );
}
