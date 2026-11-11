import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { childSchemes, coverColors, coverPatterns, coverSymbols, type ChildNotebookPreferences } from '../../../../shared/child-notebook';

const patternLabels = { plain: 'Simple', dots: 'Dots', stripes: 'Stripes', gingham: 'Checks' };
const schemeLabels = { system: 'Device', light: 'Light', dark: 'Dark' };
const symbolLabels = { initial: 'Initial', cross: 'Cross', leaf: 'Leaf', sun: 'Sun', star: 'Star',
  'book-open': 'Book', 'puzzle-piece': 'Puzzle piece', bookmark: 'Bookmark', 'wand-magic-sparkles': 'Sparkles' };

export function ChildCover({ preferences, name, avatar = false }: { preferences: ChildNotebookPreferences; name: string; avatar?: boolean }) {
  const color = coverColors.find(item => item.id === preferences.coverColor)?.color ?? coverColors[0].color;
  return <span className={avatar ? 'pds-child-app__avatar' : 'pds-child-app__cover'} aria-hidden="true"
    data-pattern={preferences.coverPattern} style={{ '--child-cover-color': color } as CSSProperties}>
    {preferences.coverSymbol === 'initial' ? Array.from(name)[0]?.toUpperCase() : <Icon name={preferences.coverSymbol} size={avatar ? 12 : 18} />}
  </span>;
}

export default function ChildNotebookSettings({ name, preferences, onSave, onClose }: {
  name: string; preferences: ChildNotebookPreferences;
  onSave: (preferences: ChildNotebookPreferences) => Promise<boolean>; onClose: () => void;
}) {
  const [pane, setPane] = useState<'notebook' | 'appearance' | 'comfort'>('notebook');
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="pds-child-settings" aria-labelledby="child-settings-title" onClose={onClose}
    onCancel={e => { if (saving) e.preventDefault(); }}>
    <header className="pds-child-settings__header">
      <h2 className="pds-title" id="child-settings-title">Settings</h2>
      <button type="button" className="pds-child-button pds-child-icon" aria-label="Close settings" disabled={saving} onClick={() => dialog.current?.close()}><Icon name="xmark" size={16} /></button>
    </header>
    <form onSubmit={async e => {
      e.preventDefault();
      if (saving) return;
      setSaving(true); setError('');
      try {
        if (await onSave(draft)) dialog.current?.close();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your settings.'); }
      finally { setSaving(false); }
    }}>
      <div className="pds-child-settings__layout">
        <nav className="pds-child-settings__nav" aria-label="Settings sections">
          {([['notebook', 'My notebook', 'book-open'], ['appearance', 'Appearance', 'paintbrush'], ['comfort', 'Sound & motion', 'volume-low']] as const).map(([id, label, icon]) =>
            <button type="button" key={id} className="pds-child-button" aria-pressed={pane === id} onClick={() => setPane(id)}><Icon name={icon} size={14} />{label}</button>)}
        </nav>
        <div className="pds-child-settings__pane pds-family-stack">
          {pane === 'notebook' && <>
            <div className="pds-child-settings__preview"><ChildCover preferences={draft} name={name} /><strong>{name}’s notebook</strong></div>
            <fieldset className="pds-child-setting-options"><legend>Cover color</legend>
              {coverColors.map(color => <button key={color.id} type="button" className="pds-child-button pds-child-swatch" aria-label={color.label}
                aria-pressed={draft.coverColor === color.id} style={{ background: color.color }} onClick={() => setDraft({ ...draft, coverColor: color.id })}>
                {draft.coverColor === color.id && <Icon name="check" size={14} />}
              </button>)}
            </fieldset>
            <fieldset className="pds-child-setting-options"><legend>Pattern</legend>
              {coverPatterns.map(pattern => <button type="button" key={pattern} className="pds-child-button" aria-pressed={draft.coverPattern === pattern}
                onClick={() => setDraft({ ...draft, coverPattern: pattern })}>{patternLabels[pattern]}</button>)}
            </fieldset>
            <fieldset className="pds-child-setting-options"><legend>Cover symbol</legend>
              {coverSymbols.map(symbol => <button type="button" key={symbol} className="pds-child-button pds-child-icon" aria-label={symbolLabels[symbol]}
                aria-pressed={draft.coverSymbol === symbol} onClick={() => setDraft({ ...draft, coverSymbol: symbol })}>
                {symbol === 'initial' ? Array.from(name)[0]?.toUpperCase() : <Icon name={symbol} size={16} />}
              </button>)}
            </fieldset>
          </>}
          {pane === 'appearance' && <>
            <fieldset className="pds-child-setting-options"><legend>Color scheme</legend>
              {childSchemes.map(scheme => <button key={scheme} type="button" className="pds-child-button" aria-pressed={draft.scheme === scheme}
                onClick={() => setDraft({ ...draft, scheme })}>{schemeLabels[scheme]}</button>)}
            </fieldset>
            <fieldset className="pds-child-setting-options"><legend>Reading and writing text</legend>
              <button type="button" className="pds-child-button" aria-pressed={draft.textSize === 'standard'} onClick={() => setDraft({ ...draft, textSize: 'standard' })}>Standard</button>
              <button type="button" className="pds-child-button" aria-pressed={draft.textSize === 'bigger'} onClick={() => setDraft({ ...draft, textSize: 'bigger' })}>Larger</button>
            </fieldset>
          </>}
          {pane === 'comfort' && <>
            <label className="pds-family-choice"><input type="checkbox" checked={draft.sounds} onChange={e => setDraft({ ...draft, sounds: e.target.checked })} /> Play app sounds</label>
            <label className="pds-family-choice"><input type="checkbox" checked={draft.reduceMotion} onChange={e => setDraft({ ...draft, reduceMotion: e.target.checked })} /> Reduce motion</label>
          </>}
        </div>
      </div>
      <footer className="pds-child-settings__footer">
        {error && <p role="alert">{error}</p>}
        <button className="pds-child-button" data-primary disabled={saving} type="submit"><Icon name="check" size={15} />{saving ? 'Saving…' : 'Done'}</button>
      </footer>
    </form>
  </dialog>;
}
