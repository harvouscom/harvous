import { useEffect, useState } from 'react';

interface PendingNoteData {
  title: string;
  content: string;
  threadId: string;
  noteType: 'default' | 'scripture' | 'resource';
  scriptureReference: string;
  scriptureVersion: string;
  resourceUrl: string;
  resourceMetadata: string | null;
  spaceId: string | null;
  timestamp: number;
}

export default function UpgradeSuccessHandler() {
  const [status, setStatus] = useState<'checking' | 'creating' | 'success' | 'error' | 'none'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if we're on the upgrade page with success parameter
    const urlParams = new URLSearchParams(window.location.search);
    const isSuccess = urlParams.get('success') === 'true';

    if (!isSuccess) {
      setStatus('none');
      return;
    }

    // Check for pending note data
    const pendingNoteStr = localStorage.getItem('pendingNoteAfterUpgrade');
    if (!pendingNoteStr) {
      setStatus('none');
      return;
    }

    let pendingNoteData: PendingNoteData;
    try {
      pendingNoteData = JSON.parse(pendingNoteStr);
      
      // Validate required fields
      if (!pendingNoteData.threadId || !pendingNoteData.noteType) {
        throw new Error('Invalid pending note data: missing required fields');
      }
      
      // Validate note type specific fields
      if (pendingNoteData.noteType === 'scripture' && !pendingNoteData.scriptureReference) {
        throw new Error('Invalid pending note data: missing scripture reference');
      }
      if (pendingNoteData.noteType === 'resource' && !pendingNoteData.resourceUrl) {
        throw new Error('Invalid pending note data: missing resource URL');
      }
    } catch (error) {
      console.error('[UpgradeSuccessHandler] Failed to parse or validate pending note data:', error);
      localStorage.removeItem('pendingNoteAfterUpgrade');
      localStorage.removeItem('upgradeRetryCount');
      setStatus('none');
      return;
    }

    // Verify the pending note data is not too old (e.g., older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (pendingNoteData.timestamp && pendingNoteData.timestamp < oneHourAgo) {
      console.log('[UpgradeSuccessHandler] Pending note data is too old, clearing it');
      localStorage.removeItem('pendingNoteAfterUpgrade');
      setStatus('none');
      return;
    }

    // Create note (API will handle subscription check)
    // If subscription isn't active yet, we'll retry after a delay
    const checkAndCreateNote = async () => {
      try {
        setStatus('creating');
        
        // Clear retry count on first attempt
        const retryCount = parseInt(localStorage.getItem('upgradeRetryCount') || '0', 10);
        if (retryCount === 0) {
          // Small delay to ensure subscription status is updated
          // Clerk's subscription update might not be immediate
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const formData = new FormData();
        
        // Set title based on note type
        if (pendingNoteData.noteType === 'default') {
          formData.set('title', pendingNoteData.title);
        } else if (pendingNoteData.noteType === 'scripture') {
          formData.set('title', pendingNoteData.scriptureReference);
        } else if (pendingNoteData.noteType === 'resource') {
          formData.set('title', pendingNoteData.resourceUrl);
        }
        
        formData.set('content', pendingNoteData.content);
        formData.set('threadId', pendingNoteData.threadId);
        formData.set('noteType', pendingNoteData.noteType);
        
        if (pendingNoteData.spaceId) {
          formData.set('spaceId', pendingNoteData.spaceId);
        }
        
        if (pendingNoteData.noteType === 'scripture') {
          formData.set('scriptureReference', pendingNoteData.scriptureReference);
          formData.set('scriptureVersion', pendingNoteData.scriptureVersion);
        } else if (pendingNoteData.noteType === 'resource') {
          formData.set('resourceUrl', pendingNoteData.resourceUrl);
          if (pendingNoteData.resourceMetadata) {
            formData.set('resourceMetadata', pendingNoteData.resourceMetadata);
          }
        }

        const response = await fetch('/api/notes/create', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!response.ok) {
          const error = await response.json();
          
          // If still hitting limit, subscription might not be active yet
          // Retry up to 3 times with increasing delays
          if (error.code === 'NOTE_LIMIT_EXCEEDED') {
            const retryCount = parseInt(localStorage.getItem('upgradeRetryCount') || '0', 10);
            
            if (retryCount < 3) {
              // Retry after delay (2s, 4s, 8s)
              const delay = Math.pow(2, retryCount + 1) * 1000;
              localStorage.setItem('upgradeRetryCount', String(retryCount + 1));
              
              setStatus('checking');
              setErrorMessage(`Subscription activating... Retrying in ${delay / 1000} seconds...`);
              
              setTimeout(() => {
                checkAndCreateNote();
              }, delay);
              return;
          } else {
            // Max retries reached
            localStorage.removeItem('upgradeRetryCount');
            setErrorMessage('Subscription is not active yet. Please wait a moment and try creating the note again. Your note data has been saved.');
            setStatus('error');
            // Keep the pending note data for manual retry
            // User can manually create the note or refresh the page to retry
            return;
          }
          }
          
          throw new Error(error.error || 'Failed to create note');
        }
        
        // Success - clear retry count
        localStorage.removeItem('upgradeRetryCount');

        const result = await response.json();
        
        if (result.note && result.note.id) {
          // Clear pending note data
          localStorage.removeItem('pendingNoteAfterUpgrade');
          
          setStatus('success');
          
          // Navigate to the created note
          let redirectUrl = `/${result.note.id}`;
          
          // Add toast message if applicable
          if (result.scriptureResults && Array.isArray(result.scriptureResults)) {
            const createdScriptures = result.scriptureResults.filter(
              (r: any) => r.action === 'created'
            );
            
            if (createdScriptures.length === 1) {
              redirectUrl += `?toast=info&message=${encodeURIComponent(`Created scripture note: ${createdScriptures[0].reference}`)}`;
            } else if (createdScriptures.length > 1) {
              redirectUrl += `?toast=info&message=${encodeURIComponent(`Created ${createdScriptures.length} scripture notes`)}`;
            }
          } else {
            redirectUrl += `?toast=success&message=${encodeURIComponent('Note created successfully!')}`;
          }
          
          // Small delay to show success state, then navigate
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 500);
        } else {
          throw new Error('Note was created but no note ID was returned');
        }
      } catch (error: any) {
        console.error('[UpgradeSuccessHandler] Error creating note:', error);
        setErrorMessage(error.message || 'Failed to create note. Please try creating it manually.');
        setStatus('error');
        // Clear retry count on non-retryable errors
        localStorage.removeItem('upgradeRetryCount');
        // Keep the pending note data for manual retry
      }
    };

    checkAndCreateNote();
  }, []);

  // Don't render anything if not processing
  if (status === 'none') {
    return null;
  }

  // Show loading/status messages
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      padding: '1rem 1.5rem',
      borderRadius: '0.75rem',
      backgroundColor: status === 'error' ? '#fee2e2' : '#dbeafe',
      color: status === 'error' ? '#991b1b' : '#1e40af',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      maxWidth: '90%',
      textAlign: 'center'
    }}>
      {status === 'checking' && (
        <div>Checking subscription status...</div>
      )}
      {status === 'creating' && (
        <div>Creating your note...</div>
      )}
      {status === 'success' && (
        <div>Note created! Redirecting...</div>
      )}
      {status === 'error' && (
        <div>
          <div style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Error creating note</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{errorMessage}</div>
          <button
            onClick={() => {
              localStorage.removeItem('upgradeRetryCount');
              setStatus('checking');
              setErrorMessage(null);
              // Trigger re-check by reloading the effect
              window.location.reload();
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              backgroundColor: '#1e40af',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

