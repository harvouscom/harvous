import React from 'react';
import { NavigationProvider } from './NavigationContext';
import MobileNavigation from './MobileNavigation';

interface Space {
  id: string;
  title: string;
  totalItemCount: number;
  backgroundGradient: string;
}

interface Thread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string;
}

interface MobileNavigationWrapperProps {
  spaces?: Space[];
  threads?: Thread[];
  inboxCount?: number;
  currentSpace?: Space | null;
  currentThread?: Thread | null;
  initials?: string;
  userColor?: string;
}

const MobileNavigationWrapper: React.FC<MobileNavigationWrapperProps> = (props) => {
  return (
    <NavigationProvider>
      <MobileNavigation {...props} />
    </NavigationProvider>
  );
};

export default MobileNavigationWrapper;

