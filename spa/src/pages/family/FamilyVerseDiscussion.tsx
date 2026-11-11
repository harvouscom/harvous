import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import type { ChildFamilyThought, ChildNotebookPreferences } from '../../../../shared/child-notebook';
import { ChildNotebookProfileAvatar } from '../prototype/ChildNotebookAppearance';
import ProtoLoadingDots from '../prototype/ProtoLoadingDots';
import { ChildPrivacyPolicyLink } from './ChildPrivacyNotice';
import '../../styles/family-verse-discussion.css';

type Props = {
  verse: number;
  comments: Pick<ChildFamilyThought, 'id' | 'role' | 'text'>[];
  viewer: ChildFamilyThought['role'];
  childName: string;
  preferences: ChildNotebookPreferences | null;
  expanded: boolean;
  onToggle: () => void;
  onSave?: (text: string) => Promise<void>;
  disabled?: boolean;
  privacyUrl?: string;
  children?: ReactNode;
};

export default function FamilyVerseDiscussion({
  verse, comments, viewer, childName, preferences, expanded, onToggle, onSave, disabled, privacyUrl, children
}: Props) {
  const id = useId();
  const count = `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`;
  const title = viewer === 'child' ? 'Talk about this verse' : 'Verse discussion';
  if (!expanded && comments.length === 0) return null;
  return <div className="pds-verse-discussion">
    <button type="button" className="pds-verse-discussion__text-action pds-caption"
      aria-label={expanded ? undefined : `${count} on verse ${verse}`}
      aria-expanded={expanded} aria-controls={expanded ? id : undefined} disabled={disabled} onClick={onToggle}>
      <Icon name="quote-left" size={11} aria-hidden />
      {expanded ? title : count}
      <Icon name="chevron-down" size={9} className="pds-verse-discussion__chevron" aria-hidden />
    </button>
    {expanded && <section id={id} className="pds-verse-discussion__thread" aria-label={`Verse ${verse} discussion`}>
      {comments.length > 0 && <ul className="pds-verse-discussion__comments">
        {comments.map(comment => <li key={comment.id}>
          {comment.role === 'child'
            ? <ChildNotebookProfileAvatar name={childName} preferences={preferences} small />
            : <span className="pds-verse-discussion__avatar" aria-hidden="true"><Icon name="user" size={11} /></span>}
          <div>
            <strong className="pds-caption">{comment.role === viewer ? 'You' : comment.role === 'parent' ? 'Your parent' : childName}</strong>
            <p className="pds-subheadline">{comment.text}</p>
          </div>
        </li>)}
      </ul>}
      {onSave && <ReplyComposer onSave={onSave} hasComments={comments.length > 0}
        childView={viewer === 'child'} privacyUrl={privacyUrl} />}
      {children}
      {!onSave && !children && comments.length === 0 && <p className="pds-caption">No comments on this verse.</p>}
    </section>}
  </div>;
}

function ReplyComposer({ onSave, hasComments, childView, privacyUrl }: {
  onSave: (text: string) => Promise<void>;
  hasComments: boolean;
  childView: boolean;
  privacyUrl?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useLayoutEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  function closeComposer() {
    restoreFocus.current = true;
    setEditing(false);
    setDraft('');
    setError('');
  }

  if (!editing) return <button ref={trigger} type="button" className="pds-verse-discussion__text-action pds-caption" onClick={() => setEditing(true)}>
    <Icon name={hasComments ? 'reply' : 'pen-to-square'} size={13} aria-hidden />
    {hasComments ? 'Reply' : 'Add a comment'}
  </button>;

  return <form className="pds-verse-discussion__composer" onSubmit={async event => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError('');
    try {
      await onSave(text);
      closeComposer();
    } catch {
      setError('Couldn’t post your comment. Try again.');
    } finally {
      setPosting(false);
    }
  }}>
    <textarea className="proto-settings-field__input" aria-label={hasComments ? 'Your reply' : 'Your comment'}
      placeholder={hasComments ? 'Write a reply…' : 'What did you notice?'}
      value={draft} onChange={event => setDraft(event.target.value)} maxLength={childView ? 500 : 800}
      rows={2} readOnly={posting} autoFocus />
    {childView && <div className="pds-verse-discussion__audience">
      <p className="pds-caption">You and your parent can see this.</p>
      <ChildPrivacyPolicyLink url={privacyUrl} />
    </div>}
    {error && <p className="pds-caption" role="alert">{error}</p>}
    <div className="pds-verse-discussion__actions">
      <button type="button" className="pds-verse-discussion__text-action pds-caption" disabled={posting} onClick={closeComposer}>Cancel</button>
      <button type="submit" className="proto-settings-btn" disabled={posting || !draft.trim()}>
        {posting ? <ProtoLoadingDots label="Posting comment" /> : hasComments ? 'Post reply' : 'Post comment'}
      </button>
    </div>
  </form>;
}
