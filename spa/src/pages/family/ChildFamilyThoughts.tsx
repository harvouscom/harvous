import { useState } from 'react';
import type { ChildFamilyThought } from '../../../../shared/child-notebook';

export function ChildFamilyThoughts({ thoughts, childName }: { thoughts: ChildFamilyThought[]; childName: string }) {
  if (!thoughts.length) return null;
  return <ul className="pds-family-bible-thoughts" aria-label="Family thoughts">
    {thoughts.map(thought => <li key={thought.id}>
      <strong className="pds-caption">{thought.role === 'child' ? childName : 'Parent'}</strong>
      <p className="pds-family-note">{thought.text}</p>
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
    <label className="pds-family-stack">Add a family thought
      <textarea value={text} maxLength={800} rows={2} onChange={e => setText(e.target.value)} disabled={disabled} />
    </label>
    <button type="submit" className="pds-child-button" disabled={disabled || !text.trim()}>Save thought</button>
  </form>;
}
