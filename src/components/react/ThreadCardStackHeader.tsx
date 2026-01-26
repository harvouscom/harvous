import React, { useState, useEffect } from 'react';
import { getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';

interface ThreadCardStackHeaderProps {
  initialTitle: string;
  initialColor: ThreadColor;
  threadId: string;
}

/**
 * ThreadCardStackHeader - React component that manages the thread CardStack header
 * 
 * This component uses React state to manage the header title and color,
 * ensuring updates persist across View Transitions and work reliably on both
 * desktop and mobile without timing issues.
 */
export default function ThreadCardStackHeader({
  initialTitle,
  initialColor,
  threadId
}: ThreadCardStackHeaderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    const handleThreadUpdated = (event: CustomEvent) => {
      const { threadId: eventThreadId, title: eventTitle, color: eventColor, backgroundGradient: eventBackgroundGradient } = event.detail || {};
      
      // Only update if this is the thread we're displaying
      if (eventThreadId === threadId) {
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

    window.addEventListener('threadUpdated', handleThreadUpdated as EventListener);
    
    return () => {
      window.removeEventListener('threadUpdated', handleThreadUpdated as EventListener);
    };
  }, [threadId]);

  // Determine background style - use gradient for background-image
  const backgroundGradient = getThreadGradientCSS(color);
  const textColor = getThreadTextColorCSS(color);

  return (
    <div 
      className="card-stack__header"
      data-thread-id={threadId}
      data-thread-title={title}
      data-thread-background-gradient={backgroundGradient}
      style={{
        backgroundImage: backgroundGradient,
        backgroundColor: 'transparent',
        color: textColor
      }}
    >
      <div className="page-heading page-heading--center">
        <p>{title}</p>
      </div>
    </div>
  );
}
