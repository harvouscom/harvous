import React, { useEffect } from 'react';
import SquareButton from './SquareButton';
import { shouldShowMoreButton } from '@/utils/menu-options';

interface MobileAdditionalProps {
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  currentThread?: any;
  currentSpace?: any;
}

export default function MobileAdditional({
  contentType = "dashboard",
  contentId,
  currentThread,
  currentSpace
}: MobileAdditionalProps) {
  const showMoreButton = shouldShowMoreButton(contentType, contentId);

  useEffect(() => {
    // Listen for panel events and trigger mobile drawer
    const handleOpenNewNotePanel = () => {
      console.log('MobileAdditional: openNewNotePanel received');
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'note' }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenNewThreadPanel = () => {
      console.log('MobileAdditional: openNewThreadPanel received');
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'thread' }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenNoteDetailsPanel = () => {
      window.dispatchEvent(new CustomEvent('openMobileDrawer', {
        detail: { type: 'noteDetails' }
      }));
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenProfilePanel = (event: CustomEvent) => {
      console.log('MobileAdditional: openProfilePanel received', event.detail);
      const panelName = event.detail?.panelName;
      console.log('MobileAdditional: Panel name:', panelName);

      // Only handle on mobile (screen width < 1160px)
      if (window.innerWidth < 1160) {
        console.log('MobileAdditional: On mobile, opening drawer');

        // Map panel names to drawer types
        const panelMap: Record<string, string> = {
          'editNameColor': 'editNameColor',
          'getSupport': 'getSupport',
          'emailPassword': 'emailPassword',
          'myChurch': 'myChurch',
          'mySpaces': 'mySpaces',
          'myData': 'myData'
        };

        const drawerType = panelMap[panelName];
        if (drawerType) {
          console.log('MobileAdditional: Opening drawer for:', drawerType);
          window.dispatchEvent(new CustomEvent('openMobileDrawer', {
            detail: { drawerType: drawerType }
          }));
        } else {
          console.log('MobileAdditional: Unknown panel name:', panelName);
        }
      } else {
        console.log('MobileAdditional: On desktop, letting profile page handle it');
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

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Default state: SquareButtons in horizontal layout */}
      <div className={`w-full flex ${showMoreButton ? 'justify-between' : 'justify-end'}`}>
        {showMoreButton && (
          <SquareButton variant="More" withMenu={true} contentType={contentType} contentId={contentId} />
        )}
        {contentType !== 'profile' && (
          <SquareButton variant="Add" withMenu={true} />
        )}
      </div>
    </div>
  );
}
