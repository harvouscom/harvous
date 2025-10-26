import React, { useState, useEffect } from 'react';
// Removed Check and ChevronsUpDown imports - using clean design without arrow icons

interface Thread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
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
        className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full flex items-center justify-between"
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
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[300px] overflow-hidden">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search threads..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Thread List */}
          <div className="max-h-[200px] overflow-y-auto">
            {filteredThreads.length > 0 ? (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    onThreadSelect(thread.title);
                    setOpen(false);
                    setSearchValue('');
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundImage: thread.backgroundGradient }}
                    />
                    <span className="text-[var(--color-deep-grey)] font-sans text-[16px] font-medium">
                      {thread.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-full w-6 h-6">
                      <span className="text-[12px] font-sans font-semibold text-[var(--color-deep-grey)]">
                        {thread.noteCount}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500 text-center">
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
