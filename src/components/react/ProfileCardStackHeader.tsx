import React, { useState, useEffect } from 'react';

interface ProfileCardStackHeaderProps {
  initialColor: string;
  initialDisplayName: string;
}

/**
 * ProfileCardStackHeader - React component that manages the profile CardStack header
 * 
 * This component uses React state to manage the header color and display name,
 * ensuring updates persist across View Transitions and work reliably on both
 * desktop and mobile without timing issues.
 */
export default function ProfileCardStackHeader({
  initialColor,
  initialDisplayName
}: ProfileCardStackHeaderProps) {
  const [color, setColor] = useState(initialColor);
  const [displayName, setDisplayName] = useState(initialDisplayName);

  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const { firstName, lastName, selectedColor } = event.detail;
      if (firstName && lastName && selectedColor) {
        const newDisplayName = `${firstName} ${lastName.charAt(0)}`.trim();
        setColor(selectedColor);
        setDisplayName(newDisplayName);
        console.log(`✅ ProfileCardStackHeader: Updated to color: ${selectedColor}, displayName: ${newDisplayName}`);
      }
    };

    window.addEventListener('updateProfile', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('updateProfile', handleProfileUpdate as EventListener);
    };
  }, []);

  return (
    <div 
      className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full"
      style={{
        backgroundColor: `var(--color-${color})`,
        color: 'var(--color-deep-grey)'
      }}
    >
      <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
        <p className="leading-[normal]">{displayName}</p>
      </div>
    </div>
  );
}

