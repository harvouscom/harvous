import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import { api } from '../lib/api';

interface SharedNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  type: 'default' | 'scripture' | 'resource';
  version?: string;
  resourceTitle?: string;
  resourceDescription?: string;
  resourceImage?: string;
  resourceUrl?: string;
}

export default function SharedNotePage() {
  const { shareToken } = useParams({ from: '/shared/note/$shareToken' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get<SharedNote>(`/api/shared/note/${shareToken}`)
      .then(setNote)
      .catch(() => setError('This note is not available.'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  const handleAddToHarvous = async () => {
    if (!isSignedIn) {
      sessionStorage.setItem('pendingAction', JSON.stringify({ type: 'addSharedNote', shareToken }));
      navigate({ to: '/sign-in' });
      return;
    }
    setIsAdding(true);
    try {
      await api.post('/api/shared/add-note-to-harvous', { shareToken });
      setAdded(true);
    } catch {
      // silently fail — user can retry
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) return <div className="page-loading" />;

  if (error || !note) {
    return (
      <div className="shared-note-page">
        <div className="shared-note-error">{error ?? 'Note not found.'}</div>
      </div>
    );
  }

  return (
    <div className="shared-note-page">
      {!added && (
        <div className="shared-note-actions">
          <button
            className="btn btn-primary"
            onClick={handleAddToHarvous}
            disabled={isAdding}
          >
            {isAdding ? 'Adding…' : 'Add to Harvous'}
          </button>
        </div>
      )}
      <CardFullEditable
        title={note.title ?? ''}
        content={note.content ?? ''}
        date={note.createdAt}
        noteId={note.id}
        noteType={note.type}
        version={note.version}
        resourceTitle={note.resourceTitle}
        resourceDescription={note.resourceDescription}
        resourceImage={note.resourceImage}
        resourceUrl={note.resourceUrl}
        isEditable={false}
        shareToken={shareToken}
        isAuthenticated={!!isSignedIn}
        contentEncrypted={false}
      />
    </div>
  );
}
