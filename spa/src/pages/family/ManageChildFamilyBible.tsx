import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHref } from '@/lib/prototype-path';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import ProtoConfirmDialog from '../prototype/ProtoConfirmDialog';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsSubScreen, SettingsToggleRow } from '../prototype/settings/SettingsShell';
import { api } from '../../lib/api';
import { childBibleTranslationChoices, childBibleTranslations, familyAddableBibleTranslations, type ChildBibleTranslation, type ChildFamilyReading, type ChildPassage } from '../../../../shared/child-notebook';
import type { ChildDetail } from './types';
import ChildBiblePassagePicker from './ChildBiblePassagePicker';

type Props = {
  detail: ChildDetail;
  backLabel: string;
  onBack: () => void;
  feedback: ReactNode;
  busy: boolean;
  perform: (work: () => Promise<unknown>, message: string) => Promise<void>;
};

export default function ManageChildFamilyBible({ detail, backLabel, onBack, feedback, busy, perform }: Props) {
  const { child, readings } = detail;
  const base = `/api/child-accounts/children/${encodeURIComponent(child.id)}/bible`;
  const translations = child.bibleTranslations;
  const translationChoices = childBibleTranslationChoices(translations, readings);
  const [passage, setPassage] = useState<ChildPassage>({ book: 'Psalms', chapter: 23, translation: translations[0] });
  const navigate = useNavigate();
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // The rest of the catalog, for a family that would rather read a translation they already use.
  const moreTranslations = familyAddableBibleTranslations.filter(translation => !translationChoices.includes(translation));
  const youngReader = (translation: ChildBibleTranslation) => (childBibleTranslations as readonly string[]).includes(translation);
  function toggle(translation: ChildBibleTranslation, enabled: boolean) {
    const approved = enabled ? [...translations, translation] : translations.filter(item => item !== translation);
    const name = getTranslation(translation)?.name ?? translation;
    void perform(() => api.put(`${base}/translations`, { translations: approved }), enabled ? `${name} added.` : '');
  }
  const [removal, setRemoval] = useState<{ reading: ChildFamilyReading; anchor: DOMRect } | null>(null);
  const active = child.status === 'active';
  const selectedPassage = translations.includes(passage.translation) ? passage : { ...passage, translation: translations[0] };
  const disabled = busy;

  return <SettingsSubScreen title="Family Bible" backLabel={backLabel} onBack={onBack}>
    <div className="proto-settings__content" role="region" aria-label="Family Bible settings">
      {feedback}
      <SettingsIntro>Manage the translations and chapters available to {child.displayName}.</SettingsIntro>
      <SettingsGroup>
        <SettingsRow label="Approved translations" leadingIcon="book-open" expanded={translationsOpen}
          sublabel={translations.map(translation => getTranslation(translation)?.name ?? translation).join(', ')}
          onClick={() => setTranslationsOpen(!translationsOpen)} />
        {translationsOpen && translationChoices.map(translation => (
          <SettingsToggleRow key={translation} label={getTranslation(translation)?.name ?? translation}
            sublabel={youngReader(translation) ? 'Written for young readers' : undefined}
            checked={translations.includes(translation)}
            disabled={disabled || !active || (translations.length === 1 && translations.includes(translation))}
            onChange={enabled => toggle(translation, enabled)} />
        ))}
        {translationsOpen && moreTranslations.length > 0 && <SettingsRow label="More translations" leadingIcon="plus"
          sublabel="Add one your family already reads" expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />}
        {translationsOpen && moreOpen && moreTranslations.map(translation => (
          <SettingsToggleRow key={translation} label={getTranslation(translation)?.name ?? translation}
            checked={false} disabled={disabled || !active} onChange={enabled => { if (enabled) toggle(translation, true); }} />
        ))}
      </SettingsGroup>
      {active && <SettingsGroup>
        <form className="pds-family-bible-share pds-family-stack" onSubmit={e => {
          e.preventDefault();
          void perform(() => api.post(`${base}/readings`, selectedPassage), 'Chapter shared in Family Bible.');
        }}>
          <h3 className="pds-list-title">Share a chapter</h3>
          <ChildBiblePassagePicker value={selectedPassage} translations={translations} onChange={setPassage} disabled={disabled} />
          <button type="submit" className="proto-settings-btn" disabled={disabled}><Icon name="book-open" size={14} aria-hidden /> Share chapter</button>
        </form>
      </SettingsGroup>}
      <div>
        <h3 className="pds-caption pds-family-enrollment-label">Shared chapters</h3>
        <SettingsGroup>
          {readings.length === 0 ? <SettingsRow label="No shared chapters yet" leadingIcon="book-open" trailing="none" /> : readings.map(reading => (
            <div className="pds-family-shared-chapter" key={reading.id}>
              <SettingsRow label={`${reading.book} ${reading.chapter}`} sublabel={`${reading.translation} · Open in Family Bible`}
                leadingIcon="book-open" disabled={disabled} onClick={() => void navigate({
                  to: prototypeHref('read/family/$childId/$readingId'),
                  params: { childId: child.id, readingId: reading.id }
                })} />
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={disabled}
                aria-label={`Remove shared reading ${reading.book} ${reading.chapter}`}
                onClick={event => setRemoval({ reading, anchor: event.currentTarget.getBoundingClientRect() })}>
                <Icon name="trash-can" size={14} aria-hidden />
              </button>
            </div>
          ))}
        </SettingsGroup>
      </div>
      {removal && <ProtoConfirmDialog anchorRect={removal.anchor} title="Remove shared reading?"
        description="This removes the chapter from Family Bible and deletes the thoughts on it."
        confirmLabel="Remove reading" onCancel={() => setRemoval(null)} onConfirm={() => {
          setRemoval(null);
          void perform(() => api.delete(`${base}/readings/${encodeURIComponent(removal.reading.id)}`), 'Reading removed.');
        }} />}
    </div>
  </SettingsSubScreen>;
}
