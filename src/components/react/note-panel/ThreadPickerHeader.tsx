import React, { forwardRef } from 'react';
import Icon from '@/components/react/Icon';
import { getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import { formatBadgeCount } from '@/utils/badge-count';

interface ThreadPickerHeaderProps {
  selectedThreadName: string;
  threadBackgroundGradient: string;
  threadColor: ThreadColor | string | null;
  noteCount: number;
  isOpen: boolean;
  onClick: () => void;
}

/**
 * ThreadPickerHeader - CardStack header that displays the selected thread name
 * and background gradient. Clicking opens the thread picker dropdown.
 */
const ThreadPickerHeader = forwardRef<HTMLDivElement, ThreadPickerHeaderProps>(
  function ThreadPickerHeader(
    {
      selectedThreadName,
      threadBackgroundGradient,
      threadColor,
      noteCount,
      isOpen,
      onClick
    },
    ref
  ) {
    const textColor = getThreadTextColorCSS(threadColor);

    return (
      <div
        ref={ref}
        className="card-stack__header thread-picker-header"
        data-thread-picker-header
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        aria-label="Switch thread"
        aria-expanded={isOpen}
        style={{
          backgroundImage: threadBackgroundGradient,
          backgroundColor: 'transparent',
          color: textColor
        }}
      >
        <div className="page-heading page-heading--center">
          <p>{selectedThreadName}</p>
        </div>
      </div>
    );
  }
);

export default ThreadPickerHeader;
