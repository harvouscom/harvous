import React, { useState, useEffect } from 'react';
import SearchInput from './SearchInput';
// Removed Check and ChevronsUpDown imports - using clean design without arrow icons

interface Thread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  color?: string;
  isPublic?: boolean;
}

interface ThreadComboboxProps {
  selectedThread: string;
  onThreadSelect: (thread: string) => void;
  threads: Thread[];
  placeholder?: string;
}

const ThreadCombobox: React.FC<ThreadComboboxProps> = ({
  selectedThread,
  onThreadSelect,
  threads,
  placeholder = "Select thread..."
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

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
        style={{ backgroundImage: selectedThreadObj?.backgroundGradient || 'var(--color-gradient-gray)' }}
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
          backgroundColor: 'var(--color-white)',
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
                        backgroundColor: 'var(--color-fog-white)',
                        boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)'
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
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          {/* Title */}
                          <div className="font-sans font-bold text-[var(--color-deep-grey)] text-[16px] truncate">
                            {thread.title}
                          </div>
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
