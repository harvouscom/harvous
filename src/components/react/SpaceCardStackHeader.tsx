import React, { useState, useEffect } from 'react';
import { getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';

interface SpaceCardStackHeaderProps {
  initialTitle: string;
  initialColor: ThreadColor;
  spaceId: string;
  /** Passed from slug; Leave space is in the More menu for members, not in header. */
  spaceRole?: 'owner' | 'member' | null;
  currentUserId?: string;
}

/**
 * SpaceCardStackHeader - React component that manages the space CardStack header
 * 
 * This component uses React state to manage the header title and color,
 * ensuring updates persist across View Transitions and work reliably on both
 * desktop and mobile without timing issues.
 */
export default function SpaceCardStackHeader({
  initialTitle,
  initialColor,
  spaceId
}: SpaceCardStackHeaderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState(initialColor);

  // Sync state with props when they change (e.g., after navigation or server updates)
  useEffect(() => {
    setTitle(initialTitle);
    setColor(initialColor);
  }, [initialTitle, initialColor]);

  useEffect(() => {
    const handleSpaceUpdated = (event: CustomEvent) => {
      const { spaceId: eventSpaceId, title: eventTitle, color: eventColor, backgroundGradient: eventBackgroundGradient } = event.detail || {};
      
      // Only update if this is the space we're displaying
      if (eventSpaceId === spaceId) {
        if (eventTitle !== undefined) {
          setTitle(eventTitle);
        }
        
        // Update color if provided directly, or extract from backgroundGradient
        if (eventColor !== undefined) {
          setColor(eventColor);
        } else if (eventBackgroundGradient) {
          // Extract color from gradient if color not provided
          // Gradient format: linear-gradient(180deg, var(--color-blue) 0%, var(--color-blue) 100%)
          const colorMatch = eventBackgroundGradient.match(/var\(--color-([a-z]+)\)/);
          if (colorMatch && colorMatch[1]) {
            setColor(colorMatch[1] as ThreadColor);
          }
        }
      }
    };

    window.addEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
    
    return () => {
      window.removeEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
    };
  }, [spaceId]);

  // Determine background style - use gradient for background-image
  const backgroundGradient = getThreadGradientCSS(color);
  const textColor = getThreadTextColorCSS(color);

  return (
    <div 
      className="card-stack__header"
      data-space-id={spaceId}
      data-space-title={title}
      data-space-background-gradient={backgroundGradient}
      style={{
        backgroundImage: backgroundGradient,
        backgroundColor: 'transparent',
        color: textColor
      }}
    >
      <div className="page-heading page-heading--center card-stack__header-inner">
        <p>{title}</p>
      </div>
    </div>
  );
}
