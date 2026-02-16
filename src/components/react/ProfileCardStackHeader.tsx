import React, { useState, useEffect } from 'react';

interface ProfileCardStackHeaderProps {
  initialColor: string;
}

/**
 * ProfileCardStackHeader - React component that manages the profile CardStack header
 *
 * Shows "My Profile" as the header title. Uses React state for color so updates
 * (e.g. from Edit Name & Color) persist across View Transitions.
 */
export default function ProfileCardStackHeader({
  initialColor
}: ProfileCardStackHeaderProps) {
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const { selectedColor } = event.detail;
      if (selectedColor) {
        setColor(selectedColor);
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
      <div className="page-heading page-heading--center">
        <p>My Profile</p>
      </div>
    </div>
  );
}

