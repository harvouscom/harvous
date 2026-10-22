import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProtoReadOnlyNotePaper from '../ProtoReadOnlyNotePaper';

describe('ProtoReadOnlyNotePaper', () => {
  it('draws the body on the editor surface, marked read-only, inside the note sheet', () => {
    const { container } = render(<ProtoReadOnlyNotePaper title="Romans 8" html="<p>No condemnation</p>" />);
    const surface = container.querySelector('article')!;
    expect(surface.classList.contains('proto-editor-surface')).toBe(true);
    expect(surface.dataset.readonly).toBe('true');
    expect(surface.querySelector('.proto-editor-paper .card-full-editable__content-html')?.textContent).toBe(
      'No condemnation',
    );
    expect(surface.querySelector('h2.proto-note-readonly__title')?.textContent).toBe('Romans 8');
  });

  it('leaves out the sheet and an empty title for an inset body', () => {
    const { container } = render(<ProtoReadOnlyNotePaper variant="inset" title="  " html="<p>Body</p>" />);
    expect(container.querySelector('.proto-editor-paper')).toBeNull();
    expect(container.querySelector('h2.proto-note-readonly__title')).toBeNull();
  });

  it('shows plain-text references as pills only when asked', () => {
    const html = '<p>Read John 3:16</p>';
    const plain = render(<ProtoReadOnlyNotePaper html={html} />);
    expect(plain.container.querySelector('.scripture-pill')).toBeNull();
    const pilled = render(<ProtoReadOnlyNotePaper html={html} displayPills={{ noteId: 'note_1' }} />);
    expect(pilled.container.querySelector('.scripture-pill')?.getAttribute('data-scripture-reference')).toBe(
      'John 3:16',
    );
  });
});
