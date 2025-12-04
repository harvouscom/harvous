import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';

const PersistentNavigation: React.FC = () => {
  const contextValue = useNavigation();
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;
  const [renderKey, setRenderKey] = useState(0);
  
  // Force re-render when navigationHistory changes
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [navigationHistory]);

  // Listen for page changes to update current item
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    
    const handlePageLoad = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      requestAnimationFrame(() => {
        setRenderKey(prev => prev + 1);
      });
    };
    
    const handleNavigationUpdate = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        setRenderKey(prev => prev + 1);
      }, 50);
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('astro:page-load', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    };
  }, []);
  
  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';
  
  const getPersistentItems = () => {
    if (typeof window === 'undefined') return [];
    
    let persistentItems = navigationHistory.filter((item) => {
      if (item.id === 'dashboard') return false;
      return true;
    });
    
    persistentItems = persistentItems.filter((item) => {
      if (item.id === 'thread_unorganized') {
        const isClosed = localStorage.getItem('unorganized-thread-closed') === 'true';
        if (isClosed && currentActiveItemId === 'thread_unorganized') {
          localStorage.removeItem('unorganized-thread-closed');
          return true;
        }
        return !isClosed;
      }
      return true;
    });

    return persistentItems;
  };

  const persistentItems = getPersistentItems();

  if (persistentItems.length === 0) {
    return null;
  }

  return (
    <div id="persistent-navigation" key={renderKey} className="persistent-nav">
      {persistentItems.map((item) => {
        const isActive = item.id === currentActiveItemId;
        
        return (
          <div key={item.id} data-navigation-item={item.id} className="nav-item-container">
            <div className="nav-item-wrapper">
              <a href={`/${item.id}`} className="nav-link">
                <SpaceButton
                  text={item.title}
                  count={item.count || 0}
                  state="WithCount"
                  backgroundGradient={item.backgroundGradient || "var(--color-paper)"}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromNavigationHistory(item.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon"
                data-item-id={item.id}
                aria-label={`Close ${item.title || 'item'}`}
              >
                <Icon name="xmark" size="14px" style={{ color: 'var(--color-deep-grey)' }} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PersistentNavigation;
