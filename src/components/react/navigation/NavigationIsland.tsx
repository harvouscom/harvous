import React from 'react';
import NavigationColumn from './NavigationColumn';
import { NavigationProvider } from './NavigationContext';

type Space = {
  id: string;
  title: string;
  totalItemCount: number;
  backgroundGradient: string;
};

type ActiveThread = {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string | null;
} | null;

type CurrentSpace = { id: string } | null;

export interface NavigationIslandProps {
  inboxCount?: number;
  spaces?: Space[];
  activeThread?: ActiveThread;
  currentSpace?: CurrentSpace;
  isNote?: boolean;
  currentId?: string;
  showProfile?: boolean;
  initials?: string;
  userColor?: string;
  pathname?: string;
  search?: string;
}

class NavigationErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  state: { hasError: boolean; message?: string } = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[NavigationIsland] Hydration/render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export default function NavigationIsland(props: NavigationIslandProps) {
  // Debug: Log that NavigationIsland is rendering
  if (typeof window !== 'undefined') {
    console.warn('[NavigationIsland] Component rendering with props:', {
      initials: props.initials,
      userColor: props.userColor,
      pathname: props.pathname
    });
  }
  
  return (
    <NavigationErrorBoundary>
      <NavigationProvider>
        <NavigationColumn {...props} />
      </NavigationProvider>
    </NavigationErrorBoundary>
  );
}

