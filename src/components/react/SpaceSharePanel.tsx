import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import Icon from './Icon';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';
import ConfirmDialog from './dialogs/ConfirmDialog';
import { getCachedPanelData, getSpaceMembersCacheKey, setCachedPanelData, type SpaceMembersCache } from '@/utils/panel-data-cache';

interface AdminFeaturedItem {
  id: string;
  contentType: string;
  title: string;
  description: string | null;
  refId: string | null;
  shareToken: string | null;
  color: string | null;
  isActive: boolean;
}

export interface SpaceSharePanelProps {
  spaceId: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

function dispatchSpaceUpdated(spaceId: string, title: string, color: ThreadColor, isPublic: boolean) {
  window.dispatchEvent(
    new CustomEvent('spaceUpdated', {
      detail: {
        spaceId,
        title: title.trim(),
        color,
        backgroundGradient: getThreadGradientCSS(color),
        isPublic,
      },
    }),
  );
}

export default function SpaceSharePanel({
  spaceId,
  initialTitle = '',
  initialColor = 'paper',
  onClose,
  inBottomSheet = false,
}: SpaceSharePanelProps) {
  const { user } = useUser();
  const cachedMembers = getCachedPanelData<SpaceMembersCache>(getSpaceMembersCacheKey(spaceId));
  const hasKnownOwnership = !!cachedMembers;

  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private' as 'Private' | 'Shared',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const [memberCount, setMemberCount] = useState(cachedMembers?.totalMembers ?? 1);
  const [isOwner, setIsOwner] = useState(cachedMembers?.isOwner ?? false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(!hasKnownOwnership);

  const [isHarvousAdmin, setIsHarvousAdmin] = useState(false);
  const [adminFeaturedItem, setAdminFeaturedItem] = useState<AdminFeaturedItem | null>(null);
  const [adminDescription, setAdminDescription] = useState('');
  const [isSavingAdminFeature, setIsSavingAdminFeature] = useState(false);
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);
  const [pendingFeature, setPendingFeature] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);

  const [showMakePrivateDialog, setShowMakePrivateDialog] = useState(false);
  const [showRefreshLinkDialog, setShowRefreshLinkDialog] = useState(false);

  const formDataRef = useRef(formData);
  const activeSaveOperationsRef = useRef<Set<string>>(new Set());
  const hasFetchedSpaceDataRef = useRef(false);
  const lastFetchedSpaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const fetchShareLink = useCallback(async (): Promise<{ ok: boolean; limitExceeded?: boolean }> => {
    if (!spaceId) return { ok: false };

    try {
      const response = await fetch(`/api/spaces/${spaceId}/share-link`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setShareLink(data.shareUrl || null);
        setShareToken(data.shareToken || null);
        return { ok: true };
      }

      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (data.code === 'SHARED_SPACE_LIMIT_EXCEEDED') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: data.error,
                type: 'error',
                code: 'SHARED_SPACE_LIMIT_EXCEEDED',
                upgradeUrl: data.upgradeUrl || '/addon',
              },
            }),
          );
          return { ok: false, limitExceeded: true };
        }
      }
      return { ok: false };
    } catch (error) {
      console.error('[SpaceSharePanel] Error fetching share link:', error);
      return { ok: false };
    }
  }, [spaceId]);

  const generateNewShareLink = async () => {
    if (isGeneratingLink || !spaceId) return;

    setIsGeneratingLink(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate new link');
      }

      const data = await response.json();
      setShareLink(data.shareUrl);
      setShareToken(data.shareToken || null);

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'New share link generated',
            type: 'success',
          },
        }),
      );
      window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to generate new link',
            type: 'error',
          },
        }),
      );
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const fetchMemberInfo = async () => {
    try {
      setIsLoadingMembers(true);
      const response = await fetch(`/api/spaces/${spaceId}/members`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        const total = data.memberCount ?? data.members?.length ?? 1;
        const owner = data.isOwner ?? false;
        const memberList = data.members ?? [];
        const pending = data.pendingInvitations ?? [];
        setMemberCount(total);
        setIsOwner(owner);
        setCachedPanelData(getSpaceMembersCacheKey(spaceId), {
          totalMembers: total,
          isOwner: owner,
          memberLimit: owner ? (data.memberLimit ?? data.limits?.membersPerSpace ?? null) : null,
          members: memberList,
          pendingInvitations: pending,
        });
      }
    } catch (error) {
      console.error('Error fetching member info:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (spaceId) {
      fetchMemberInfo();
    }
  }, [spaceId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && spaceId) {
        fetchMemberInfo();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [spaceId]);

  useEffect(() => {
    if (formData.selectedType === 'Shared' && spaceId) {
      fetchShareLink();
    } else {
      setShareLink(null);
      setShareToken(null);
    }
  }, [formData.selectedType, spaceId, fetchShareLink]);

  useEffect(() => {
    let cancelled = false;
    setIsHarvousAdmin(false);
    if (!user?.id) return () => { cancelled = true; };
    fetch('/api/admin/check', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return { isAdmin: false };
        return res.json().catch(() => ({ isAdmin: true }));
      })
      .then((data: any) => {
        if (cancelled) return;
        setIsHarvousAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsHarvousAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isHarvousAdmin) return;
    const token = shareToken?.trim();
    if (!token) {
      setAdminFeaturedItem(null);
      setAdminDescription('');
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/featured/by-space/${encodeURIComponent(token)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((item: AdminFeaturedItem | null) => {
        if (cancelled) return;
        setAdminFeaturedItem(item);
        setAdminDescription(item?.description ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setAdminFeaturedItem(null);
          setAdminDescription('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isHarvousAdmin, shareToken]);

  useEffect(() => {
    if (!isAdminDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target as Node)) {
        setIsAdminDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isAdminDropdownOpen]);

  useEffect(() => {
    if (!spaceId || !spaceId.startsWith('space_')) {
      return;
    }

    if (lastFetchedSpaceIdRef.current === spaceId) {
      return;
    }

    hasFetchedSpaceDataRef.current = false;
    lastFetchedSpaceIdRef.current = spaceId;

    const fetchSpaceData = async () => {
      try {
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`/api/spaces/${spaceId}/prefetch${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (response.ok) {
          const data = await response.json();
          const space = data.space;

          if (space) {
            setFormData((prev) => ({
              ...prev,
              title: space.title || '',
              selectedColor: space.color || 'paper',
              selectedType: space.isPublic ? 'Shared' : 'Private',
            }));

            if (space.isPublic) {
              fetchShareLink();
            }

            hasFetchedSpaceDataRef.current = true;
          }
        }
      } catch (error) {
        console.error('[SpaceSharePanel] Error fetching space data:', error);
      }
    };

    fetchSpaceData();
  }, [spaceId, fetchShareLink]);

  const saveTypeChange = useCallback(
    async (selectedType: 'Private' | 'Shared') => {
      const isPublic = selectedType === 'Shared';

      const saveId = `type_${Date.now()}`;
      activeSaveOperationsRef.current.add(saveId);
      setIsSaving(true);

      try {
        const currentTitle = formDataRef.current.title;
        const currentColor = formDataRef.current.selectedColor;

        const formDataToSend = new FormData();
        formDataToSend.append('title', currentTitle.trim());
        formDataToSend.append('color', currentColor);
        formDataToSend.append('isPublic', isPublic.toString());

        const response = await fetch(`/api/spaces/${spaceId}/update`, {
          method: 'POST',
          body: formDataToSend,
          credentials: 'include',
        });

        const data = await response.json();

        if (response.ok) {
          if (isPublic) {
            const linkResult = await fetchShareLink();
            if (linkResult && !linkResult.ok && linkResult.limitExceeded) {
              const revertFormData = new FormData();
              revertFormData.append('title', formDataRef.current.title.trim());
              revertFormData.append('color', formDataRef.current.selectedColor);
              revertFormData.append('isPublic', 'false');
              await fetch(`/api/spaces/${spaceId}/update`, {
                method: 'POST',
                body: revertFormData,
                credentials: 'include',
              });
              setFormData((prev) => ({ ...prev, selectedType: 'Private' }));
              setShareLink(null);
              window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
              return;
            }
            window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
          } else {
            setShareLink(null);
          }

          dispatchSpaceUpdated(
            spaceId,
            formDataRef.current.title,
            formDataRef.current.selectedColor,
            isPublic,
          );

          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `Space is now ${selectedType.toLowerCase()}`,
                type: 'success',
              },
            }),
          );
        } else {
          if (response.status === 403 && data.code === 'SHARED_SPACE_LIMIT_EXCEEDED') {
            window.dispatchEvent(
              new CustomEvent('toast', {
                detail: {
                  message: data.error,
                  type: 'error',
                  code: 'SHARED_SPACE_LIMIT_EXCEEDED',
                  upgradeUrl: data.upgradeUrl || '/addon',
                },
              }),
            );
            setFormData((prev) => ({ ...prev, selectedType: 'Private' }));
            setShareLink(null);
            return;
          }
          throw new Error(data.error || 'Failed to update space type');
        }
      } catch (error) {
        console.error('Error saving space type:', error);

        setFormData((prev) => ({
          ...prev,
          selectedType: isPublic ? 'Private' : 'Shared',
        }));

        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: 'Failed to update space type. Please try again.',
              type: 'error',
            },
          }),
        );
      } finally {
        activeSaveOperationsRef.current.delete(saveId);
        setIsSaving(false);
      }
    },
    [spaceId, fetchShareLink],
  );

  const handleToggleAdminFeature = async () => {
    if (!isHarvousAdmin) return;
    const token = shareToken?.trim();
    if (!token) return;
    if (isSavingAdminFeature) return;

    setIsSavingAdminFeature(true);
    try {
      if (adminFeaturedItem?.isActive) {
        const res = await fetch(`/api/admin/featured/${adminFeaturedItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive: false }),
        });
        if (!res.ok) throw new Error('Failed to update featured item');
        const updated = (await res.json()) as AdminFeaturedItem;
        setAdminFeaturedItem(updated);
        window.dispatchEvent(
          new CustomEvent('toast', { detail: { message: 'Removed from featured', type: 'success' } }),
        );
      } else {
        const res = await fetch('/api/admin/featured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            contentType: 'space',
            title: formDataRef.current.title?.trim() || 'Space',
            description: adminDescription?.trim() || null,
            shareToken: token,
            color: formDataRef.current.selectedColor,
            isActive: true,
          }),
        });
        if (!res.ok) throw new Error('Failed to create featured item');
        const created = (await res.json()) as AdminFeaturedItem;
        setAdminFeaturedItem(created);
        setAdminDescription(created?.description ?? adminDescription);
        window.dispatchEvent(
          new CustomEvent('toast', { detail: { message: 'Featured for everyone', type: 'success' } }),
        );
      }
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err?.message || 'Failed to update featured state', type: 'error' },
        }),
      );
    } finally {
      setIsSavingAdminFeature(false);
    }
  };

  const handleSaveAdminDescription = async () => {
    if (!isHarvousAdmin) return;
    if (!adminFeaturedItem?.id) return;
    if (!adminFeaturedItem.isActive) return;
    if (isSavingAdminFeature) return;

    const next = adminDescription?.trim() || null;
    if ((adminFeaturedItem.description ?? null) === next) return;

    setIsSavingAdminFeature(true);
    try {
      const res = await fetch(`/api/admin/featured/${adminFeaturedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description: next }),
      });
      if (!res.ok) throw new Error('Failed to update description');
      const updated = (await res.json()) as AdminFeaturedItem;
      setAdminFeaturedItem(updated);
    } catch {
      // non-fatal
    } finally {
      setIsSavingAdminFeature(false);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeNoteSharePanel'));
    }
  };

  const panelBusy = isSaving || isLoadingMembers;

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="form-layout">
        <div className="form-layout--expand" style={{ position: 'relative' }}>
          <div
            className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${panelBusy ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div
              className="panel__header"
              style={{
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor),
              }}
            >
              <div className="panel__title">
                <p>Share Space</p>
              </div>
            </div>

            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <div className="panel__content-scroll">
                  {!isLoadingMembers && !isOwner && (
                    <p className="panel__section-hint">
                      Only the space owner can change sharing.
                    </p>
                  )}

                  {isOwner && (
                    <>
                      <p className="panel__section-eyebrow">Visibility</p>
                      <ThreadVisibilityDropdown
                        isShared={formData.selectedType === 'Shared'}
                        shareUrl={shareLink}
                        onToggle={async (enabled) => {
                          if (!enabled && memberCount > 1) {
                            setShowMakePrivateDialog(true);
                          } else {
                            const type = enabled ? 'Shared' : 'Private';
                            setFormData((prev) => ({ ...prev, selectedType: type }));
                            await saveTypeChange(type);
                          }
                        }}
                        onRefresh={async () => setShowRefreshLinkDialog(true)}
                        isLoading={isGeneratingLink}
                        isEditMode={true}
                        privateTriggerLabel="Only I can see this space"
                        sharedTriggerLabel="Shared to anyone with link"
                        privateOptionLabel="Only I can see this space"
                        sharedOptionLabel="Share to anyone with link"
                      />

                      {isHarvousAdmin && formData.selectedType === 'Shared' && shareToken ? (
                        <div className="edit-space-panel__admin-section">
                          <div className="edit-space-panel__admin-header">
                            <span className="edit-space-panel__admin-label">Admin</span>
                          </div>

                          <div className="thread-visibility-dropdown" ref={adminDropdownRef}>
                            <button
                              type="button"
                              className="thread-visibility-dropdown__trigger space-button h-[64px] w-full"
                              style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                              onClick={() => setIsAdminDropdownOpen((o) => !o)}
                              disabled={isSavingAdminFeature}
                            >
                              <div className="flex items-center justify-between gap-3 relative w-full h-full">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="size-4 flex-center shrink-0">
                                    <Icon name="megaphone" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                                  </div>
                                  <span className="font-sans text-[18px] font-semibold whitespace-nowrap truncate text-[var(--color-deep-grey)]">
                                    {adminFeaturedItem?.isActive ? 'Featured for everyone' : 'Not featured'}
                                  </span>
                                </div>
                                <div className="size-4 flex-center shrink-0">
                                  <Icon
                                    name={isAdminDropdownOpen ? 'caret-up' : 'caret-down'}
                                    size={16}
                                    style={{ color: 'var(--color-deep-grey)' }}
                                  />
                                </div>
                              </div>
                            </button>

                            {isAdminDropdownOpen && (
                              <div className="thread-visibility-dropdown__options">
                                <button
                                  type="button"
                                  className="thread-visibility-dropdown__option"
                                  onClick={() => {
                                    if (adminFeaturedItem?.isActive) {
                                      void handleToggleAdminFeature();
                                      setIsAdminDropdownOpen(false);
                                      setPendingFeature(false);
                                    } else {
                                      setPendingFeature(false);
                                      setIsAdminDropdownOpen(false);
                                    }
                                  }}
                                  disabled={isSavingAdminFeature}
                                >
                                  <div className="thread-visibility-dropdown__option-content">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <span className="thread-visibility-dropdown__option-text">Not featured</span>
                                    </div>
                                    {!adminFeaturedItem?.isActive && !pendingFeature && (
                                      <div className="thread-visibility-dropdown__check-slot">
                                        <span className="thread-visibility-dropdown__check" aria-hidden="true">
                                          <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  className="thread-visibility-dropdown__option"
                                  onClick={() => {
                                    if (!adminFeaturedItem?.isActive) {
                                      setPendingFeature(true);
                                    }
                                  }}
                                  disabled={isSavingAdminFeature}
                                >
                                  <div className="thread-visibility-dropdown__option-content">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <span className="thread-visibility-dropdown__option-text">Feature for everyone</span>
                                    </div>
                                    {(adminFeaturedItem?.isActive || pendingFeature) && (
                                      <div className="thread-visibility-dropdown__check-slot">
                                        <span className="thread-visibility-dropdown__check" aria-hidden="true">
                                          <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </button>

                                {(pendingFeature || adminFeaturedItem?.isActive) && (
                                  <div className="thread-visibility-dropdown__sharing-ui">
                                    <textarea
                                      className="edit-space-panel__admin-description"
                                      placeholder="Description shown on the card…"
                                      value={adminDescription}
                                      onChange={(e) => setAdminDescription(e.target.value)}
                                      onBlur={adminFeaturedItem?.isActive ? handleSaveAdminDescription : undefined}
                                      rows={3}
                                    />
                                    {pendingFeature && !adminFeaturedItem?.isActive && (
                                      <button
                                        type="button"
                                        className="btn btn--lg btn--secondary"
                                        disabled={isSavingAdminFeature}
                                        onClick={async () => {
                                          await handleToggleAdminFeature();
                                          setPendingFeature(false);
                                          setIsAdminDropdownOpen(false);
                                        }}
                                      >
                                        {isSavingAdminFeature ? 'Sending…' : 'Send to everyone'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showMakePrivateDialog}
        title="Make this space private?"
        message={`This space has ${memberCount - 1} ${memberCount - 1 === 1 ? 'person' : 'people'} in it. Making it private means they'll lose access to this space.`}
        confirmLabel="Make Private"
        cancelLabel="Keep Shared"
        confirmDestructive={true}
        onConfirm={async () => {
          setShowMakePrivateDialog(false);
          setFormData((prev) => ({ ...prev, selectedType: 'Private' }));
          await saveTypeChange('Private');
        }}
        onCancel={() => setShowMakePrivateDialog(false)}
      />
      <ConfirmDialog
        isOpen={showRefreshLinkDialog}
        title="Generate new share link?"
        message="This creates a new link and permanently invalidates the old one."
        confirmLabel={isGeneratingLink ? 'Generating…' : 'Generate new link'}
        cancelLabel="Cancel"
        onConfirm={async () => {
          setShowRefreshLinkDialog(false);
          await generateNewShareLink();
        }}
        onCancel={() => setShowRefreshLinkDialog(false)}
      />
    </div>
  );
}
