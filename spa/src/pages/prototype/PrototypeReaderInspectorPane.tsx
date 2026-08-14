/**
 * Reader details — the inspector's content when a chapter is the open document.
 *
 * Same pane, same place, same orb as note details: `.proto-inspector` sections with
 * `PrototypeSectionHeader`, portaled into the shell's right-panel host by the caller. Only
 * the contents differ, because what you want to adjust about a chapter (how it reads) is
 * not what you want to know about a note (where it lives).
 */
import { useSyncExternalStore } from 'react';
import { PrototypeSectionHeader } from './design-system';
import ProtoSelectMenu from './ProtoSelectMenu';
import {
  READER_TEXT_SIZES,
  getReadingPrefsServerSnapshot,
  getReadingPrefsSnapshot,
  subscribeReadingPrefs,
  writeReadingPrefs,
  type ReaderTextSize,
} from '../../lib/proto-reading-prefs';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import {
  FONT_CHOICES,
  getFontPrefsServerSnapshot,
  getFontPrefsSnapshot,
  subscribeFontPrefs,
  type FontChoice,
} from '../../lib/proto-font-prefs';
import { AppearancePreviewTile } from './settings/AppearancePreviewTile';

export interface PrototypeReaderInspectorPaneProps {
  book: string;
  chapter: number;
  translation: string;
  /** Verses in the chapter — the one fact about *this* chapter worth stating. */
  verseCount?: number;
  onChangeTranslation: (translation: string) => void;
  /** Session-only face for the reading canvas; null = follow the Appearance default. */
  fontOverride: FontChoice | null;
  onChangeFontOverride: (choice: FontChoice | null) => void;
}

/** Same row chrome as the note inspector's Info rows. */
function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">{label}</span>
      <span className="proto-inspector-row-value">{value}</span>
    </div>
  );
}

export default function PrototypeReaderInspectorPane({
  book,
  chapter,
  translation,
  verseCount,
  onChangeTranslation,
  fontOverride,
  onChangeFontOverride,
}: PrototypeReaderInspectorPaneProps) {
  const prefs = useSyncExternalStore(
    subscribeReadingPrefs,
    getReadingPrefsSnapshot,
    getReadingPrefsServerSnapshot,
  );

  const setTextSize = (textSize: ReaderTextSize) => writeReadingPrefs({ ...prefs, textSize });

  // The Default tile previews the face it would fall back to, so "Default" is not a blank.
  const { reading: defaultFace } = useSyncExternalStore(
    subscribeFontPrefs,
    getFontPrefsSnapshot,
    getFontPrefsServerSnapshot,
  );

  return (
    <div className="proto-inspector">
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Passage</PrototypeSectionHeader>
        <div className="proto-reader-inspector__rows">
          <InspectorRow label="Book" value={book} />
          <InspectorRow label="Chapter" value={String(chapter)} />
          {verseCount ? <InspectorRow label="Verses" value={String(verseCount)} /> : null}
        </div>
      </section>

      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Translation</PrototypeSectionHeader>
        {/* `ProtoSelectMenu`, never a native <select> — eleven translations is a list to
            pick from, not eleven rows worth of a panel. */}
        <ProtoSelectMenu
          label="Translation"
          value={translation}
          // Abbreviation only. The trigger and the menu rows share one label, and an
          // abbreviation is how a reader picks a translation — it also cannot outgrow a
          // 300px panel, so the trigger never truncates.
          options={TRANSLATION_ORDER.map((id) => ({
            value: id,
            label: TRANSLATIONS[id]?.abbreviation ?? id,
          }))}
          onChange={onChangeTranslation}
        />
        {/* The full name that the abbreviation stands for. Long ones ("New American
            Standard Bible 1995") outrun the panel, so it marquees on hover rather than
            ending in an ellipsis that hides which edition this is. */}
        <p className="proto-reader-inspector__translation-name pds-footnote proto-marquee">
          <span>{TRANSLATIONS[translation]?.name ?? ''}</span>
        </p>
      </section>

      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Typeface</PrototypeSectionHeader>
        {/* The same specimen tiles as Appearance → Type, so "choose a face" looks the same
            wherever it is offered — and each tile shows the face rather than naming it.
            One tile per face, no separate "Default" tile: that tile was always a second copy
            of whichever face the default already is, so the panel showed the same specimen
            twice with two names for it. The default is a property of one of these faces, not
            a fifth option, so it is marked with a chip instead.
            Picking that face clears the override rather than pinning it, so the reader keeps
            following Appearance if the default changes later. */}
        <div
          className="proto-appearance-carousel proto-reader-inspector__faces"
          role="listbox"
          aria-label="Reading typeface for this session"
        >
          {FONT_CHOICES.map((choice) => {
            const isDefault = choice.id === defaultFace;
            return (
              <AppearancePreviewTile
                key={choice.id}
                label={choice.label}
                badge={isDefault ? 'Default' : undefined}
                selected={(fontOverride ?? defaultFace) === choice.id}
                sampleFont={choice.id}
                onClick={() => onChangeFontOverride(isDefault ? null : choice.id)}
              />
            );
          })}
        </div>
      </section>

      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Text size</PrototypeSectionHeader>
        {/* Same segmented control as appearance settings — one control for "pick one of a
            few", rather than a second style of chooser in a second panel. */}
        <div className="proto-appearance-segmented" role="group" aria-label="Text size">
          {READER_TEXT_SIZES.map((step) => (
            <button
              key={step.id}
              type="button"
              className="proto-appearance-segmented__btn"
              data-active={prefs.textSize === step.id ? 'true' : 'false'}
              aria-pressed={prefs.textSize === step.id}
              aria-label={`Text size ${step.label}`}
              onClick={() => setTextSize(step.id)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </section>

      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Reading</PrototypeSectionHeader>
        {/* Named setting + an explicit On/Off, using the same segmented control as text
            size. A single highlighted chip in a track reads as a segmented control missing
            its other option — you cannot tell whether it is a state or the only choice.
            Spelling out both ends removes the guess. */}
        <div className="proto-reader-inspector__setting">
          <span className="proto-reader-inspector__setting-label">Layout</span>
          <div
            className="proto-appearance-segmented proto-reader-inspector__switch"
            role="group"
            aria-label="Verse layout"
          >
            <button
              type="button"
              className="proto-appearance-segmented__btn"
              data-active={prefs.verseLayout === 'prose' ? 'true' : 'false'}
              aria-pressed={prefs.verseLayout === 'prose'}
              onClick={() => writeReadingPrefs({ ...prefs, verseLayout: 'prose' })}
            >
              Prose
            </button>
            <button
              type="button"
              className="proto-appearance-segmented__btn"
              data-active={prefs.verseLayout === 'lines' ? 'true' : 'false'}
              aria-pressed={prefs.verseLayout === 'lines'}
              onClick={() => writeReadingPrefs({ ...prefs, verseLayout: 'lines' })}
            >
              Lines
            </button>
          </div>
        </div>

        <div className="proto-reader-inspector__setting">
          <span className="proto-reader-inspector__setting-label">Verse numbers</span>
          <div
            className="proto-appearance-segmented proto-reader-inspector__switch"
            role="group"
            aria-label="Verse numbers"
          >
            <button
              type="button"
              className="proto-appearance-segmented__btn"
              data-active={prefs.showVerseNumbers ? 'true' : 'false'}
              aria-pressed={prefs.showVerseNumbers}
              onClick={() => writeReadingPrefs({ ...prefs, showVerseNumbers: true })}
            >
              On
            </button>
            <button
              type="button"
              className="proto-appearance-segmented__btn"
              data-active={!prefs.showVerseNumbers ? 'true' : 'false'}
              aria-pressed={!prefs.showVerseNumbers}
              onClick={() => writeReadingPrefs({ ...prefs, showVerseNumbers: false })}
            >
              Off
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
