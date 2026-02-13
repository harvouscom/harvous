import React, { useEffect, useState } from 'react';
import SquareButton from './SquareButton';
import { shouldShowMoreButton } from '@/utils/menu-options';

interface MobileAdditionalProps {
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  currentThread?: any;
  currentSpace?: any;
  currentThreadId?: string;
  noteType?: string;
  contentEncrypted?: boolean;
  noteSimpleId?: number | null;
  spaceRole?: 'owner' | 'member' | null;
  contentOwnerId?: string;
  userId?: string;
}

export default function MobileAdditional({
  contentType = "dashboard",
  contentId,
  currentThread,
  currentSpace,
  currentThreadId,
  noteType,
  contentEncrypted,
  noteSimpleId,
  spaceRole,
  contentOwnerId,
  userId
}: MobileAdditionalProps) {
  const showMoreButton = shouldShowMoreButton(contentType, contentId, contentOwnerId, userId);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(detail?.editing === true);
    };
    window.addEventListener('contentEditModeChange', handleEditModeChange);
    return () => window.removeEventListener('contentEditModeChange', handleEditModeChange);
  }, []);

  useEffect(() => {
    // Listen for panel events and trigger mobile drawer
    const handleOpenNewNotePanel = () => {
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'note' }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenNewThreadPanel = () => {
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'thread' }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenNoteDetailsPanel = (event: CustomEvent) => {
      const tab = event?.detail?.tab;
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'noteDetails', tab }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenProfilePanel = (event: CustomEvent) => {
      const panelName = event.detail?.panelName;

      // Only handle on mobile (screen width < 1160px)
      if (window.innerWidth < 1160) {
        // Map panel names to drawer types
        const panelMap: Record<string, string> = {
          'editNameColor': 'editNameColor',
          'getSupport': 'getSupport',
          'aboutHarvous': 'aboutHarvous',
          'emailPassword': 'emailPassword',
          'myChurch': 'myChurch',
          'mySpaces': 'mySpaces',
          'myData': 'myData',
          'referral': 'referral'
        };

        const drawerType = panelMap[panelName];
        if (drawerType) {
          window.dispatchEvent(new CustomEvent('openMobileDrawer', {
            detail: { drawerType: drawerType }
          }));
        }
      }
    };

    window.addEventListener('openNewNotePanel' as any, handleOpenNewNotePanel);
    window.addEventListener('openNewThreadPanel' as any, handleOpenNewThreadPanel);
    window.addEventListener('openNoteDetailsPanel' as any, handleOpenNoteDetailsPanel);
    window.addEventListener('openProfilePanel' as any, handleOpenProfilePanel);

    return () => {
      window.removeEventListener('openNewNotePanel' as any, handleOpenNewNotePanel);
      window.removeEventListener('openNewThreadPanel' as any, handleOpenNewThreadPanel);
      window.removeEventListener('openNoteDetailsPanel' as any, handleOpenNoteDetailsPanel);
      window.removeEventListener('openProfilePanel' as any, handleOpenProfilePanel);
    };
  }, []);

  if (isEditMode) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Default state: SquareButtons in horizontal layout */}
      <div className={`w-full flex ${showMoreButton ? 'justify-between' : 'justify-end'}`}>
        {showMoreButton && (
          <SquareButton variant="More" withMenu={true} contentType={contentType} contentId={contentId} currentThreadId={currentThreadId} noteType={noteType} contentEncrypted={contentEncrypted} noteSimpleId={noteSimpleId} spaceRole={spaceRole} contentOwnerId={contentOwnerId} userId={userId} />
        )}
        {contentType !== 'profile' && (
          <SquareButton variant="Add" withMenu={true} />
        )}
      </div>
    </div>
  );
}
