import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api } from '../lib/api';
import { APIError } from '../lib/api';
import { useAddSharedNote } from '../hooks/mutations/useAddSharedNote';
import { noteUrlForCurrentSurface } from '@/utils/url-helpers';
import { getRandomHeroImage } from '../utils/random-hero-image';

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

export default function SharedNotePage() {
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
  const heroImage = useMemo(() => getRandomHeroImage(), []);

  useEffect(() => {
    api.get<SharedNoteResponse>(`/api/shared/note/${shareToken}`)
      .then(setData)
      .catch(() => setError('not_found'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  // Check for pending action after sign-in redirect
  useEffect(() => {
    if (!isSignedIn || !data) return;
    try {
      const pendingStr = sessionStorage.getItem('pendingSharedNoteAdd');
      if (pendingStr) {
        const pending = JSON.parse(pendingStr);
        if (pending.shareToken === shareToken && (Date.now() - pending.timestamp) < 600000) {
          sessionStorage.removeItem('pendingSharedNoteAdd');
          doAdd();
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
          } catch {
            /* ignore */
          }
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
        sessionStorage.setItem('pendingSharedNoteAdd', JSON.stringify({
          shareToken,
          timestamp: Date.now(),
        }));
        sessionStorage.setItem('harvous_pending_redirect', window.location.href);
      } catch { /* ignore */ }
      const redirectUrl = encodeURIComponent(window.location.href);
      navigate({ to: `/sign-in?redirect_url=${redirectUrl}` as any });
      return;
    }
    await doAdd();
  };


  const CircleQuestionIcon = () => (
    <svg width="48" height="48" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
    </svg>
  );

  const note = data?.note;
  const creator = data?.creator;
  const scriptureMetadata = data?.scriptureMetadata;
  const resourceMetadata = data?.resourceMetadata;

  return (
    <>
      {data?.note && <title>{`${data.note.title || 'Shared Note'} | Shared Note`}</title>}
    <div id="shared-note-content" className="auth-page">
      <div className="auth-page__container">
        <div
          className="auth-page__video-section"
          style={{ backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="auth-page__video-overlay" style={{ padding: '20px' }}>
            <a href="https://app.harvous.com" className="auth-page__logo-container">
              <img
                src="/icons/app-icon.png"
                alt="Harvous"
                className="auth-page__logo"
                width={36}
                height={36}
              />
            </a>
          </div>
        </div>

        {/* Right Column: Note Content */}
        <div className="auth-page__form-section shared-page__content-section">
          <div className="shared-page__content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !note) ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">
                  <CircleQuestionIcon />
                </div>
                <h1 className="shared-page__error-title">This note isn't available</h1>
                <p className="shared-page__error-message">
                  Hmm, we can't find this note. The link might have expired or the owner made it private.
                </p>
                <a href="https://app.harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : (
              <SubtleContentMount variant="fade">
                <>
                {/* Creator info (above card) */}
                <div className="shared-page__creator">
                  <p>
                    {creator?.isHarvousOwned
                      ? "You're invited to add this note on Harvous"
                      : `Created by ${creator?.displayName || 'A Harvous User'} on Harvous`}
                  </p>
                </div>

                {/* Card container */}
                <div className="shared-page__card-container">
                  <CardFullEditable
                    title={note.title ?? ''}
                    content={note.content ?? ''}
                    date={note.createdAt
                      ? (() => { const d = new Date(note.createdAt!); const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()
                      : ''}
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
                    className="h-full flex-1 min-h-0"
                    footer={
                      <div className="shared-page__cta-wrapper">
                        <div className={`shared-page__toast shared-page__toast--${toastType}${toastVisible ? ' shared-page__toast--visible' : ''}`}>
                          <span>{toastMessage}</span>
                        </div>
                        {alreadyOwned ? (
                          <button
                            className="btn btn--lg btn--primary shared-page__cta-button"
                            onClick={() => {
                              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                              navigate({ to: '/' as any });
                            }}
                          >
                            <div className="btn__content">
                              <span className="shared-page__cta-text">View in my Harvous</span>
                            </div>
                            <div className="btn__shadow-overlay" />
                          </button>
                        ) : (
                          <button
                            className="btn btn--lg btn--primary shared-page__cta-button"
                            onClick={handleAddToHarvous}
                            disabled={addSharedNoteMutation.isPending}
                          >
                            <div className="btn__content">
                              <span className="shared-page__cta-text">
                                {addSharedNoteMutation.isPending ? 'Adding...' : 'Add to my Harvous'}
                              </span>
                            </div>
                            <div className="btn__shadow-overlay" />
                          </button>
                        )}
                      </div>
                    }
                  />
                </div>

                {/* Footer */}
                <div className="shared-page__footer">
                  <p>Harvous is a notes app designed for Bible study.</p>
                  <a href="https://app.harvous.com" target="_blank" rel="noopener noreferrer">Learn more at app.harvous.com</a>
                </div>
              </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
