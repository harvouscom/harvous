import { useState, type CSSProperties, type ComponentProps, type ReactElement } from 'react';
import Icon from '@/components/react/Icon';
import { ChildNotebookCover, coverColors, coverPatterns, coverSymbols, useChildNotebookAppearance, type CoverSymbol } from './ChildNotebookAppearance';

/**
 * The notebook's cover studio in child Settings: colour, pattern and symbol, with the notebook
 * itself as the thing you're making. Three layouts are under review (Derek, Nov 2026); the
 * switch is preview-only and goes once one is picked.
 */
export type CoverStudioVariant = 'tray' | 'stickers' | 'steps';
const variantFromUrl = (() => {
  // Read at module load: the child entry strips the query string before it renders.
  const value = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('nbv');
  return value === 'a' ? 'tray' : value === 'c' ? 'steps' : value === 'b' ? 'stickers' : null;
})();

const patternLabels: Record<typeof coverPatterns[number], string> = { plain: 'Simple', dots: 'Dots', stripes: 'Stripes', gingham: 'Checks' };
const symbolLabel = (symbol: CoverSymbol) => symbol === 'initial' ? 'My initial' : symbol.replaceAll('-', ' ');
// A gentle, fixed tilt per sticker so the sheet looks hand-placed but never shuffles under a finger.
const stickerTilt = [-6, 4, -3, 7, -5, 3, -7, 5, -2];

type Group = 'color' | 'pattern' | 'symbol';
const groups: { id: Group; label: string; icon: ComponentProps<typeof Icon>['name']; question: string }[] = [
  { id: 'color', label: 'Color', icon: 'paintbrush', question: 'What color should it be?' },
  { id: 'pattern', label: 'Pattern', icon: 'table-cells', question: 'Plain or patterned?' },
  { id: 'symbol', label: 'Sticker', icon: 'star', question: 'Pick a sticker for the front' }
];

export default function ChildNotebookCoverStudio({ showVariantSwitch = false }: { showVariantSwitch?: boolean }) {
  const { name, preferences, coverColor, setCoverColor, coverPattern, setCoverPattern, coverSymbol, setCoverSymbol, playCue } = useChildNotebookAppearance();
  const [variant, setVariant] = useState<CoverStudioVariant>(variantFromUrl ?? 'stickers');
  const [tab, setTab] = useState<Group>('color');
  const [step, setStep] = useState(0);
  const initial = Array.from(name)[0]?.toUpperCase();
  const coverKey = `${coverColor.id}-${coverPattern}-${coverSymbol}`;

  function pick(apply: () => void) {
    playCue('nav.select');
    apply();
  }

  function surprise() {
    const choose = <T,>(items: readonly T[], current: T) => {
      const others = items.filter(item => item !== current);
      return others[Math.floor(Math.random() * others.length)];
    };
    playCue('highlight.created');
    setCoverColor(choose(coverColors, coverColor));
    setCoverPattern(choose(coverPatterns, coverPattern));
    setCoverSymbol(choose(coverSymbols, coverSymbol));
  }

  const colorOptions = (size: 'big' | 'paint') => <div className="pds-kids-studio__colors" data-size={size}>
    {coverColors.map(color => <label key={color.id} className="pds-kids-studio__color" style={{ '--kids-swatch': color.color } as CSSProperties}>
      <input type="radio" name="notebook-color" value={color.id} aria-label={color.label} checked={coverColor.id === color.id} onChange={() => pick(() => setCoverColor(color))} />
      <span aria-hidden="true">{coverColor.id === color.id && <Icon name="check" size={size === 'paint' ? 16 : 14} />}</span>
      <small>{color.label}</small>
    </label>)}
  </div>;

  const patternOptions = <div className="pds-kids-studio__patterns">
    {coverPatterns.map((pattern, index) => <label key={pattern} className="pds-kids-studio__pattern" style={{ '--kids-tilt': `${index % 2 ? 2 : -2}deg` } as CSSProperties}>
      <input type="radio" name="notebook-pattern" aria-label={patternLabels[pattern]} checked={coverPattern === pattern} onChange={() => pick(() => setCoverPattern(pattern))} />
      <span aria-hidden="true" data-pattern={pattern} />
      <small>{patternLabels[pattern]}</small>
    </label>)}
  </div>;

  const symbolOptions = <div className="pds-kids-studio__stickers">
    {coverSymbols.map((symbol, index) => <label key={symbol} className="pds-kids-studio__sticker" style={{ '--kids-tilt': `${stickerTilt[index % stickerTilt.length]}deg` } as CSSProperties}>
      <input type="radio" name="notebook-symbol" aria-label={symbolLabel(symbol)} checked={coverSymbol === symbol} onChange={() => pick(() => setCoverSymbol(symbol))} />
      <span aria-hidden="true">{symbol === 'initial' ? initial : <Icon name={symbol} size={20} />}</span>
    </label>)}
  </div>;

  const options: Record<Group, ReactElement> = { color: colorOptions('big'), pattern: patternOptions, symbol: symbolOptions };

  const stage = (caption: string) => <div className="pds-kids-studio__stage">
    <span key={coverKey} className="pds-kids-studio__book"><ChildNotebookCover name={name} preferences={preferences} large /></span>
    <div className="pds-kids-studio__stage-copy">
      <h2 className="pds-title">{name}’s notebook</h2>
      <p className="pds-caption">{caption}</p>
      <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-studio__surprise" onClick={surprise}>
        <Icon name="shuffle" size={14} aria-hidden /> Surprise me
      </button>
    </div>
  </div>;

  return <div className="pds-kids-studio" data-variant={variant} style={{ '--kids-cover-color': coverColor.color } as CSSProperties}>
    {showVariantSwitch && <div className="pds-kids-studio__variants" role="group" aria-label="Design to review">
      <span className="pds-caption">Design</span>
      {([['tray', 'A · Tool tray'], ['stickers', 'B · Sticker sheet'], ['steps', 'C · One at a time']] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={variant === id} onClick={() => { setVariant(id); setStep(0); }}>{label}</button>)}
    </div>}

    {variant === 'tray' && <>
      {stage('Make it yours. Tap a tool, then try things on.')}
      <div className="pds-kids-studio__tabs" role="group" aria-label="Cover tools">
        {groups.map(group => <button key={group.id} type="button" aria-pressed={tab === group.id} onClick={() => { if (tab !== group.id) playCue('nav.toggle'); setTab(group.id); }}>
          <Icon name={group.icon} size={16} aria-hidden />{group.label}
        </button>)}
      </div>
      <fieldset className="pds-kids-studio__tray"><legend className="pds-kids-studio__sr">{groups.find(group => group.id === tab)?.question}</legend>{options[tab]}</fieldset>
    </>}

    {variant === 'stickers' && <>
      {stage('Paint it, dress it up, and stick something on the front.')}
      <fieldset className="pds-kids-studio__row"><legend><Icon name="paintbrush" size={14} aria-hidden /> Paint it <span>{coverColor.label}</span></legend>{colorOptions('paint')}</fieldset>
      <fieldset className="pds-kids-studio__row"><legend><Icon name="table-cells" size={14} aria-hidden /> Dress it up <span>{patternLabels[coverPattern]}</span></legend>{patternOptions}</fieldset>
      <fieldset className="pds-kids-studio__row"><legend><Icon name="star" size={14} aria-hidden /> Stick it on</legend>{symbolOptions}</fieldset>
    </>}

    {variant === 'steps' && <>
      <div className="pds-kids-studio__stage pds-kids-studio__stage--center">
        <span key={coverKey} className="pds-kids-studio__book"><ChildNotebookCover name={name} preferences={preferences} large /></span>
      </div>
      <div className="pds-kids-studio__progress" aria-hidden="true">
        {[...groups, { id: 'done' }].map((group, index) => <span key={group.id} data-state={index < step ? 'done' : index === step ? 'current' : undefined} />)}
      </div>
      {step < groups.length ? <fieldset className="pds-kids-studio__step">
        <legend className="pds-title">{groups[step].question}</legend>
        {options[groups[step].id]}
      </fieldset> : <div className="pds-kids-studio__step pds-kids-studio__step--done">
        <p className="pds-title">Ta-da! That’s your notebook.</p>
        <p className="pds-caption">You can change it any time.</p>
      </div>}
      <div className="pds-kids-studio__step-actions">
        {step > 0 && <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => { playCue('nav.back'); setStep(step - 1); }}><Icon name="arrow-left" size={13} aria-hidden /> Back</button>}
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-studio__surprise" onClick={surprise}><Icon name="shuffle" size={14} aria-hidden /> Surprise me</button>
        {step < groups.length
          ? <button type="button" className="proto-settings-btn" onClick={() => { playCue('nav.forward'); setStep(step + 1); }}>Next <Icon name="arrow-right" size={13} aria-hidden /></button>
          : <button type="button" className="proto-settings-btn" onClick={() => { playCue('nav.back'); setStep(0); }}><Icon name="rotate-left" size={13} aria-hidden /> Start over</button>}
      </div>
    </>}
  </div>;
}
