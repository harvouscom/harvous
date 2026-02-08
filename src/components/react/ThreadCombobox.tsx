import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';
import Icon from './Icon';
import { formatBadgeCount } from '@/utils/badge-count';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';

interface Thread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  color?: string | null;
  isPublic?: boolean;
  isSuggested?: boolean;
  suggestedReason?: string;
}

interface ThreadComboboxProps {
  selectedThread: string;
  onThreadSelect: (thread: string) => void;
  threads: Thread[];
  placeholder?: string;
  suggestedThreadIds?: string[];
  suggestedThreadName?: string | null;
  onCreateThread?: (threadName: string, color?: ThreadColor | string) => void;
  onSuggestedThreadNameChange?: (threadName: string) => void;
  /** When true, hide the trigger button and render only the dropdown (controlled by parent). */
  triggerless?: boolean;
  /** Controlled open state when triggerless. */
  isOpen?: boolean;
  /** Called when dropdown should close (triggerless). */
  onClose?: () => void;
  /** Anchor rect for dropdown positioning when triggerless. */
  anchorRect?: DOMRect | null;
  /** When set, dropdown top aligns with this viewport Y (e.g. card content top) instead of below anchor. */
  alignTopWith?: number | null;
  /** When set (e.g. card-stack__content ref), dropdown is portaled into this element and positioned absolute at top for correct alignment on mobile. */
  dropdownPortalTargetRef?: React.RefObject<HTMLElement | null>;
}

const ThreadCombobox: React.FC<ThreadComboboxProps> = ({
  selectedThread,
  onThreadSelect,
  threads,
  placeholder = "Select thread...",
  suggestedThreadIds = [],
  suggestedThreadName,
  onCreateThread,
  onSuggestedThreadNameChange,
  triggerless = false,
  isOpen: externalIsOpen = false,
  onClose: externalOnClose,
  anchorRect: externalAnchorRect = null,
  alignTopWith: externalAlignTopWith = null,
  dropdownPortalTargetRef = undefined,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [renderDropdownInline, setRenderDropdownInline] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const createThreadInputRef = useRef<HTMLInputElement>(null);
  const createThreadAccentBarRef = useRef<HTMLButtonElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [createThreadColor, setCreateThreadColor] = useState<ThreadColor>('paper');
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);

  useEffect(() => {
    const isTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
    setRenderDropdownInline(!!(isTouch || isNarrow));
  }, []);

  const open = triggerless ? externalIsOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!value) setColorDropdownOpen(false);
    if (!triggerless) setInternalOpen(value);
    if (triggerless && !value && externalOnClose) externalOnClose();
  };
  const [searchValue, setSearchValue] = useState('');
  const [editedThreadName, setEditedThreadName] = useState(suggestedThreadName || '');
  const [createThreadName, setCreateThreadName] = useState('');

  // Update editedThreadName when suggestedThreadName changes
  useEffect(() => {
    if (suggestedThreadName) {
      setEditedThreadName(suggestedThreadName);
    }
  }, [suggestedThreadName]);

  // Update createThreadName when searchValue changes (for create from search feature)
  // Initialize with searchValue if it exists, otherwise keep current value or empty
  useEffect(() => {
    if (searchValue.trim().length > 0) {
      setCreateThreadName(searchValue);
    } else if (!createThreadName) {
      // Only clear if createThreadName is empty - preserve user edits
      setCreateThreadName('');
    }
  }, [searchValue]);

  // Close color dropdown on outside click (bar and color panel are "inside")
  useEffect(() => {
    if (!colorDropdownOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        createThreadAccentBarRef.current?.contains(target) ||
        colorDropdownRef.current?.contains(target)
      ) return;
      setColorDropdownOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [colorDropdownOpen]);

  // Filter threads based on search
  const filteredThreads = threads.filter(thread =>
    thread.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Determine if suggested thread option is showing
  const isSuggestedThreadShowing = suggestedThreadName && onCreateThread && !filteredThreads.some(t => {
    const threadTitle = t.title.trim().toLowerCase();
    const editedName = editedThreadName.trim().toLowerCase();
    const suggestedName = suggestedThreadName.trim().toLowerCase();
    return threadTitle === editedName || threadTitle === suggestedName;
  });

  // Determine if we should show the create thread option
  // Show when: onCreateThread exists and no suggested thread option is showing
  // The create option should always be visible (not just when searching)
  const shouldShowCreateFromSearch = onCreateThread && !isSuggestedThreadShowing;

  // Check if content is overflowing
  useEffect(() => {
    if (!open || !scrollContainerRef.current) return;
    
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        const hasOverflow = scrollContainerRef.current.scrollHeight > scrollContainerRef.current.clientHeight;
        setIsOverflowing(hasOverflow);
      }
    };
    
    // Check immediately
    checkOverflow();
    
    // Check again after a short delay to ensure content is rendered
    const timer = setTimeout(checkOverflow, 50);
    
    return () => clearTimeout(timer);
  }, [open, filteredThreads.length, isSuggestedThreadShowing, shouldShowCreateFromSearch]);

  // Track scroll position to show/hide top gradient
  useEffect(() => {
    if (!open || !scrollContainerRef.current) return;
    
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop;
        setHasScrolledDown(scrollTop > 0);
      }
    };
    
    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll);
    
    // Reset scroll state when opening
    setHasScrolledDown(false);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [open]);

  // Get the selected thread object
  const selectedThreadObj = threads.find(thread => thread.title === selectedThread);
  
  // Determine if this is a suggested new thread (not in the list)
  const isSuggestedNewThread = !selectedThreadObj && suggestedThreadName && selectedThread === suggestedThreadName;
  
  // Determine background gradient for the button
  // Priority: 1) thread's backgroundGradient, 2) paper gradient if color is 'paper', 3) paper gradient for suggested new thread, 4) default gray
  const getButtonBackground = () => {
    if (selectedThreadObj?.backgroundGradient) {
      return selectedThreadObj.backgroundGradient;
    }
    // If thread has color 'paper' or is null/undefined, use paper gradient
    if (selectedThreadObj?.color === 'paper' || selectedThreadObj?.color === null || selectedThreadObj?.color === undefined) {
      return 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)';
    }
    // For suggested new thread, use paper gradient
    if (isSuggestedNewThread) {
      return 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)';
    }
    // Default fallback
    return 'var(--color-gradient-gray)';
  };

  // When triggerless, close on Escape and click outside
  useEffect(() => {
    if (!triggerless || !open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        externalOnClose?.();
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const el = target as unknown as HTMLElement;
      if (el?.closest?.('.thread-picker-header')) return;
      if (dropdownRef.current?.contains(target)) return;
      externalOnClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [triggerless, open, externalOnClose]);

  // Handle create thread name keydown for auto-capitalize
  const handleCreateThreadNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Enter key (existing behavior)
    if (e.key === 'Enter') {
      e.preventDefault();
      if (createThreadName.trim()) {
        onCreateThread?.(createThreadName.trim(), createThreadColor);
        setOpen(false);
        setSearchValue('');
        setCreateThreadName('');
        setCreateThreadColor('paper');
        setColorDropdownOpen(false);
      }
      return;
    }
    
    // Auto-capitalize first letter
    const input = e.currentTarget;
    if (input.selectionStart === 0 && input.selectionEnd === 0) {
      // Cursor is at the start
      if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
        e.preventDefault();
        const capitalized = e.key.toUpperCase();
        if (createThreadName.length === 0) {
          setCreateThreadName(capitalized);
          setSearchValue(capitalized);
        } else {
          const newValue = capitalized + createThreadName;
          setCreateThreadName(newValue);
          setSearchValue(newValue);
        }
        // Set cursor position after the capitalized letter
        setTimeout(() => {
          input.setSelectionRange(1, 1);
        }, 0);
      }
    }
  };

  const usePortalTarget =
    open &&
    triggerless &&
    renderDropdownInline &&
    typeof dropdownPortalTargetRef?.current !== 'undefined' &&
    dropdownPortalTargetRef?.current !== null;

  const dropdownContent = open ? (
    <div
      ref={dropdownRef}
      className="border max-h-[300px] overflow-hidden flex flex-col"
      style={{
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        borderBottomLeftRadius: '24px',
        borderBottomRightRadius: '24px',
        ...(usePortalTarget
          ? {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              right: 0,
              width: '100%',
              zIndex: 1000000,
              touchAction: 'manipulation',
              pointerEvents: 'auto'
            }
          : triggerless && externalAnchorRect
            ? {
                position: 'fixed' as const,
                top:
                  externalAlignTopWith != null
                    ? Math.max(8, Math.min(externalAlignTopWith, typeof window !== 'undefined' ? window.innerHeight - 16 : 9999))
                    : Math.min(externalAnchorRect.bottom - 24, typeof window !== 'undefined' ? window.innerHeight - 16 : 9999),
                left: Math.max(0, Math.min(externalAnchorRect.left, typeof window !== 'undefined' ? window.innerWidth - Math.max(260, externalAnchorRect.width) - 16 : externalAnchorRect.left)),
                width: Math.max(260, externalAnchorRect.width),
                zIndex: 1000000,
                touchAction: 'manipulation',
                pointerEvents: 'auto'
              }
            : { position: 'absolute' as const, top: '100%', left: 0, right: 0, marginTop: 8, zIndex: 50 }),
        backgroundColor: 'var(--color-snow-white)',
        borderColor: 'var(--color-fog-white)'
      }}
    >
          {/* Search Input - tap-to-focus wrapper for mobile */}
          <div
            className="p-3"
            style={{ touchAction: 'manipulation', minHeight: 44, cursor: 'text' }}
            onClick={(e) => {
              const input = (e.currentTarget as HTMLElement).querySelector('input');
              if (input instanceof HTMLInputElement) input.focus();
            }}
            onTouchEnd={(e) => {
              const input = (e.currentTarget as HTMLElement).querySelector('input');
              if (input instanceof HTMLInputElement) {
                e.preventDefault();
                input.focus();
              }
            }}
            role="button"
            tabIndex={-1}
            aria-label="Focus search"
          >
            <SearchInput
              placeholder="Search threads..."
              value={searchValue}
              onChange={setSearchValue}
              inputStyle={{ touchAction: 'manipulation', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
          </div>

          {/* Thread List */}
          <div className="relative">
            {/* Gradient overlay at top - only show when overflowing and scrolled down; shorter so it doesn't cover content */}
            {isOverflowing && hasScrolledDown && (
              <div 
                className="absolute top-0 left-0 right-0 h-3 pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(to top, transparent, var(--color-snow-white))'
                }}
              />
            )}
            <div
              ref={scrollContainerRef}
              className="flex flex-col gap-2 px-3 pb-3 max-h-[200px] overflow-y-auto rounded-b-[24px]"
              style={{ touchAction: 'pan-y' }}
            >
              <style>{`
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                    transform: translateY(4px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `}</style>
            
            {/* Create Thread Suggestion - show if suggestedThreadName exists and no matching thread found */}
            {isSuggestedThreadShowing && (
              <div
                className="relative group"
                style={{
                  animation: 'fadeIn 0.3s ease-out forwards',
                  opacity: 0
                }}
              >
                <div
                  className="relative rounded-xl h-[48px] w-full overflow-hidden"
                  style={{
                    backgroundColor: 'white',
                    boxShadow: 'none'
                  }}
                >
                  {/* Accent bar on left - matches thread rows */}
                  <div 
                    className="absolute inset-y-0 left-0 w-11 rounded-l-xl" 
                    style={{ backgroundColor: 'var(--color-paper)' }}
                  />
                  
                  {/* Content - matches thread row styling */}
                  <div className="flex items-center gap-6 pl-3 pr-3 h-full">
                    {/* Wand magic sparkles icon for suggested thread */}
                    <div className="relative shrink-0 size-5">
                      <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 576 512">
                        <path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/>
                      </svg>
                    </div>
                    
                    {/* Editable input with suggested badge - matches thread title styling */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        value={editedThreadName}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setEditedThreadName(newValue);
                          // Sync the edited name back to parent component
                          if (onSuggestedThreadNameChange) {
                            onSuggestedThreadNameChange(newValue);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (editedThreadName.trim()) {
                              onCreateThread(editedThreadName.trim(), createThreadColor);
                              setOpen(false);
                              setSearchValue('');
                              setCreateThreadColor('paper');
                              setColorDropdownOpen(false);
                            }
                          }
                        }}
                        className="flex-1 font-sans font-bold text-[var(--color-deep-grey)] text-[16px] bg-transparent border-none outline-none min-w-0"
                        placeholder={suggestedThreadName}
                        autoFocus
                      />
                      
                      {/* Suggested badge */}
                      <span 
                        className="px-2 py-0.5 rounded-full text-[11px] font-sans font-medium text-[var(--color-stone-grey)] whitespace-nowrap"
                        style={{ 
                          backgroundColor: 'var(--color-light-paper)',
                        }}
                      >
                        Suggested
                      </span>
                    </div>
                    
                    {/* Confirm button using ActionButton */}
                    <ActionButton
                      variant="Add"
                      onClick={() => {
                        if (editedThreadName.trim()) {
                          onCreateThread(editedThreadName.trim(), createThreadColor);
                          setOpen(false);
                          setSearchValue('');
                          setCreateThreadColor('paper');
                          setColorDropdownOpen(false);
                        }
                      }}
                      disabled={!editedThreadName.trim()}
                      style={{
                        opacity: editedThreadName.trim() ? 1 : 0.5,
                        cursor: editedThreadName.trim() ? 'pointer' : 'not-allowed'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {filteredThreads.length > 0 ? (
              filteredThreads.map((thread) => {
                // Get thread color - Unorganized should use paper, otherwise use color property or default to purple
                const isUnorganized = thread.id === 'thread_unorganized' || thread.title === 'Unorganized';
                const threadAccentColor = isUnorganized 
                  ? "var(--color-paper)" 
                  : (thread.color ? `var(--color-${thread.color})` : "var(--color-purple)");
                
                // Check if this thread matches the suggested thread name (case-insensitive, trimmed)
                const matchesSuggestedName = suggestedThreadName && 
                  thread.title.trim().toLowerCase() === suggestedThreadName.trim().toLowerCase();
                const isSuggested = thread.isSuggested || matchesSuggestedName;
                
                return (
                  <div
                    key={thread.id}
                    className="relative group"
                    style={{
                      animation: 'fadeIn 0.3s ease-out forwards',
                      opacity: 0
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onThreadSelect(thread.title);
                        setOpen(false);
                        setSearchValue('');
                      }}
                      className="relative rounded-xl h-[48px] cursor-pointer transition-transform duration-200 w-full text-left overflow-hidden hover:scale-[1.002]"
                      style={{
                        backgroundColor: 'white',
                        boxShadow: 'none'
                      }}
                    >
                      {/* Accent bar on left - wider like AddToSection so icon sits on it */}
                      <div 
                        className="absolute inset-y-0 left-0 w-11 rounded-l-xl" 
                        style={{ backgroundColor: threadAccentColor }}
                      />
                      
                      {/* Content */}
                      <div 
                        className="flex items-center gap-6 pl-3 pr-12 h-full"
                        style={{ backgroundColor: 'white' }}
                      >
                        {/* User icon (Private) or User group icon (Shared) - positioned on colored background */}
                        <div className="relative shrink-0 size-5">
                          {thread.isPublic === true ? (
                            // User group icon for Shared
                            <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 640 640">
                              <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
                            </svg>
                          ) : (
                            // Single user icon for Private
                            <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          )}
                        </div>
                        
                        {/* Text content - title, suggestion badge, and count badge */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* Title */}
                          <div className="font-sans font-bold text-[var(--color-deep-grey)] text-[16px] truncate">
                            {thread.title}
                          </div>
                          
                          {/* Suggestion badge - show if thread is suggested OR matches suggestedThreadName */}
                          {isSuggested && (
                            <span 
                              className="px-2 py-0.5 rounded-full text-[11px] font-sans font-medium text-[var(--color-stone-grey)] whitespace-nowrap"
                              style={{ 
                                backgroundColor: 'var(--color-light-paper)',
                              }}
                            >
                              {thread.suggestedReason || 'Suggested'}
                            </span>
                          )}
                          
                          {/* Thread note count badge */}
                          {thread.noteCount != null && thread.noteCount > 0 && (
                            <div className="badge-count" style={{ flexShrink: 0 }}>
                              <span className="badge-number">
                                {formatBadgeCount(thread.noteCount)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              // Only show "No threads found" if we're not showing create option and search has value
              !shouldShowCreateFromSearch && searchValue.trim().length > 0 && (
                <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                  No threads found
                </div>
              )
            )}
            
            {/* Create Thread option - always visible at bottom when onCreateThread is available */}
            {shouldShowCreateFromSearch && (
              <div
                className="relative group"
                style={{
                  animation: 'fadeIn 0.3s ease-out forwards',
                  opacity: 0
                }}
              >
                <div
                  className="relative rounded-xl h-[48px] w-full overflow-hidden"
                  style={{
                    backgroundColor: 'white',
                    boxShadow: 'none'
                  }}
                >
                  {/* Accent bar on left - z-10 so above content div (white) and visible; button (z-20) sits on top */}
                  <div
                    className="absolute inset-y-0 left-0 z-10 w-11 rounded-l-xl"
                    style={{ backgroundColor: getThreadColorCSS(createThreadColor) }}
                    aria-hidden
                  />
                  {/* Color picker - full bar is tappable (absolute over bar); z-20 so above content on mobile */}
                  <button
                    ref={createThreadAccentBarRef}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setColorDropdownOpen((prev) => !prev);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setColorDropdownOpen((prev) => !prev);
                    }}
                    className="absolute inset-y-0 left-0 z-20 flex w-11 items-center justify-center rounded-l-xl border-0 bg-transparent cursor-pointer no-underline shadow-none [appearance:none]"
                    style={{
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: 'none'
                    }}
                    aria-label="Choose thread color"
                  >
                    <Icon
                      name="layer-group"
                      size={20}
                      className="thread-combobox-create-row-icon block max-w-none size-full pointer-events-none"
                    />
                  </button>
                  {/* Content - relative z-0 so color button (z-20) is on top; spacer keeps text aligned */}
                  <div
                    className="relative z-0 flex items-center gap-6 pl-3 pr-3 h-full"
                    style={{ backgroundColor: 'white' }}
                  >
                    <div className="shrink-0 size-5" aria-hidden />
                    {/* Editable input - same flex-1 min-w-0 as thread title */}
                    <div
                      className="flex min-w-0 flex-1 items-center gap-2"
                      style={{ minHeight: 44, cursor: 'text' }}
                      onClick={() => createThreadInputRef.current?.focus()}
                      onTouchEnd={(e) => {
                        if (createThreadInputRef.current) {
                          e.preventDefault();
                          createThreadInputRef.current.focus();
                        }
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label="Focus thread name"
                    >
                      <input
                        ref={createThreadInputRef}
                        type="text"
                        value={createThreadName}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setCreateThreadName(newValue);
                          setSearchValue(newValue);
                        }}
                        onKeyDown={handleCreateThreadNameKeyDown}
                        className="flex-1 font-sans font-bold text-[var(--color-deep-grey)] text-[16px] bg-transparent border-none outline-none min-w-0"
                        placeholder="New thread..."
                        style={{ touchAction: 'manipulation', WebkitUserSelect: 'text', userSelect: 'text' }}
                      />
                    </div>
                    
                    {/* Confirm button using ActionButton */}
                    <ActionButton
                      variant="Add"
                      onClick={() => {
                        if (createThreadName.trim()) {
                          onCreateThread(createThreadName.trim(), createThreadColor);
                          setOpen(false);
                          setSearchValue('');
                          setCreateThreadName('');
                          setCreateThreadColor('paper');
                          setColorDropdownOpen(false);
                        }
                      }}
                      disabled={!createThreadName.trim()}
                      style={{
                        opacity: createThreadName.trim() ? 1 : 0.5,
                        cursor: createThreadName.trim() ? 'pointer' : 'not-allowed'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Color picker inline - same width as rows, below Create Thread row when open */}
            {colorDropdownOpen && shouldShowCreateFromSearch && (
              <div
                ref={colorDropdownRef}
                className="color-selection rounded-xl"
                role="menu"
                aria-label="Thread color"
                style={{
                  backgroundColor: 'var(--color-snow-white)',
                  border: '1px solid var(--color-fog-white)',
                  paddingTop: 4,
                  paddingBottom: 4,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {THREAD_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateThreadColor(color);
                      setColorDropdownOpen(false);
                    }}
                    className={`color-swatch shrink-0 flex-none min-w-[2.5rem] ${createThreadColor === color ? 'color-swatch--selected' : ''}`}
                    style={{ backgroundColor: getThreadColorCSS(color) }}
                  >
                    {createThreadColor === color && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon
                          name="check"
                          size={20}
                          style={{ color: getThreadTextColorCSS(color) }}
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            </div>
            {/* Gradient overlay at bottom - only show when overflowing; shorter so it doesn't cover Create row / color picker */}
            {isOverflowing && (
              <div 
                className="absolute bottom-0 left-0 right-0 h-3 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, transparent, var(--color-snow-white))'
                }}
              />
            )}
          </div>
        </div>
  ) : null;

  return (
    <div className="relative">
      {/* Trigger Button - only when not triggerless */}
      {!triggerless && (
        <button
          type="button"
          onClick={() => setInternalOpen(!internalOpen)}
          className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full flex items-center justify-between"
          style={{
            backgroundImage: getButtonBackground(),
            boxShadow: 'none'
          }}
        >
          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
            <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
              {selectedThread}
            </span>
            <div className="flex items-center gap-2">
              <div className="p-[20px]">
                <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                  <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                    {formatBadgeCount(selectedThreadObj?.noteCount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Dropdown - portal into card content on mobile for correct top alignment; else portal to body or inline. */}
      {open &&
        (usePortalTarget && dropdownPortalTargetRef?.current
          ? createPortal(dropdownContent, dropdownPortalTargetRef.current)
          : triggerless && typeof document !== 'undefined' && !renderDropdownInline
            ? createPortal(dropdownContent, document.body)
            : dropdownContent)}

      {/* Backdrop - only when not triggerless (triggerless uses global click handler) */}
      {!triggerless && open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setInternalOpen(false);
            setSearchValue('');
          }}
        />
      )}
    </div>
  );
};

export default ThreadCombobox;
