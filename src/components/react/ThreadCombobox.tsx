import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';

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
  onCreateThread?: (threadName: string) => void;
}

const ThreadCombobox: React.FC<ThreadComboboxProps> = ({
  selectedThread,
  onThreadSelect,
  threads,
  placeholder = "Select thread...",
  suggestedThreadIds = [],
  suggestedThreadName,
  onCreateThread,
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [editedThreadName, setEditedThreadName] = useState(suggestedThreadName || '');

  // Update editedThreadName when suggestedThreadName changes
  useEffect(() => {
    if (suggestedThreadName) {
      setEditedThreadName(suggestedThreadName);
    }
  }, [suggestedThreadName]);

  // Filter threads based on search
  const filteredThreads = threads.filter(thread =>
    thread.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Get the selected thread object
  const selectedThreadObj = threads.find(thread => thread.title === selectedThread);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full flex items-center justify-between"
        style={{ 
          backgroundImage: selectedThreadObj?.backgroundGradient || 'var(--color-gradient-gray)',
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
                  {selectedThreadObj?.noteCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border max-h-[300px] overflow-hidden flex flex-col" style={{ 
          backgroundColor: 'var(--color-snow-white)',
          borderColor: 'var(--color-fog-white)'
        }}>
          {/* Search Input */}
          <div className="p-4">
            <SearchInput
              placeholder="Search threads..."
              value={searchValue}
              onChange={setSearchValue}
            />
          </div>

          {/* Thread List */}
          <div className="flex flex-col gap-2 px-4 pb-4 max-h-[200px] overflow-y-auto">
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
            {suggestedThreadName && onCreateThread && !filteredThreads.some(t => t.title === editedThreadName || t.title === suggestedThreadName) && (
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
                    {/* Layer group icon (thread icon) - same opacity as thread icons */}
                    <div className="relative shrink-0 size-5">
                      <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 576 512">
                        <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z"/>
                      </svg>
                    </div>
                    
                    {/* Editable input - matches thread title styling */}
                    <input
                      type="text"
                      value={editedThreadName}
                      onChange={(e) => setEditedThreadName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (editedThreadName.trim()) {
                            onCreateThread(editedThreadName.trim());
                            setOpen(false);
                            setSearchValue('');
                          }
                        }
                      }}
                      className="flex-1 font-sans font-bold text-[var(--color-deep-grey)] text-[16px] bg-transparent border-none outline-none min-w-0"
                      placeholder={suggestedThreadName}
                      autoFocus
                    />
                    
                    {/* Confirm button using ActionButton */}
                    <ActionButton
                      variant="Add"
                      onClick={() => {
                        if (editedThreadName.trim()) {
                          onCreateThread(editedThreadName.trim());
                          setOpen(false);
                          setSearchValue('');
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
                      <div className="flex items-center gap-6 pl-3 pr-12 h-full">
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
                        
                        {/* Text content - only title, no subtitle or count */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* Title */}
                          <div className="font-sans font-bold text-[var(--color-deep-grey)] text-[16px] truncate">
                            {thread.title}
                          </div>
                          
                          {/* Suggestion badge */}
                          {thread.isSuggested && thread.suggestedReason && (
                            <span 
                              className="px-2 py-0.5 rounded-full text-[11px] font-sans font-medium text-[var(--color-stone-grey)] whitespace-nowrap"
                              style={{ 
                                backgroundColor: 'var(--color-light-paper)',
                              }}
                            >
                              {thread.suggestedReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                No threads found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setOpen(false);
            setSearchValue('');
          }}
        />
      )}
    </div>
  );
};

export default ThreadCombobox;
