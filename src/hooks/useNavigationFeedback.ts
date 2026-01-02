import React, { useState, useCallback } from 'react';

/**
 * Hook for optimistic navigation feedback
 * Shows loading state immediately on click for better perceived performance
 */
export function useNavigationFeedback() {
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const handleNavigationClick = useCallback((path: string, onClick?: (e: React.MouseEvent) => void) => {
    return (e: React.MouseEvent) => {
      // Show loading state immediately
      setNavigatingTo(path);
      
      // Call original onClick if provided
      if (onClick) {
        onClick(e);
      }
      
      // Clear loading state after navigation completes
      // View Transitions will handle the actual navigation
      // We clear the state after a short delay to ensure smooth transition
      setTimeout(() => {
        setNavigatingTo(null);
      }, 100);
    };
  }, []);

  return {
    navigatingTo,
    handleNavigationClick,
    isNavigating: (path: string) => navigatingTo === path,
  };
}

