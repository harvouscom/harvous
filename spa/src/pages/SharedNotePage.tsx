import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import { api } from '../lib/api';

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
  const [data, setData] = useState<SharedNoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SharedNoteResponse>(`/api/shared/note/${shareToken}`)
      .then(setData)
      .catch(() => setError('not_found'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  useEffect(() => {
    if (data?.note) {
      document.title = `${data.note.title || 'Shared Note'} | Shared Note`;
    }
  }, [data]);

  const HarvousLogo = () => (
    <svg width="28" height="40" viewBox="0 0 45 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Harvous">
      <path d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z" fill="#fff"/>
    </svg>
  );

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
    <div id="shared-note-content" className="auth-page">
      <div className="auth-page__container">
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
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
                <a href="https://harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : (
              <>
                {/* Creator info (above card) */}
                <div className="shared-page__creator shared-page__fade-in" style={{ animationDelay: '0ms' }}>
                  <p>Created by {creator?.displayName || 'A Harvous User'} on Harvous</p>
                </div>

                {/* Card container */}
                <div className="shared-page__card-container shared-page__slide-up" style={{ animationDelay: '50ms' }}>
                  <CardFullEditable
                    title={note.title ?? ''}
                    content={note.content ?? ''}
                    date={note.createdAt
                      ? new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : ''}
                    noteId={note.id}
                    noteType={note.noteType}
                    version={scriptureMetadata?.translation}
                    resourceTitle={resourceMetadata?.sourceTitle}
                    resourceDescription={resourceMetadata?.sourceDescription}
                    resourceImage={resourceMetadata?.sourceImage}
                    resourceUrl={resourceMetadata?.sourceUrl}
                    isEditable={false}
                    shareToken={shareToken}
                    isAuthenticated={!!isSignedIn}
                    contentEncrypted={false}
                    className="h-full flex-1 min-h-0"
                  />
                </div>

                {/* Footer */}
                <div className="shared-page__footer shared-page__fade-in" style={{ animationDelay: '200ms' }}>
                  <p>Harvous is a notes app designed for Bible study.</p>
                  <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">Learn more on harvous.com</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
