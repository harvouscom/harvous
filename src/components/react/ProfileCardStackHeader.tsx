import { colorTokenVar } from '@/utils/space-cover';
import React, { useState, useEffect } from 'react';

interface ProfileCardStackHeaderProps {
  initialColor: string;
}

/**
 * ProfileCardStackHeader - React component that manages the profile CardStack header
 *
 * This component uses React state to manage the header color and display name,
 * ensuring updates persist across View Transitions and work reliably on both
 * desktop and mobile without timing issues.
 */
export default function ProfileCardStackHeader({
  initialColor
}: ProfileCardStackHeaderProps) {
  const [color, setColor] = useState(initialColor);

  // Sync state with props when they change (e.g., after profile query / cache hydrates)
  useEffect(() => {
    setColor(initialColor);
  }, [initialColor]);

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
        backgroundColor: colorTokenVar(color, 'blue'),
        color: 'var(--color-deep-grey)'
      }}
    >
      <div className="page-heading page-heading--center">
        <p>My Profile</p>
      </div>
    </div>
  );
}

