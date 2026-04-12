import React, { useState, useEffect } from 'react';
import { getThreadColorCSS, getThreadTextColorCSS } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  [key: string]: any;
}

interface Thread {
  id: string;
  title: string;
  color?: string;
  spaceId: string | null;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  [key: string]: any;
}

interface AddToSpacePanelProps {
  spaceId: string;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function AddToSpacePanel({
  spaceId,
  onClose,
  inBottomSheet = false,
}: AddToSpacePanelProps) {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [currentSpaceNotes, setCurrentSpaceNotes] = useState<Note[]>([]);
  const [currentSpaceThreads, setCurrentSpaceThreads] = useState<Thread[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingCurrentItems, setIsLoadingCurrentItems] = useState(true);
  const [isAddingItems, setIsAddingItems] = useState(false);

  const fetchAllItems = async () => {
    setIsLoadingItems(true);
    try {
      const response = await fetch('/api/spaces/items', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setAllNotes(data.notes || []);
        setAllThreads(data.threads || []);
      } else {
        setAllNotes([]);
        setAllThreads([]);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setAllNotes([]);
      setAllThreads([]);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const fetchCurrentSpaceItems = async () => {
    setIsLoadingCurrentItems(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/items`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentSpaceNotes(data.notes || []);
        setCurrentSpaceThreads(data.threads || []);
      } else {
        setCurrentSpaceNotes([]);
        setCurrentSpaceThreads([]);
      }
    } catch (error) {
      console.error('Error fetching current space items:', error);
      setCurrentSpaceNotes([]);
      setCurrentSpaceThreads([]);
    } finally {
      setIsLoadingCurrentItems(false);
    }
  };

  useEffect(() => {
    fetchAllItems();
  }, []);

  useEffect(() => {
    if (spaceId) {
      fetchCurrentSpaceItems();
    }
  }, [spaceId]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeAddToSpacePanel'));
    }
  };

  const handleNewNote = () => {
    handleClose();
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    });
  };

  const handleItemSelect = async (itemId: string, itemType: 'note' | 'thread') => {
    setIsAddingItems(true);
    try {
      const noteIds = itemType === 'note' ? [itemId] : [];
      const threadIds = itemType === 'thread' ? [itemId] : [];
      const response = await fetch(`/api/spaces/${spaceId}/add-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds, threadIds }),
        credentials: 'include',
      });

      if (response.ok) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: itemType === 'note' ? 'Note added to space' : 'Thread added to space',
              type: 'success',
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent('itemAddedToSpace', {
            detail: { spaceId, itemId, itemType },
          })
        );
        await Promise.all([fetchCurrentSpaceItems(), fetchAllItems()]);
      } else {
        const error = await response.json();
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: error.error || `Failed to add ${itemType} to space`,
              type: 'error',
            },
          })
        );
      }
    } catch (error) {
      console.error('Error adding item to space:', error);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `Error adding ${itemType} to space. Please try again.`,
            type: 'error',
          },
        })
      );
    } finally {
      setIsAddingItems(false);
    }
  };

  const isPanelLoading = isLoadingItems || isLoadingCurrentItems;

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="form-layout">
        <div className="form-layout--expand" style={{ position: 'relative' }}>
          <div
            className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isPanelLoading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div
              className="panel__header"
              style={{
                backgroundColor: getThreadColorCSS('paper'),
                color: getThreadTextColorCSS('paper'),
              }}
            >
              <div className="panel__title">
                <p>Add to Space</p>
              </div>
            </div>
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <div className="panel__content-scroll">
                {isLoadingItems ? (
                  <div className="text-center py-8 text-[var(--color-stone-grey)]">
                    Loading items...
                  </div>
                ) : (
                  <AddToSpaceSection
                    allNotes={allNotes}
                    allThreads={allThreads}
                    currentSpaceId={spaceId}
                    onItemSelect={handleItemSelect}
                    selectedItems={[]}
                    isLoading={isAddingItems}
                    placeholder="Search notes and threads"
                    emptyMessage="No items found"
                    itemsToShow="all"
                  />
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
          <button
            type="button"
            onClick={handleNewNote}
            data-outer-shadow
            className="btn-cta btn--primary flex-1 group"
          >
            <span className="btn-cta__content">New note</span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </div>
    </div>
  );
}
