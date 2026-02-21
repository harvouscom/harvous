import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePersistedUserId } from '@/utils/user-id';
import { safeNavigate } from '@/utils/safe-navigate';
import EraseConfirmDialog from './EraseConfirmDialog';
import ButtonSmall from './ButtonSmall';
import { deleteNoteOffline, deleteThreadOffline, deleteSpaceOffline } from '@/utils/offline-mutations';
import { safeFetch } from '@/utils/safe-fetch';
import { idToUrl } from '@/utils/url-helpers';
import { isNetworkError } from '@/utils/network';
import { getMenuOptions } from '@/utils/menu-options';
import { shouldShowMoreButton } from '@/utils/menu-options';

export interface ActionStripItem {
  action: string;
  label: string;
}

function getShortLabel(fullLabel: string): string {
  const map: Record<string, string> = {
    'Edit Space': 'Edit',
    'Erase Space': 'Erase',
    'People': 'People',
    'About Space': 'About',
    'Leave Space': 'Leave',
    'Edit Thread': 'Edit',
    'Erase Thread': 'Erase',
    'Erase Thread & Notes': 'Erase'
  };
  return map[fullLabel] ?? fullLabel;
}

interface ActionStripProps {
  variant?: 'desktop' | 'mobile';
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile';
  contentId?: string;
  currentThreadId?: string;
  noteType?: string;
  contentEncrypted?: boolean;
  contentEncryptedServer?: boolean;
  noteSimpleId?: number | null;
  spaceRole?: 'owner' | 'member' | null;
  contentOwnerId?: string | null;
  userId?: string | null;
}

export default function ActionStrip({
  variant = 'desktop',
  contentType = 'dashboard',
  contentId,
  currentThreadId,
  noteType,
  contentEncrypted,
  contentEncryptedServer,
  noteSimpleId,
  spaceRole,
  contentOwnerId,
  userId: userIdProp
}: ActionStripProps) {
  const userId = usePersistedUserId();
  const effectiveUserId = userIdProp ?? userId;
  const showStrip = shouldShowMoreButton(contentType, contentId, contentOwnerId, effectiveUserId);
  const options = getMenuOptions(
    contentType,
    contentId,
    noteType,
    contentEncrypted,
    contentEncryptedServer,
    noteSimpleId,
    spaceRole,
    contentOwnerId,
    effectiveUserId
  );
  const stripItems: ActionStripItem[] = options.map((o) => ({
    action: o.action,
    label: getShortLabel(o.label)
  }));

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(detail?.editing === true);
    };
    window.addEventListener('contentEditModeChange', handleEditModeChange);
    return () => window.removeEventListener('contentEditModeChange', handleEditModeChange);
  }, []);

  const performErase = async () => {
    if (!contentId || !contentType) return;
    let apiUrl: string, paramName: string, successMessage: string;
    switch (contentType) {
      case 'thread':
        apiUrl = '/api/threads/delete';
        paramName = 'threadId';
        successMessage = 'Thread erased!';
        break;
      case 'note':
        apiUrl = '/api/notes/delete';
        paramName = 'noteId';
        successMessage = 'Note erased!';
        break;
      case 'space':
        apiUrl = '/api/spaces/delete';
        paramName = 'spaceId';
        successMessage = 'Space erased!';
        break;
      default:
        return;
    }
    let deletedOffline = false;
    try {
      if (effectiveUserId) {
        try {
          if (contentType === 'note') {
            await deleteNoteOffline(effectiveUserId, contentId);
            deletedOffline = true;
          } else if (contentType === 'thread') {
            await deleteThreadOffline(effectiveUserId, contentId);
            deletedOffline = true;
          } else if (contentType === 'space') {
            await deleteSpaceOffline(effectiveUserId, contentId);
            deletedOffline = true;
          }
        } catch {}
      }
      if (deletedOffline && (window as any).toast?.success) {
        (window as any).toast.success(successMessage);
      }
      const response = await safeFetch(`${apiUrl}?${paramName}=${encodeURIComponent(contentId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        retries: 3,
        timeout: 10000
      });
      if (response === null) {
        if (!deletedOffline && (window as any).toast?.error) {
          (window as any).toast.error("Couldn't erase. Please check your connection and try again.");
        }
        if (!deletedOffline) return;
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId: contentId } }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', { detail: { noteId: contentId, threadId: currentThreadId } }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', { detail: { spaceId: contentId } }));
        }
        const query = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        let redirectUrl: string;
        if (contentType === 'note') {
          const currentPath = window.location.pathname;
          const spaMatch = currentPath.match(/^\/thread\/([a-zA-Z0-9_-]+)$/);
          const oldMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          const threadIdFromUrl = spaMatch ? `thread_${spaMatch[1]}` : oldMatch ? oldMatch[1] : null;
          redirectUrl = threadIdFromUrl ? idToUrl(threadIdFromUrl) + query : currentThreadId ? idToUrl(currentThreadId) + query : query ? `/dashboard${query}` : '/dashboard';
        } else {
          redirectUrl = query ? `/dashboard${query}` : '/dashboard';
        }
        safeNavigate(redirectUrl, { history: 'replace' });
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId: contentId } }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', { detail: { noteId: contentId, threadId: currentThreadId } }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', { detail: { spaceId: contentId } }));
        }
        let redirectUrl: string;
        const toastQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        if (contentType === 'note') {
          const currentPath = window.location.pathname;
          const spaMatch = currentPath.match(/^\/thread\/([a-zA-Z0-9_-]+)$/);
          const oldMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          const threadIdFromUrl = spaMatch ? `thread_${spaMatch[1]}` : oldMatch ? oldMatch[1] : null;
          if (threadIdFromUrl) redirectUrl = idToUrl(threadIdFromUrl) + toastQuery;
          else if (currentThreadId) redirectUrl = idToUrl(currentThreadId) + toastQuery;
          else if (data?.threadId && data.threadId !== 'thread_unorganized') redirectUrl = idToUrl(data.threadId) + toastQuery;
          else redirectUrl = '/dashboard' + toastQuery;
        } else {
          redirectUrl = '/dashboard' + toastQuery;
        }
        safeNavigate(redirectUrl, { history: 'replace' });
      } else if (deletedOffline) {
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId: contentId } }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', { detail: { noteId: contentId, threadId: currentThreadId } }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', { detail: { spaceId: contentId } }));
        }
        const errQuery = `?toast=success&message=${encodeURIComponent(successMessage)}`;
        let redirectUrl: string;
        if (contentType === 'note') {
          redirectUrl = currentThreadId ? idToUrl(currentThreadId) + errQuery : '/dashboard' + errQuery;
        } else {
          redirectUrl = '/dashboard' + errQuery;
        }
        safeNavigate(redirectUrl, { history: 'replace' });
      } else if ((window as any).toast?.error) {
        (window as any).toast.error(data?.error || 'Failed to sync deletion with server');
      }
    } catch (error) {
      if (isNetworkError(error) && deletedOffline) {
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId: contentId } }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', { detail: { noteId: contentId, threadId: currentThreadId } }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', { detail: { spaceId: contentId } }));
        }
        const catchQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        const redirectUrl = contentType === 'note' && currentThreadId ? idToUrl(currentThreadId) + catchQuery : catchQuery ? `/dashboard${catchQuery}` : '/dashboard';
        safeNavigate(redirectUrl, { history: 'replace' });
      } else if ((window as any).toast?.error) {
        (window as any).toast.error('Failed to erase item');
      }
    }
  };

  const executeLeaveSpace = async () => {
    if (contentType !== 'space' || !contentId || !effectiveUserId) return;
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/spaces/${contentId}/members/${effectiveUserId}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/dashboard';
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Could not leave space.');
      }
    } catch {
      alert('Could not leave space.');
    }
  };

  const dispatchAction = (action: string) => {
    if (action === 'openEditSpacePanelPeople') {
      window.dispatchEvent(new CustomEvent('openEditSpacePanel', { detail: { contentId, contentType, initialTab: 'people' } }));
      return;
    }
    if (action === 'openNoteDetailsThreads') {
      window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', { detail: { contentId, contentType, tab: 'threads' } }));
      return;
    }
    if (action === 'openNoteDetailsTags') {
      window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', { detail: { contentId, contentType, tab: 'tags' } }));
      return;
    }
    if (action === 'openNoteDetailsNotes') {
      window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', { detail: { contentId, contentType, tab: 'notes' } }));
      return;
    }
    if (action === 'editThread') {
      window.dispatchEvent(new CustomEvent('openEditThreadPanel', { detail: { contentId, contentType } }));
      return;
    }
    if (action === 'editSpace' || action === 'viewSpace') {
      window.dispatchEvent(new CustomEvent('openEditSpacePanel', { detail: { contentId, contentType } }));
      return;
    }
    if (action === 'shareNote') {
      window.dispatchEvent(new CustomEvent('openNoteSharePanel', { detail: { contentId, contentType } }));
      return;
    }
    if (action === 'lockNote') {
      window.dispatchEvent(new CustomEvent('focusLockNote', { detail: { contentId } }));
      return;
    }
    if (action === 'removeLock') {
      window.dispatchEvent(new CustomEvent('focusLockNote', { detail: { contentId, removeLock: true } }));
      return;
    }
    if (action === 'copyNoteId') {
      const opt = options.find((o) => o.action === 'copyNoteId');
      const textToCopy = opt?.label ?? '';
      navigator.clipboard.writeText(textToCopy).then(
        () => (window as any).toast?.success?.(`Copied ${textToCopy} to clipboard`),
        () => (window as any).toast?.error?.('Failed to copy note ID')
      );
    }
  };

  const handleClick = (action: string) => {
    if (action.includes('erase') || action === 'leaveSpace') {
      setPendingAction(action);
      setShowConfirmDialog(true);
      return;
    }
    dispatchAction(action);
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'leaveSpace') {
      await executeLeaveSpace();
    } else if (action.includes('erase')) {
      await performErase();
    }
  };

  const handleCancel = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  if (!showStrip || stripItems.length === 0 || isEditMode) {
    return null;
  }

  const isDesktop = variant === 'desktop';
  const className = isDesktop ? 'action-strip action-strip--desktop' : 'action-strip action-strip--mobile';

  return (
    <>
      <div className={className} role="group" aria-label="Actions">
        {stripItems.map((item) => (
          <button
            key={item.action}
            type="button"
            className="action-strip__item"
            onClick={() => handleClick(item.action)}
          >
            <span className="action-strip__label">{item.label}</span>
          </button>
        ))}
      </div>

      {showConfirmDialog && contentType && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'transparent',
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancel();
          }}
        >
          <div
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-deep-grey)', marginBottom: '0.5rem' }}>
              {pendingAction === 'leaveSpace' ? 'Leave this space?' : 'Are you sure?'}
            </h3>
            <p style={{ color: 'var(--color-pebble-grey)', marginBottom: '1.5rem' }}>
              {pendingAction === 'leaveSpace' ? (
                <>Anything you&apos;ve added to this space will remain in the space unless you remove it. You can rejoin later with the same link.</>
              ) : contentType === 'space' ? (
                <>When you erase a space your notes and threads will stay in your Harvous. Only the space will be erased.</>
              ) : (
                <>Are you sure you want to erase this {contentType}?</>
              )}
            </p>
            {pendingAction === 'leaveSpace' ? (
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <ButtonSmall type="button" onClick={handleCancel} state="Secondary">Cancel</ButtonSmall>
                <ButtonSmall type="button" onClick={handleConfirm} state="Default">Leave Space</ButtonSmall>
              </div>
            ) : (
              <EraseConfirmDialog contentType={contentType} onCancel={handleCancel} onConfirm={handleConfirm} />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
