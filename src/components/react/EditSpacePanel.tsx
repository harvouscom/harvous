import React, { useState, useEffect, useRef, useCallback } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, getThreadGradientCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import ActionButton from './ActionButton';
import Icon from './Icon';
import TabNav from './TabNav';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';
import ConfirmDialog from './dialogs/ConfirmDialog';
import { formatBadgeCount } from '@/utils/badge-count';
import { idToUrl } from '@/utils/url-helpers';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { updateSpaceOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  [key: string]: any;
}

interface Thread {
  id: string;
  title: string;
  color?: string;
  spaceId: string | null;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  [key: string]: any;
}

interface EditSpacePanelProps {
  spaceId: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EditSpacePanel({ 
  spaceId,
  initialTitle = '', 
  initialColor = 'paper',
  onClose,
  inBottomSheet = false
}: EditSpacePanelProps) {
  const userId = usePersistedUserId();
  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private'
  });
  
  // Track initial values for unsaved changes detection
  const [initialValues, setInitialValues] = useState({
    title: initialTitle,
    color: initialColor
  });
  
  // Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [currentSpaceNotes, setCurrentSpaceNotes] = useState<Note[]>([]);
  const [currentSpaceThreads, setCurrentSpaceThreads] = useState<Thread[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingCurrentItems, setIsLoadingCurrentItems] = useState(true);
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [isRemovingItem, setIsRemovingItem] = useState(false);

  // Member management state
  const [memberCount, setMemberCount] = useState(1); // Default to 1 (owner)
  const [memberLimit, setMemberLimit] = useState<number | null>(null); // Plan limit (owners only)
  const [isOwner, setIsOwner] = useState(false);
  const [sharedTab, setSharedTab] = useState('invite');
  const [members, setMembers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Share link state (simplified approach like ThreadVisibilityDropdown)
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Make-private confirmation dialog
  const [showMakePrivateDialog, setShowMakePrivateDialog] = useState(false);

  // Remove-member confirmation dialog (remove other or leave self)
  const [pendingRemoveMember, setPendingRemoveMember] = useState<{
    userId: string;
    memberName: string;
    isSelf: boolean;
  } | null>(null);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'added' | 'all' | 'people'>('added');
  
  // Refs to track current values for save functions (avoid stale closures)
  const formDataRef = useRef(formData);
  
  // Refs to track pending saves and debounce timers
  const pendingTitleSaveRef = useRef<string | null>(null);
  const pendingColorSaveRef = useRef<ThreadColor | null>(null);
  const titleDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeSaveOperationsRef = useRef<Set<string>>(new Set());
  // Track if we've fetched space data to prevent props from overwriting it
  const hasFetchedSpaceDataRef = useRef(false);
  // Track last fetched spaceId to avoid refetching unnecessarily
  const lastFetchedSpaceIdRef = useRef<string | null>(null);
  
  // Update refs when values change
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Reset to 'added' tab when People tab disappears (space switches to Private or last member removed)
  useEffect(() => {
    const showPeopleTab = formData.selectedType === 'Shared' && members.length > 1;
    if (!showPeopleTab && activeTab === 'people') {
      setActiveTab('added');
    }
  }, [formData.selectedType, members.length]);



  // Fetch all notes and threads (for AddToSpaceSection)
  const fetchAllItems = async () => {
    setIsLoadingItems(true);
    try {
      const response = await fetch('/api/spaces/items', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setAllNotes(data.notes || []);
        setAllThreads(data.threads || []);
      } else {
        console.error('Failed to fetch items');
        setAllNotes([]);
        setAllThreads([]);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setAllNotes([]);
      setAllThreads([]);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Fetch all notes and threads on mount
  useEffect(() => {
    fetchAllItems();
  }, []);

  // Fetch current items in the space
  const fetchCurrentSpaceItems = async () => {
    setIsLoadingCurrentItems(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/items`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentSpaceNotes(data.notes || []);
        setCurrentSpaceThreads(data.threads || []);
      } else {
        console.error('Failed to fetch current space items');
        setCurrentSpaceNotes([]);
        setCurrentSpaceThreads([]);
      }
    } catch (error) {
      console.error('Error fetching current space items:', error);
      setCurrentSpaceNotes([]);
      setCurrentSpaceThreads([]);
    } finally {
      setIsLoadingCurrentItems(false);
    }
  };

  // Fetch current space items on mount and when spaceId changes
  useEffect(() => {
    if (spaceId) {
      fetchCurrentSpaceItems();
    }
  }, [spaceId]);

  // Fetch member info to determine member count and ownership
  const fetchMemberInfo = async () => {
    try {
      setIsLoadingMembers(true);
      const response = await fetch(`/api/spaces/${spaceId}/members`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setMemberCount(data.totalMembers || data.members?.length || 1);
        setIsOwner(data.isOwner || false);
        setMemberLimit(data.isOwner ? (data.memberLimit ?? null) : null);
        setMembers(data.members || []);
        setPendingInvitations(data.pendingInvitations || []);
      }
    } catch (error) {
      console.error('Error fetching member info:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Handle remove member: show ConfirmDialog (actual delete in handleConfirmRemoveMember)
  const handleRemoveMember = (memberUserId: string, memberName: string) => {
    const isSelf = memberUserId === userId; // current user leaving vs owner removing someone else
    setPendingRemoveMember({ userId: memberUserId, memberName, isSelf });
  };

  const handleConfirmRemoveMember = async () => {
    if (!pendingRemoveMember) return;
    const { userId: userIdToRemove, isSelf } = pendingRemoveMember;
    setPendingRemoveMember(null);

    try {
      setRemovingUserId(userIdToRemove);

      const response = await fetch(`/api/spaces/${spaceId}/members/${userIdToRemove}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove member');
      }

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || (isSelf ? 'You have left the space' : 'Member removed successfully'),
            type: 'success',
          },
        })
      );

      await fetchMemberInfo();
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to remove member',
            type: 'error',
          },
        })
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  // Fetch share link for public spaces. Returns { ok, limitExceeded } so callers can revert UI when limit exceeded.
  const fetchShareLink = async (): Promise<{ ok: boolean; limitExceeded?: boolean }> => {
    if (!spaceId) return { ok: false };

    try {
      const response = await fetch(`/api/spaces/${spaceId}/share-link`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setShareLink(data.shareUrl || null);
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
                upgradeUrl: data.upgradeUrl || '/upgrade',
              },
            })
          );
          return { ok: false, limitExceeded: true };
        }
      }
      return { ok: false };
    } catch (error) {
      console.error('[EditSpacePanel] Error fetching share link:', error);
      return { ok: false };
    }
  };

  // Handle generate new share link
  const generateNewShareLink = async () => {
    if (isGeneratingLink || !spaceId) return;

    const confirmed = confirm(
      'This will create a new link. The old link will stop working. Continue?'
    );

    if (!confirmed) return;

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

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'New share link generated',
            type: 'success',
          },
        })
      );
      window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to generate new link',
            type: 'error',
          },
        })
      );
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Helper to get member display name
  const getMemberDisplayName = (member: any) => {
    if (member.firstName || member.lastName) {
      return `${member.firstName || ''} ${member.lastName || ''}`.trim();
    }
    return member.email || 'Unknown User';
  };

  // Helper to format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Fetch member info on mount and when spaceId changes
  useEffect(() => {
    if (spaceId) {
      fetchMemberInfo();
    }
  }, [spaceId]);

  // Handle visibility change to refresh member list
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && spaceId) {
        fetchMemberInfo();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [spaceId]);

  // Fetch or clear share link when selectedType changes
  useEffect(() => {
    if (formData.selectedType === 'Shared' && spaceId) {
      fetchShareLink();
    } else {
      setShareLink(null);
    }
  }, [formData.selectedType, spaceId]);

  // Update initial values when props change
  useEffect(() => {
    setInitialValues({
      title: initialTitle,
      color: initialColor
    });
  }, [initialTitle, initialColor]);
  
  // Sync formData with props when they change, but only if we haven't fetched data yet
  useEffect(() => {
    // Skip if we've already fetched fresh data (prevents overwriting with stale props)
    if (hasFetchedSpaceDataRef.current) {
      return;
    }
    
    setFormData(prev => {
      // Only update if props actually changed to avoid unnecessary re-renders
      if (prev.title !== initialTitle || prev.selectedColor !== initialColor) {
        return {
          ...prev,
          title: initialTitle,
          selectedColor: initialColor
        };
      }
      return prev;
    });
  }, [initialTitle, initialColor]);
  
  // Fetch latest space data on mount to ensure we have saved values (even if props are stale)
  // Only fetch once per spaceId change, not on every formData change
  useEffect(() => {
    if (!spaceId || !spaceId.startsWith('space_')) {
      return; // Skip for invalid space IDs
    }
    
    // Only fetch if spaceId changed (new space) or we haven't fetched yet
    if (lastFetchedSpaceIdRef.current === spaceId) {
      // Already fetched for this spaceId, don't refetch
      return;
    }
    
    // Reset fetch flag when spaceId changes
    hasFetchedSpaceDataRef.current = false;
    lastFetchedSpaceIdRef.current = spaceId;
    
    const fetchSpaceData = async () => {
      try {
        // Add cache-busting query param to ensure fresh data
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`/api/spaces/${spaceId}/prefetch${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-store' // Bypass browser cache
        });
        
        if (response.ok) {
          const data = await response.json();
          const space = data.space;
          
          if (space) {
            // Always update formData with fetched data (don't check initial props)
            // The API is the source of truth, not the stale props
            setFormData(prev => ({
              ...prev,
              title: space.title || '',
              selectedColor: space.color || 'paper',
              selectedType: space.isPublic ? 'Shared' : 'Private'
            }));

            // Always update initialValues to match fetched data
            setInitialValues(prev => ({
              ...prev,
              title: space.title || '',
              color: space.color || 'paper'
            }));

            // Fetch share link if space is public
            if (space.isPublic) {
              fetchShareLink();
            }

            // Mark that we've fetched data
            hasFetchedSpaceDataRef.current = true;
          }
        }
      } catch (error) {
        console.error('[EditSpacePanel] Error fetching space data:', error);
        // Silently fail - props will be used as fallback
      }
    };
    
    fetchSpaceData();
  }, [spaceId, initialTitle, initialColor]);

  // Validate title
  const validateTitle = (title: string): boolean => {
    return title.trim().length >= 1;
  };
  
  // Update navigation DOM elements for live updates
  // Uses requestAnimationFrame on mobile to ensure updates are visible after animations
  const updateNavigationDOM = (title?: string, color?: ThreadColor) => {
    if (typeof document === 'undefined') return;
    
    const performUpdate = () => {
      const gradient = color !== undefined ? getThreadGradientCSS(color) : undefined;
      
      // Update navigation wrapper element (desktop)
      const navElement = document.querySelector(`[data-navigation-active="true"][data-space-id="${spaceId}"]`) || 
                         document.querySelector(`[data-space-id="${spaceId}"]`) ||
                         document.querySelector(`[slot="navigation"][data-space-id="${spaceId}"]`);
      if (navElement) {
        if (title !== undefined) {
          navElement.setAttribute('data-space-title', title.trim());
        }
        if (color !== undefined && gradient) {
          navElement.setAttribute('data-space-background-gradient', gradient);
        }
      }
      
      // Update main content div (used by page meta - works on both desktop and mobile)
      const mainDiv = document.querySelector(`[data-navigation-item="${spaceId}"]`);
      if (mainDiv) {
        if (title !== undefined) {
          mainDiv.setAttribute('data-title', title.trim());
        }
        if (color !== undefined && gradient) {
          mainDiv.setAttribute('data-background-gradient', gradient);
        }
        // Also set space-specific attributes for mobile navigation to read
        if (title !== undefined) {
          mainDiv.setAttribute('data-space-title', title.trim());
        }
        if (color !== undefined && gradient) {
          mainDiv.setAttribute('data-space-background-gradient', gradient);
        }
      }
      
      // Update CardStack header (the visible header on the space page - works on both desktop and mobile)
      const cardStackHeader = document.querySelector(`.card-stack__header[data-space-id="${spaceId}"]`);
      if (cardStackHeader) {
        if (title !== undefined) {
          // Update the text content in the page-heading element
          const pageHeading = cardStackHeader.querySelector('.page-heading p');
          if (pageHeading) {
            pageHeading.textContent = title.trim();
          }
          // Also update data attribute for mobile navigation
          cardStackHeader.setAttribute('data-space-title', title.trim());
        }
        if (color !== undefined && gradient) {
          // Update background color - use !important to ensure it persists on mobile
          const bgColor = getThreadColorCSS(color);
          (cardStackHeader as HTMLElement).style.setProperty('background-color', bgColor, 'important');
          // Update text color based on space color
          const textColor = getThreadTextColorCSS(color);
          (cardStackHeader as HTMLElement).style.setProperty('color', textColor, 'important');
          // Also update data attribute for mobile navigation
          cardStackHeader.setAttribute('data-space-background-gradient', gradient);
        }
      }
      
      // Update mobile navigation elements (if they exist)
      const allSpaceElements = document.querySelectorAll(`[data-space-id="${spaceId}"]`);
      allSpaceElements.forEach((el) => {
        if (title !== undefined) {
          el.setAttribute('data-space-title', title.trim());
        }
        if (color !== undefined && gradient) {
          el.setAttribute('data-space-background-gradient', gradient);
        }
      });
    };
    
    // On mobile (or when inBottomSheet), use requestAnimationFrame to ensure updates are visible
    // after any bottom sheet animations complete
    if (inBottomSheet || (typeof window !== 'undefined' && window.innerWidth < 1160)) {
      // Double RAF to ensure it happens after any animations
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          performUpdate();
        });
      });
    } else {
      // On desktop, update immediately
      performUpdate();
    }
  };
  
  // Auto-save title changes (debounced) - using useCallback with refs to avoid stale closures
  const saveTitleChange = useCallback(async (title: string) => {
    if (!validateTitle(title)) {
      return;
    }
    
    if (title.trim() === initialValues.title) {
      // Clear pending save if it matches initial value
      pendingTitleSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingSpaceTitle_${spaceId}`);
      }
      return; // No change
    }
    
    // Track this save operation
    const saveId = `title_${Date.now()}`;
    activeSaveOperationsRef.current.add(saveId);
    setIsSaving(true);
    setSaveError(null);
    
    // Clear pending save from sessionStorage since we're saving now
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`pendingSpaceTitle_${spaceId}`);
    }
    pendingTitleSaveRef.current = null;
    
    try {
      // Use refs to get current values (avoid stale closures)
      const currentColor = formDataRef.current.selectedColor;
      
      const formDataToSend = new FormData();
      formDataToSend.append('title', title.trim());
      formDataToSend.append('color', currentColor);
      
      // OFFLINE-FIRST: Update space in local IndexedDB immediately
      let offlineUpdateSuccess = false;
      if (userId) {
        try {
          await updateSpaceOffline(userId, spaceId, {
            title: title.trim(),
            color: currentColor,
          });
          offlineUpdateSuccess = true;
        } catch (err) {
          console.error('[EditSpacePanel] Failed to update space offline:', err);
        }
      }
      
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch(`/api/spaces/${spaceId}/update`, {
          method: 'POST',
          body: formDataToSend,
          credentials: 'include'
        });
      } catch (error) {
        networkError = isNetworkError(error);
        
        if (networkError && offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, title: title.trim() }));
          // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
          lastFetchedSpaceIdRef.current = spaceId;
          updateNavigationDOM(title.trim());
          const eventDetail = { 
            spaceId,
            title: title.trim(),
            color: currentColor,
            backgroundGradient: getThreadGradientCSS(currentColor)
          };
          window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
          console.log('[EditSpacePanel] Dispatched spaceUpdated (offline success)', eventDetail);
          activeSaveOperationsRef.current.delete(saveId);
          setIsSaving(false);
          return;
        } else {
          throw error;
        }
      }
      
      const data = await response.json();
      
      if (response && response.ok) {
        setInitialValues(prev => ({ ...prev, title: title.trim() }));
        // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
        lastFetchedSpaceIdRef.current = spaceId;
        updateNavigationDOM(title.trim());
        const eventDetail = { 
          spaceId,
          title: title.trim(),
          color: currentColor,
          backgroundGradient: getThreadGradientCSS(currentColor)
        };
        window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
        console.log('[EditSpacePanel] Dispatched spaceUpdated (title save success)', eventDetail);
      } else {
        if (offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, title: title.trim() }));
          // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
          lastFetchedSpaceIdRef.current = spaceId;
          updateNavigationDOM(title.trim());
          const eventDetail = { 
            spaceId,
            title: title.trim(),
            color: currentColor,
            backgroundGradient: getThreadGradientCSS(currentColor)
          };
          window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
          console.log('[EditSpacePanel] Dispatched spaceUpdated (offline fallback)', eventDetail);
        } else {
          throw new Error(data.error || 'Failed to update space');
        }
      }
    } catch (error) {
      console.error('Error auto-saving title:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save title');
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to save title. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      activeSaveOperationsRef.current.delete(saveId);
      setIsSaving(false);
    }
  }, [spaceId, userId, initialValues.title]);
  
  // Auto-save color changes (immediate) - using useCallback with refs to avoid stale closures
  const saveColorChange = useCallback(async (color: ThreadColor) => {
    if (color === initialValues.color) {
      // Clear pending save if it matches initial value
      pendingColorSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingSpaceColor_${spaceId}`);
      }
      return; // No change
    }
    
    // Track this save operation
    const saveId = `color_${Date.now()}`;
    activeSaveOperationsRef.current.add(saveId);
    setIsSaving(true);
    setSaveError(null);
    
    // Clear pending save from sessionStorage since we're saving now
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`pendingSpaceColor_${spaceId}`);
    }
    pendingColorSaveRef.current = null;
    
    try {
      // Use refs to get current values (avoid stale closures)
      const currentTitle = formDataRef.current.title;
      
      const formDataToSend = new FormData();
      formDataToSend.append('title', currentTitle.trim());
      formDataToSend.append('color', color);
      
      // OFFLINE-FIRST: Update space in local IndexedDB immediately
      let offlineUpdateSuccess = false;
      if (userId) {
        try {
          await updateSpaceOffline(userId, spaceId, {
            title: currentTitle.trim(),
            color: color,
          });
          offlineUpdateSuccess = true;
        } catch (err) {
          console.error('[EditSpacePanel] Failed to update space offline:', err);
        }
      }
      
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch(`/api/spaces/${spaceId}/update`, {
          method: 'POST',
          body: formDataToSend,
          credentials: 'include'
        });
      } catch (error) {
        networkError = isNetworkError(error);
        
        if (networkError && offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, color: color }));
          // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
          lastFetchedSpaceIdRef.current = spaceId;
          updateNavigationDOM(undefined, color);
          const eventDetail = { 
            spaceId,
            title: currentTitle.trim(),
            color: color,
            backgroundGradient: getThreadGradientCSS(color)
          };
          window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
          console.log('[EditSpacePanel] Dispatched spaceUpdated (color offline success)', eventDetail);
          activeSaveOperationsRef.current.delete(saveId);
          setIsSaving(false);
          return;
        } else {
          throw error;
        }
      }
      
      const data = await response.json();
      
      if (response && response.ok) {
        setInitialValues(prev => ({ ...prev, color: color }));
        // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
        lastFetchedSpaceIdRef.current = spaceId;
        updateNavigationDOM(undefined, color);
        const eventDetail = { 
          spaceId,
          title: currentTitle.trim(),
          color: color,
          backgroundGradient: getThreadGradientCSS(color)
        };
        window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
        console.log('[EditSpacePanel] Dispatched spaceUpdated (color save success)', eventDetail);
      } else {
        if (offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, color: color }));
          // Update lastFetchedSpaceIdRef to indicate we have fresh data from save
          lastFetchedSpaceIdRef.current = spaceId;
          updateNavigationDOM(undefined, color);
          const eventDetail = { 
            spaceId,
            title: currentTitle.trim(),
            color: color,
            backgroundGradient: getThreadGradientCSS(color)
          };
          window.dispatchEvent(new CustomEvent('spaceUpdated', { detail: eventDetail }));
          console.log('[EditSpacePanel] Dispatched spaceUpdated (color offline fallback)', eventDetail);
        } else {
          throw new Error(data.error || 'Failed to update space');
        }
      }
    } catch (error) {
      console.error('Error auto-saving color:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save color');
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to save color. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      activeSaveOperationsRef.current.delete(saveId);
      setIsSaving(false);
    }
  }, [spaceId, userId, initialValues.color]);

  // Save type change (Private/Shared)
  const saveTypeChange = useCallback(async (selectedType: 'Private' | 'Shared') => {
    const isPublic = selectedType === 'Shared';

    // Track this save operation
    const saveId = `type_${Date.now()}`;
    activeSaveOperationsRef.current.add(saveId);
    setIsSaving(true);
    setSaveError(null);

    try {
      // Use refs to get current values (avoid stale closures)
      const currentTitle = formDataRef.current.title;
      const currentColor = formDataRef.current.selectedColor;

      const formDataToSend = new FormData();
      formDataToSend.append('title', currentTitle.trim());
      formDataToSend.append('color', currentColor);
      formDataToSend.append('isPublic', isPublic.toString());

      const response = await fetch(`/api/spaces/${spaceId}/update`, {
        method: 'POST',
        body: formDataToSend,
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        // Success - fetch share link if now public (creates token on first GET)
        if (isPublic) {
          const linkResult = await fetchShareLink();
          if (linkResult && !linkResult.ok && linkResult.limitExceeded) {
            // Revert: server rejected creating share link due to limit; set space back to private
            const revertFormData = new FormData();
            revertFormData.append('title', formData.title.trim());
            revertFormData.append('color', formData.selectedColor);
            revertFormData.append('isPublic', 'false');
            await fetch(`/api/spaces/${spaceId}/update`, {
              method: 'POST',
              body: revertFormData,
              credentials: 'include',
            });
            setFormData(prev => ({ ...prev, selectedType: 'Private' }));
            setShareLink(null);
            window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
            return;
          }
          window.dispatchEvent(new CustomEvent('mySharingInvalidate'));
        } else {
          setShareLink(null);
        }

        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: `Space is now ${selectedType.toLowerCase()}`,
            type: 'success'
          }
        }));
      } else {
        if (response.status === 403 && data.code === 'SHARED_SPACE_LIMIT_EXCEEDED') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: data.error,
                type: 'error',
                code: 'SHARED_SPACE_LIMIT_EXCEEDED',
                upgradeUrl: data.upgradeUrl || '/upgrade',
              },
            })
          );
          setFormData(prev => ({ ...prev, selectedType: 'Private' }));
          setShareLink(null);
          return;
        }
        throw new Error(data.error || 'Failed to update space type');
      }
    } catch (error) {
      console.error('Error saving space type:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save space type');

      // Revert the UI change
      setFormData(prev => ({
        ...prev,
        selectedType: isPublic ? 'Private' : 'Shared'
      }));

      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to update space type. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      activeSaveOperationsRef.current.delete(saveId);
      setIsSaving(false);
    }
  }, [spaceId, fetchShareLink]);

  // Check for pending saves from sessionStorage on mount (for mobile remounts)
  // Must be after saveTitleChange and saveColorChange are defined
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const pendingTitle = sessionStorage.getItem(`pendingSpaceTitle_${spaceId}`);
    const pendingColor = sessionStorage.getItem(`pendingSpaceColor_${spaceId}`);
    
    if (pendingTitle && pendingTitle !== initialTitle) {
      // Restore pending title save
      pendingTitleSaveRef.current = pendingTitle;
      // Clear from sessionStorage
      sessionStorage.removeItem(`pendingSpaceTitle_${spaceId}`);
      // Trigger save after a small delay to ensure component is fully mounted
      setTimeout(() => {
        saveTitleChange(pendingTitle).catch(err => {
          console.error('[EditSpacePanel] Error restoring pending title save:', err);
        });
      }, 100);
    }
    
    if (pendingColor && pendingColor !== initialColor) {
      // Restore pending color save
      pendingColorSaveRef.current = pendingColor as ThreadColor;
      // Clear from sessionStorage
      sessionStorage.removeItem(`pendingSpaceColor_${spaceId}`);
      // Trigger save after a small delay to ensure component is fully mounted
      setTimeout(() => {
        saveColorChange(pendingColor as ThreadColor).catch(err => {
          console.error('[EditSpacePanel] Error restoring pending color save:', err);
        });
      }, 100);
    }
  }, [saveTitleChange, saveColorChange, spaceId, initialTitle, initialColor]); // Run when save functions are available
  
  // Cleanup effect: ensure all pending saves complete before unmount
  useEffect(() => {
    return () => {
      // Complete any pending debounced saves
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
        
        if (pendingTitleSaveRef.current && pendingTitleSaveRef.current !== initialValues.title) {
          // Complete the save synchronously if possible, but don't block
          saveTitleChange(pendingTitleSaveRef.current).catch(err => {
            console.error('[EditSpacePanel] Error completing pending title save on unmount:', err);
          });
        }
      }
      
      // Wait for active save operations to complete (with timeout)
      if (activeSaveOperationsRef.current.size > 0) {
        const maxWait = 2000; // Max 2 seconds
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if (activeSaveOperationsRef.current.size === 0 || Date.now() - startTime > maxWait) {
            clearInterval(checkInterval);
          }
        }, 100);
      }
    };
  }, [saveTitleChange, initialValues.title]);
  
  // Debounced auto-save for title changes
  useEffect(() => {
    if (formData.title === initialValues.title) {
      // Clear any pending save
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
      }
      pendingTitleSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingSpaceTitle_${spaceId}`);
      }
      return; // No change
    }
    
    // Store pending save in sessionStorage (for mobile remounts)
    pendingTitleSaveRef.current = formData.title;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`pendingSpaceTitle_${spaceId}`, formData.title);
    }
    
    // Clear existing timer
    if (titleDebounceTimerRef.current) {
      clearTimeout(titleDebounceTimerRef.current);
    }
    
    const timeoutId = setTimeout(() => {
      saveTitleChange(formData.title);
      titleDebounceTimerRef.current = null;
    }, 1500); // 1.5 second debounce
    
    titleDebounceTimerRef.current = timeoutId;
    
    return () => {
      // On unmount, if there's a pending save, complete it immediately
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
        
        // Complete the pending save before unmounting
        if (pendingTitleSaveRef.current && pendingTitleSaveRef.current !== initialValues.title) {
          // Use a small delay to ensure the save function can access current state
          // But don't block unmount - the save will complete asynchronously
          saveTitleChange(pendingTitleSaveRef.current).catch(err => {
            console.error('[EditSpacePanel] Error completing pending title save on unmount:', err);
          });
        }
      }
    };
  }, [formData.title, initialValues.title, saveTitleChange, spaceId]);


  // Remove items from space
  const handleRemoveFromSpace = async (itemId: string, itemType: 'note' | 'thread') => {
    setIsRemovingItem(true);
    try {
      const noteIds = itemType === 'note' ? [itemId] : [];
      const threadIds = itemType === 'thread' ? [itemId] : [];

      const response = await fetch(`/api/spaces/${spaceId}/remove-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          noteIds,
          threadIds
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: itemType === 'note' ? 'Note removed from space' : 'Thread removed from space',
            type: 'success'
          }
        }));

        // Dispatch event for item removed from space
        window.dispatchEvent(new CustomEvent('itemRemovedFromSpace', {
          detail: { itemId, itemType, spaceId }
        }));

        // Refresh current space items and all items (so removed item appears in available list)
        await Promise.all([
          fetchCurrentSpaceItems(),
          fetchAllItems()
        ]);
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || `Error removing ${itemType} from space`,
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error removing item from space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Error removing ${itemType} from space. Please try again.`,
          type: 'error'
        }
      }));
    } finally {
      setIsRemovingItem(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Handle color selection (auto-save immediately)
  const handleColorSelect = async (color: ThreadColor) => {
    setFormData(prev => ({ ...prev, selectedColor: color }));
    await saveColorChange(color);
  };

  // Handle close (no navigation needed - auto-save handles updates)
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
    }
  };

  // Handle item selection - immediately add to space
  const handleItemSelect = async (itemId: string, itemType: 'note' | 'thread') => {
    setIsAddingItems(true);
    try {
      const noteIds = itemType === 'note' ? [itemId] : [];
      const threadIds = itemType === 'thread' ? [itemId] : [];

      const response = await fetch(`/api/spaces/${spaceId}/add-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          noteIds,
          threadIds
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: itemType === 'note' ? 'Note added to space' : 'Thread added to space',
            type: 'success'
          }
        }));

        // Dispatch event so SpaceContentList updates immediately
        window.dispatchEvent(new CustomEvent('itemAddedToSpace', {
          detail: { spaceId, itemId, itemType }
        }));

        // Refresh current space items and all items (so added item disappears from available list)
        await Promise.all([
          fetchCurrentSpaceItems(),
          fetchAllItems()
        ]);
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || `Failed to add ${itemType} to space`,
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error adding item to space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Error adding ${itemType} to space. Please try again.`,
          type: 'error'
        }
      }));
    } finally {
      setIsAddingItems(false);
    }
  };

  // Use centralized stripHtml utility
  const stripHtml = (html: string): string => stripHtmlForPreview(html, 150);

  // Render compact thread item (similar to ThreadItem in AddToSpaceSection)
  const renderCompactThreadItem = (thread: Thread) => {
    const threadAccentColor = thread.color ? `var(--color-${thread.color})` : "var(--color-purple)";
    
    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          height: '48px',
          width: '100%',
          textAlign: 'left',
          backgroundColor: 'white',
          boxShadow: 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Accent bar on left */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '2.75rem',
            borderTopLeftRadius: '0.75rem',
            borderBottomLeftRadius: '0.75rem',
            overflow: 'hidden',
            backgroundColor: threadAccentColor
          }}
        />
        
        {/* Content */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            paddingLeft: '0.75rem',
            paddingRight: '3rem',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Layer-group (space Shared) or user icon (space Private) */}
          <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
            {formData.selectedType === 'Shared' ? (
              <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 576 512">
                <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z"/>
              </svg>
            ) : (
              <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            )}
          </div>
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title with badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}>
                {thread.title || 'Untitled Thread'}
              </div>
              {/* Item count badge */}
              {((thread.count !== undefined && thread.count !== null && thread.count > 0) || 
                (thread.noteCount !== undefined && thread.noteCount !== null && thread.noteCount > 0)) && (
                <div className="badge-count" style={{ flexShrink: 0 }}>
                  <span className="badge-number">
                    {formatBadgeCount(thread.count ?? thread.noteCount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render compact note item (similar to EditThreadPanel)
  const renderCompactNoteItem = (note: Note) => {
    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          height: '48px',
          width: '100%',
          textAlign: 'left',
          backgroundColor: 'white',
          boxShadow: 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Accent bar on left */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '2.75rem',
            borderTopLeftRadius: '0.75rem',
            borderBottomLeftRadius: '0.75rem',
            overflow: 'hidden',
            backgroundColor: 'var(--color-light-paper)'
          }}
        />
        
        {/* Content */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            paddingLeft: '0.75rem',
            paddingRight: '3rem',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Note type icon - default bookmark */}
          <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
            <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ 
              fontFamily: 'var(--font-sans)', 
              fontWeight: 700, 
              color: 'var(--color-deep-grey)', 
              fontSize: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {note.title || 'Untitled Note'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isPanelLoading = isLoadingItems || isLoadingCurrentItems;
  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="form-layout">
        {/* Content area that expands to fill available space */}
        <div className="form-layout--expand" style={{ position: 'relative' }}>
          {isPanelLoading && (
            <div className="panel__progress-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}>
              <div className="panel__progress-fill" />
            </div>
          )}
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isPanelLoading ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* Header section with dynamic background */}
            <div 
              className="panel__header"
              style={{ 
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor)
              }}
            >
              <div className="panel__title">
                <p>{isOwner ? 'Edit Space' : 'About Space'}</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
                {/* Space title and color: owner only; members only see tab nav below */}
                {isOwner && (
                  <>
                    <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder={formData.title ? '' : 'Space Title'}
                        className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full"
                      />
                      {validationErrors.title && (
                        <div className="text-red-500 text-sm mt-1 text-center">
                          {validationErrors.title}
                        </div>
                      )}
                    </div>
                    <div className="color-selection flex gap-2 items-center justify-start w-full">
                      {THREAD_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleColorSelect(color)}
                          className={`color-swatch ${formData.selectedColor === color ? 'color-swatch--selected' : ''}`}
                          style={{ backgroundColor: getThreadColorCSS(color) }}
                        >
                          {formData.selectedColor === color && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Icon
                                name="check"
                                size={20}
                                style={{ color: getThreadTextColorCSS(color) }}
                              />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Space visibility dropdown: owner only */}
                {isOwner && (
                  <ThreadVisibilityDropdown
                    isShared={formData.selectedType === 'Shared'}
                    shareUrl={shareLink}
                    onToggle={async (enabled) => {
                      if (!enabled && memberCount > 1) {
                        setShowMakePrivateDialog(true);
                      } else {
                        const type = enabled ? 'Shared' : 'Private';
                        setFormData(prev => ({ ...prev, selectedType: type }));
                        await saveTypeChange(type);
                      }
                    }}
                    onRefresh={generateNewShareLink}
                    isLoading={isGeneratingLink}
                    isEditMode={true}
                    privateTriggerLabel="Only I can see this space"
                    sharedTriggerLabel="Shared to anyone with link"
                    privateOptionLabel="Only I can see this space"
                    sharedOptionLabel="Share to anyone with link"
                  />
                )}

                {/* Only show when at invisible people cap (no number shown) */}
                {!isLoadingMembers && isOwner && memberLimit != null && memberCount >= memberLimit && (
                  <div
                    className="bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: 'var(--color-red, #dc2626)'
                    }}
                  >
                    <Icon
                      name="user-group"
                      size={16}
                      className="flex-shrink-0"
                      style={{ color: 'var(--color-red, #dc2626)' }}
                    />
                    <span className="text-base font-semibold" style={{ color: 'var(--color-red, #dc2626)' }}>
                      This space has reached its people limit.
                    </span>
                  </div>
                )}

                {/* Tab navigation */}
                {(() => {
                  const showPeopleTab = formData.selectedType === 'Shared' && members.length > 1;
                  const tabs = [
                    { id: 'added', label: 'Added', isActive: activeTab === 'added', count: (currentSpaceNotes.length + currentSpaceThreads.length) || undefined },
                    { id: 'search', label: 'Add', isActive: activeTab === 'all' },
                    ...(showPeopleTab ? [{ id: 'people', label: 'People', isActive: activeTab === 'people', count: memberCount }] : []),
                  ];
                  return (
                    <TabNav
                      tabs={tabs}
                      onTabChange={(id) => setActiveTab(id === 'search' ? 'all' : id as 'added' | 'all' | 'people')}
                      className="content-tabs"
                    />
                  );
                })()}

                {/* Added tab: current items in the space */}
                {activeTab === 'added' && (
                  <div className="w-full shrink-0 mb-3">
                    {!isLoadingCurrentItems && (currentSpaceNotes.length > 0 || currentSpaceThreads.length > 0) ? (
                      <div className="flex flex-col gap-2" style={{ paddingBottom: '12px' }}>
                        {/* Current Threads */}
                        {currentSpaceThreads.map(thread => (
                          <div key={thread.id} className="relative group">
                            <a
                              href={idToUrl(thread.id)}
                              className="block"
                              aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                            >
                              {renderCompactThreadItem(thread)}
                            </a>
                            {(isOwner || thread.userId === userId) && (
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveFromSpace(thread.id, 'thread');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover z-10"
                                disabled={isRemovingItem}
                              />
                            )}
                          </div>
                        ))}

                        {/* Current Notes */}
                        {currentSpaceNotes.map(note => (
                          <div key={note.id} className="relative group">
                            <a
                              href={idToUrl(note.id)}
                              className="block"
                              aria-label={`View note: ${note.title || 'Untitled note'}`}
                            >
                              {renderCompactNoteItem(note)}
                            </a>
                            {(isOwner || note.userId === userId) && (
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveFromSpace(note.id, 'note');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover z-10"
                                disabled={isRemovingItem}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      !isLoadingCurrentItems && (
                        <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm">
                          No items in this space.
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Add tab: search/add interface (owner and member see their own items) */}
                {activeTab === 'all' && (
                  <div className="w-full flex-1 min-h-0">
                    {isLoadingItems ? (
                      <div className="text-center py-8 text-[var(--color-stone-grey)]">
                        Loading items...
                      </div>
                    ) : (
                      <AddToSpaceSection
                        allNotes={allNotes}
                        allThreads={allThreads}
                        currentSpaceId={spaceId}
                        onItemSelect={handleItemSelect}
                        selectedItems={[]}
                        isLoading={isAddingItems}
                        placeholder="Search notes and threads"
                        emptyMessage="No items found"
                      />
                    )}
                  </div>
                )}

                {/* People tab: list of people in this space */}
                {activeTab === 'people' && formData.selectedType === 'Shared' && members.length > 1 && (
                  <div className="space-people-list">
                    <div className="space-people-list__rows">
                      {members.map((member) => {
                        const initials = [member.firstName?.[0], member.lastName?.[0]]
                          .filter(Boolean).join('').toUpperCase() || '?';
                        const displayName = [
                          member.firstName,
                          member.lastName ? member.lastName[0] + '.' : null
                        ].filter(Boolean).join(' ') || member.email || 'Unknown';
                        const isRemoving = removingUserId === member.userId;
                        const canRemove = isOwner && member.role !== 'owner';

                        return (
                          <div key={member.userId} className="space-people-list__row">
                            {/* Accent bar with initials — matches renderCompactThreadItem pattern */}
                            <div style={{
                              position: 'absolute',
                              top: 0, bottom: 0, left: 0,
                              width: '2.75rem',
                              borderTopLeftRadius: '0.75rem',
                              borderBottomLeftRadius: '0.75rem',
                              overflow: 'hidden',
                              backgroundColor: `var(--color-${member.userColor || 'paper'})`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '16px',
                              fontWeight: 700,
                              color: 'var(--color-deep-grey)',
                              flexShrink: 0
                            }}>
                              {initials}
                            </div>
                            <span className="space-people-list__name" style={{ paddingLeft: '3.5rem' }}>{displayName}</span>
                            {member.role === 'owner' && (
                              <span className="space-people-list__owner-badge">Creator</span>
                            )}
                            {canRemove && (
                              <ActionButton
                                variant="Remove"
                                onClick={() => handleRemoveMember(member.userId, displayName)}
                                disabled={isRemoving}
                                className="space-people-list__remove w-8 h-8"
                                aria-label={`Remove ${displayName}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button */}
          <SquareButton
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
        </div>
      </div>

      <style>{`
        .space-people-list__header {
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--color-stone-grey);
          text-align: center;
          padding: 0.5rem 0 0.75rem;
        }

        .space-people-list__rows {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .space-people-list__row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0 0.75rem 0 0;
          border-radius: 0.75rem;
          background: white;
          height: 48px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .space-people-list__name {
          font-family: var(--font-sans);
          font-size: 16px;
          font-weight: 700;
          color: var(--color-deep-grey);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .space-people-list__owner-badge {
          flex-shrink: 0;
          background: rgba(120, 118, 111, 0.1);
          border-radius: 1.5rem;
          padding: 0.25rem 0.625rem;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 600;
          color: var(--color-deep-grey);
          line-height: 1;
        }

        .space-people-list__remove {
          flex-shrink: 0;
          margin-left: auto;
        }

        /* Billing limit upgrade link - same hover/active as condensed items */
        .billing-limit-link {
          transition: transform 200ms ease;
        }
        .billing-limit-link:hover {
          transform: scale(1.002);
        }
        .billing-limit-link:active {
          transform: scale(0.99);
        }
      `}</style>

      <ConfirmDialog
        isOpen={showMakePrivateDialog}
        title="Make this space private?"
        message={`This space has ${memberCount - 1} ${memberCount - 1 === 1 ? 'person' : 'people'} in it. Making it private means they'll lose access to this space.`}
        confirmLabel="Make Private"
        cancelLabel="Keep Shared"
        confirmDestructive={true}
        onConfirm={async () => {
          setShowMakePrivateDialog(false);
          setFormData(prev => ({ ...prev, selectedType: 'Private' }));
          await saveTypeChange('Private');
        }}
        onCancel={() => setShowMakePrivateDialog(false)}
      />
      {pendingRemoveMember && (
        <ConfirmDialog
          isOpen={true}
          title={pendingRemoveMember.isSelf ? 'Leave This Space?' : `Remove ${pendingRemoveMember.memberName}?`}
          message={
            pendingRemoveMember.isSelf
              ? `Are you sure you want to leave "${formData.title}"?`
              : `${pendingRemoveMember.memberName} will be removed from "${formData.title}" and will no longer have access to this space.`
          }
          confirmLabel={pendingRemoveMember.isSelf ? 'Leave Space' : 'Remove'}
          cancelLabel="Cancel"
          confirmDestructive={true}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => setPendingRemoveMember(null)}
        />
      )}
    </div>
  );
}

