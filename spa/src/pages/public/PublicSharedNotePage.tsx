import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { noteUrlForCurrentSurface } from '@/utils/url-helpers';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '@/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api, APIError } from '../../lib/api';
import { useAddSharedNote } from '../../hooks/mutations/useAddSharedNote';
import { PublicTopBar, PublicErrorState } from './public-shared';

interface SharedNoteResponse {
  note: {
    id: string;
    title: string;
    content: string;
    noteType: 'default' | 'scripture' | 'resource';
    createdAt: string;
  };
  creator: {
    displayName: string;
    isHarvousOwned?: boolean;
    userColor?: string;
  };
  scriptureMetadata?: {
    reference?: string;
    translation?: string;
  } | null;
  resourceMetadata?: {
    sourceUrl?: string;
    sourceTitle?: string;
    sourceDescription?: string;
    sourceImage?: string;
  } | null;
}

export default function PublicSharedNotePage() {
  const { shareToken } = useParams({ from: '/shared/note/$shareToken' });
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<SharedNoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addSharedNoteMutation = useAddSharedNote();
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [toastVisible, setToastVisible] = useState(false);
  const [alreadyOwned, setAlreadyOwned] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ogCapture =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('ogCapture') === '1';

  useEffect(() => {
    api.get<SharedNoteResponse>(`/api/shared/note/${shareToken}`)
      .then(setData)
      .catch(() => setError('not_found'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  useEffect(() => {
    if (!isSignedIn || !data) return;
    try {
      const pendingStr = sessionStorage.getItem('pendingSharedNoteAdd');
      if (pendingStr) {
        const pending = JSON.parse(pendingStr);
        if (pending.shareToken === shareToken && (Date.now() - pending.timestamp) < 600000) {
          sessionStorage.removeItem('pendingSharedNoteAdd');
          void doAdd();
        } else {
          sessionStorage.removeItem('pendingSharedNoteAdd');
        }
      }
    } catch { /* ignore */ }
  }, [isSignedIn, data]);

  function showToast(message: string, type: 'success' | 'error' | 'info', duration = 3000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }

  async function doAdd() {
    try {
      const result = await addSharedNoteMutation.mutateAsync(shareToken);
      if (result.success && result.createdIds?.noteId) {
        showToast('Added to your Harvous!', 'success', 0);
        const id = result.createdIds.noteId;
        const path = noteUrlForCurrentSurface(id);
        setTimeout(() => {
          try {
            sessionStorage.removeItem('harvous_pending_redirect');
            sessionStorage.removeItem('pendingSharedNoteAdd');
          } catch { /* ignore */ }
          navigate({ to: path as any });
        }, 800);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Already in your Harvous') || msg.includes('already')) {
        setAlreadyOwned(true);
        showToast('This note is already in your Harvous', 'info', 0);
      } else {
        showToast('Failed to add note. Please try again.', 'error');
      }
    }
  }

  const handleAddToHarvous = async () => {
    if (!isSignedIn) {
      try {
        sessionStorage.setItem('pendingSharedNoteAdd', JSON.stringify({ shareToken, timestamp: Date.now() }));
        sessionStorage.setItem('harvous_pending_redirect', window.location.href);
      } catch { /* ignore */ }
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    await doAdd();
  };

  const note = data?.note;
  const creator = data?.creator;
  const scriptureMetadata = data?.scriptureMetadata;
  const resourceMetadata = data?.resourceMetadata;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formattedDate = note?.createdAt
    ? (() => { const d = new Date(note.createdAt); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()
    : '';

  return (
    <>
      {note && <title>{`${note.title || 'Shared Note'} | Harvous`}</title>}
      <div className={`public-page${ogCapture ? ' public-page--og-capture' : ''}`}>
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !note) ? (
              <PublicErrorState
                title="This note isn't available"
                message="Hmm, we can't find this note. The link might have expired or the owner made it private."
              />
            ) : (
              <SubtleContentMount variant="fade">
                <>
                  {/* Eyebrow kicker — mirrors `/site/` "A LETTER FROM DEREK". */}
                  <p className="public-creator">
                    {creator?.isHarvousOwned
                      ? 'A note from Harvous'
                      : `A note from ${creator?.displayName || 'a Harvous reader'}`}
                  </p>

                  {/* Paper-stack — two background leaves fan out behind a main
                      letter card. CSS-driven (see `.public-paper-stack` in
                      `public-pages.css`); JSX just supplies the three siblings. */}
                  <div className="public-paper-stack">
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
                    <CardFullEditable
                      title={note.title ?? ''}
                      content={note.content ?? ''}
                      date={formattedDate}
                      noteId={note.id}
                      noteType={note.noteType}
                      version={scriptureMetadata?.translation}
                      resourceTitle={resourceMetadata?.sourceTitle}
                      resourceDescription={resourceMetadata?.sourceDescription}
                      resourceImage={resourceMetadata?.sourceImage}
                      resourceUrl={resourceMetadata?.sourceUrl}
                      isEditable={false}
                      isAuthenticated={!!isSignedIn}
                      contentEncrypted={false}
                      className="public-note-card"
                      footer={
                      <div className="public-card__cta">
                        <div
                          className={`public-toast public-toast--${toastType}${toastVisible ? ' public-toast--visible' : ''}`}
                          style={{ textAlign: 'center', justifyContent: 'center' }}
                        >
                          {toastMessage}
                        </div>
                        {alreadyOwned ? (
                          <button
                            className="public-cta-btn"
                            onClick={() => {
                              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                              navigate({ to: prototypeHomeRouteTo() as any });
                            }}
                          >
                            View in my Harvous
                          </button>
                        ) : (
                          <button
                            className="public-cta-btn"
                            onClick={handleAddToHarvous}
                            disabled={addSharedNoteMutation.isPending}
                          >
                            {addSharedNoteMutation.isPending ? 'Adding…' : 'Add to my Harvous'}
                          </button>
                        )}
                      </div>
                    }
                  />
                  </div>

                  {/* Closing kicker */}
                  <div className="public-footer public-footer--rich">
                    <span className="public-footer__tag">
                      This was created in Harvous. Start creating your own study Bible.{' '}
                      <a
                        href="https://harvous.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-footer__cta"
                      >
                        Try free →
                      </a>
                    </span>
                  </div>
                </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
