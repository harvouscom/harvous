import { useState, type CSSProperties, type ComponentProps, type ReactElement } from 'react';
import Icon from '@/components/react/Icon';
import { ChildNotebookCover, coverBindings, coverColors, coverPatterns, coverSymbols, notebookPapers, useChildNotebookAppearance, type CoverSymbol } from './ChildNotebookAppearance';
import ChildCoverSymbol from './ChildCoverSymbol';

/**
 * The notebook's cover studio in child Settings: colour, pattern, sticker, binding and pages, with the notebook
 * itself as the thing you're making, one question at a time. Derek picked this layout over a
 * tool tray and a sticker sheet (Nov 2026); the step bar doubles as the way to jump around.
 */

const patternLabels: Record<typeof coverPatterns[number], string> = { plain: 'Simple', dots: 'Dots', stripes: 'Stripes', gingham: 'Checks' };
const symbolLabel = (symbol: CoverSymbol) => symbol === 'initial' ? 'My initial' : symbol.replaceAll('-', ' ');
const bindingLabels: Record<typeof coverBindings[number], string> = { classic: 'Classic', spiral: 'Spiral', stitched: 'Stitched', band: 'Band' };
const paperLabels: Record<typeof notebookPapers[number], string> = { plain: 'Plain', lined: 'Lined', dotted: 'Dotted', grid: 'Grid' };
// A gentle, fixed tilt per sticker so the sheet looks hand-placed but never shuffles under a finger.
const stickerTilt = [-6, 4, -3, 7, -5, 3, -7, 5, -2];

type Group = 'color' | 'pattern' | 'symbol' | 'binding' | 'paper';
const groups: { id: Group; label: string; icon: ComponentProps<typeof Icon>['name']; question: string }[] = [
  { id: 'color', label: 'Color', icon: 'paintbrush', question: 'What color should it be?' },
  { id: 'pattern', label: 'Pattern', icon: 'table-cells', question: 'Plain or patterned?' },
  { id: 'symbol', label: 'Sticker', icon: 'star', question: 'Pick a sticker for the front' },
  { id: 'binding', label: 'Binding', icon: 'link', question: 'How is it bound?' },
  { id: 'paper', label: 'Pages', icon: 'file-lines', question: 'What are the pages like inside?' }
];

export default function ChildNotebookCoverStudio() {
  const { name, preferences, coverColor, setCoverColor, coverPattern, setCoverPattern, coverSymbol, setCoverSymbol, coverBinding, setCoverBinding, paper, setPaper, playCue } = useChildNotebookAppearance();
  const [step, setStep] = useState(0);
  const initial = Array.from(name)[0]?.toUpperCase();
  const coverKey = `${coverColor.id}-${coverPattern}-${coverSymbol}-${coverBinding}`;

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
    setCoverBinding(choose(coverBindings, coverBinding));
  }

  const colorOptions = <div className="pds-kids-studio__colors">
    {coverColors.map(color => <label key={color.id} className="pds-kids-studio__color" style={{ '--kids-swatch': color.color } as CSSProperties}>
      <input type="radio" name="notebook-color" value={color.id} aria-label={color.label} checked={coverColor.id === color.id} onChange={() => pick(() => setCoverColor(color))} />
      <span aria-hidden="true">{coverColor.id === color.id && <Icon name="check" size={14} />}</span>
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
      <span aria-hidden="true">{symbol === 'initial' ? initial : <ChildCoverSymbol symbol={symbol} size={20} />}</span>
    </label>)}
  </div>;

  // Each binding is shown on a little copy of their own notebook, so the choice is the result.
  const bindingOptions = <div className="pds-kids-studio__bindings">
    {coverBindings.map(binding => <label key={binding} className="pds-kids-studio__binding">
      <input type="radio" name="notebook-binding" aria-label={bindingLabels[binding]} checked={coverBinding === binding} onChange={() => pick(() => setCoverBinding(binding))} />
      <span aria-hidden="true"><ChildNotebookCover name={name} preferences={{ ...preferences, coverBinding: binding }} /></span>
      <small>{bindingLabels[binding]}</small>
    </label>)}
  </div>;

  const paperOptions = <div className="pds-kids-studio__papers">
    {notebookPapers.map((option, index) => <label key={option} className="pds-kids-studio__paper" style={{ '--kids-tilt': `${index % 2 ? 2 : -2}deg` } as CSSProperties}>
      <input type="radio" name="notebook-paper" aria-label={paperLabels[option]} checked={paper === option} onChange={() => pick(() => setPaper(option))} />
      <span aria-hidden="true" data-paper={option} />
      <small>{paperLabels[option]}</small>
    </label>)}
  </div>;

  const options: Record<Group, ReactElement> = { color: colorOptions, pattern: patternOptions, symbol: symbolOptions, binding: bindingOptions, paper: paperOptions };

  return <div className="pds-kids-studio" style={{ '--kids-cover-color': coverColor.color } as CSSProperties}>
    <div className="pds-kids-studio__stage pds-kids-studio__stage--center">
      <span key={coverKey} className="pds-kids-studio__book"><ChildNotebookCover name={name} preferences={preferences} large /></span>
    </div>
    {/* The progress is the way around: each step is a stop you can tap, and the one you're on
        opens up to say its name, so you can see where you are and jump to any part. */}
    <nav className="pds-kids-studio__progress" aria-label="Cover steps">
      {[...groups, { id: 'done' as const, label: 'Done', icon: 'check' as const }].map((group, index) =>
        <button key={group.id} type="button" aria-current={index === step ? 'step' : undefined}
          aria-label={`${group.label}, step ${index + 1} of ${groups.length + 1}`}
          data-state={index < step ? 'done' : undefined}
          onClick={() => { if (index !== step) { playCue(index < step ? 'nav.back' : 'nav.forward'); setStep(index); } }}>
          <Icon name={group.icon} size={15} aria-hidden />
          {index === step && <span aria-hidden="true">{group.label}</span>}
        </button>)}
    </nav>
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
  </div>;
}
