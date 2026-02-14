import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import CardNote from '../../../src/components/react/CardNote';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import { api } from '../lib/api';

interface SharedThreadNote {
  id: string;
  title: string;
  content: string;
  type: 'default' | 'scripture' | 'resource';
}

interface SharedThread {
  id: string;
  title: string;
  subtitle?: string;
  notes: SharedThreadNote[];
  ownerDisplayName: string;
}

export default function SharedThreadPage() {
  const { shareToken } = useParams({ from: '/shared/thread/$shareToken' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [thread, setThread] = useState<SharedThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get<SharedThread>(`/api/shared/thread/${shareToken}`)
      .then(setThread)
      .catch(() => setError('This thread is not available.'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  const handleAddToHarvous = async () => {
    if (!isSignedIn) {
      sessionStorage.setItem('pendingAction', JSON.stringify({ type: 'addSharedThread', shareToken }));
      navigate({ to: '/sign-in' });
      return;
    }
    setIsAdding(true);
    try {
      await api.post('/api/shared/add-to-harvous', { shareToken });
      setAdded(true);
    } catch {
      // silently fail — user can retry
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) return <div className="page-loading" />;

  if (error || !thread) {
    return (
      <div className="shared-thread-page">
        <div className="shared-thread-error">{error ?? 'Thread not found.'}</div>
      </div>
    );
  }

  return (
    <div className="shared-thread-page">
      <div className="shared-thread-header">
        <h1 className="shared-thread-title">{thread.title}</h1>
        {thread.subtitle && <p className="shared-thread-subtitle">{thread.subtitle}</p>}
        <p className="shared-thread-meta">By {thread.ownerDisplayName}</p>
        {!added && (
          <button
            className="btn btn-primary"
            onClick={handleAddToHarvous}
            disabled={isAdding}
          >
            {isAdding ? 'Adding…' : 'Add to Harvous'}
          </button>
        )}
      </div>
      <div className="shared-thread-notes">
        {thread.notes.map((note) =>
          note.type === 'scripture' ? (
            <CondensedNoteItem
              key={note.id}
              title={note.title}
              noteType="scripture"
              href={`/shared/note/${shareToken}`}
              noteId={note.id}
            />
          ) : (
            <CardNote
              key={note.id}
              title={note.title}
              content={note.content}
              noteType={note.type}
              noteId={note.id}
            />
          )
        )}
      </div>
    </div>
  );
}
