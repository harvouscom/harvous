import React from 'react';
import NavigationColumn from './NavigationColumn';

type Space = {
  id: string;
  title: string;
  totalItemCount: number;
  backgroundGradient: string;
  isShared?: boolean;
};

type ActiveThread = {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string | null;
  /** Thread owner (space member view); used to hide add-to-space prompt for others' threads. */
  userId?: string | null;
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
  /** Desktop nav profile strip label (display name / username). */
  userDisplayName?: string;
  userColor?: string;
  pathname?: string;
  search?: string;
  /** Signed-in user id — for space-mismatch banner ownership checks. */
  viewerUserId?: string | null;
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
  return (
    <NavigationErrorBoundary>
      <NavigationColumn {...props} />
    </NavigationErrorBoundary>
  );
}

