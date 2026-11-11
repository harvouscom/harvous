import { useState } from 'react';
import Icon from '@/components/react/Icon';
import type { ChildFamilyThought, ChildNotebookPreferences } from '../../../../shared/child-notebook';
import { ChildNotebookProfileAvatar } from '../prototype/ChildNotebookAppearance';

export function ChildFamilyThoughts({ thoughts, childName, preferences }: {
  thoughts: ChildFamilyThought[];
  childName: string;
  preferences: ChildNotebookPreferences | null;
}) {
  if (!thoughts.length) return null;
  return <ul className="pds-family-bible-thoughts" aria-label="Family thoughts">
    {thoughts.map(thought => <li key={thought.id}>
      {thought.role === 'child'
        ? <ChildNotebookProfileAvatar name={childName} preferences={preferences} small />
        : <span className="pds-family-bible-thoughts__avatar" aria-hidden="true"><Icon name="user-shield" size={12} /></span>}
      <div>
        <strong className="pds-subheadline">{thought.role === 'child' ? childName : 'Parent'}</strong>
        <p className="pds-family-note pds-subheadline">{thought.text}</p>
      </div>
    </li>)}
  </ul>;
}

export function ChildFamilyThoughtForm({ disabled, onSave }: { disabled?: boolean; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  return <form className="pds-family-stack pds-family-bible-thought-form" onSubmit={async e => {
    e.preventDefault();
    if (disabled || !text.trim()) return;
    if (await onSave(text)) setText('');
  }}>
    <textarea className="proto-settings-field__input" aria-label="Add a family thought" placeholder="Add a family thought…"
      value={text} maxLength={800} rows={2} onChange={e => setText(e.target.value)} disabled={disabled} />
    <button type="submit" className="proto-settings-btn" disabled={disabled || !text.trim()}>
      <Icon name="check" size={13} aria-hidden /> Save thought
    </button>
  </form>;
}
