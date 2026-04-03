import { useEffect, useRef, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { useCommandPalette } from './CommandPaletteContext';
import { useNavigation } from '../../../spa/src/hooks/queries/useNavigation';
import { useSearch } from '../../../spa/src/hooks/queries/useSearch';
import { safeNavigateSync } from '@/utils/safe-navigate';
import '@/styles/command-palette.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentItem {
  id: string;
  title: string;
  type: 'thread' | 'space' | 'note';
  path: string;
  gradient?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getNavigationHistory(): RecentItem[] {
  try {
    const raw = localStorage.getItem('harvous-navigation-history-v2');
    if (!raw) return [];
    const items = JSON.parse(raw) as Array<{ id: string; title?: string; type?: string }>;
    return items
      .filter((item) => item.id && (item.id.startsWith('thread_') || item.id.startsWith('space_') || item.id.startsWith('note_')))
      .slice(0, 6)
      .map((item) => {
        const type = item.id.startsWith('thread_') ? 'thread' : item.id.startsWith('space_') ? 'space' : 'note';
        const path = type === 'thread' ? `/thread/${item.id}` : type === 'space' ? `/space/${item.id}` : `/note/${item.id}`;
        return {
          id: item.id,
          title: item.title ?? 'Untitled',
          type,
          path,
        };
      });
  } catch {
    return [];
  }
}

function noteTypeLabel(noteType?: string | null): string {
  if (noteType === 'scripture') return 'Scripture';
  if (noteType === 'resource') return 'Resource';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const { isOpen, open, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: nav } = useNavigation();
  const { data: searchData, isFetching: isSearching } = useSearch(query);

  // Open via DOM event (from keyboard-shortcuts.ts)
  useEffect(() => {
    const handler = () => open();
    window.addEventListener('openCommandPalette', handler);
    return () => window.removeEventListener('openCommandPalette', handler);
  }, [open]);

  // Focus input when palette opens, clear query when it closes
  useEffect(() => {
    if (isOpen) {
      // Slight delay so the animation doesn't fight with focus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = useCallback((path: string) => {
    close();
    safeNavigateSync(path);
  }, [close]);

  const handleNewNote = useCallback(() => {
    close();
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
  }, [close]);

  const handleNewThread = useCallback(() => {
    close();
    window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
  }, [close]);

  const recentItems = getNavigationHistory();

  // When there's a query, show search results. Otherwise show recents + threads + actions.
  const hasQuery = query.trim().length > 0;
  const searchResults = searchData?.results ?? [];

  // Always render (for animation), control visibility via CSS class
  return (
    <div
      className={`cmd-overlay ${isOpen ? 'cmd-overlay--open' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
      aria-hidden={!isOpen}
    >
      <div className={`cmd-modal ${isOpen ? 'cmd-modal--open' : ''}`} role="dialog" aria-modal="true" aria-label="Command palette">
        <Command
          label="Command palette"
          shouldFilter={!hasQuery}
          loop
        >
          <div className="cmd-input-wrap">
            <svg className="cmd-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Command.Input
              ref={inputRef}
              placeholder="Search notes or type a command..."
              value={query}
              onValueChange={setQuery}
              className="cmd-input"
            />
            {isSearching && <span className="cmd-spinner" aria-hidden="true" />}
          </div>

          <Command.List className="cmd-list">
            <Command.Empty className="cmd-empty">
              {hasQuery ? 'No results found.' : 'No recent items.'}
            </Command.Empty>

            {/* ── Search results ── */}
            {hasQuery && searchResults.length > 0 && (
              <Command.Group heading="Notes" className="cmd-group">
                {searchResults.slice(0, 8).map((result) => (
                  <Command.Item
                    key={result.id}
                    value={result.id}
                    onSelect={() => {
                      const path = result.type === 'note'
                        ? `/note/${result.id}`
                        : `/thread/${result.id}`;
                      handleSelect(path);
                    }}
                    className="cmd-item"
                  >
                    <span className="cmd-item__icon" aria-hidden="true">
                      {result.type === 'thread' ? '◉' : result.noteType === 'scripture' ? '📖' : '◎'}
                    </span>
                    <span className="cmd-item__body">
                      <span className="cmd-item__title">{result.title ?? 'Untitled'}</span>
                      {(result.subtitle || noteTypeLabel(result.noteType)) && (
                        <span className="cmd-item__sub">
                          {noteTypeLabel(result.noteType) || result.subtitle}
                        </span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* ── Recent / nav items (shown when no query) ── */}
            {!hasQuery && recentItems.length > 0 && (
              <Command.Group heading="Recent" className="cmd-group">
                {recentItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.title + item.id}
                    onSelect={() => handleSelect(item.path)}
                    className="cmd-item"
                  >
                    <span className="cmd-item__icon" aria-hidden="true">
                      {item.type === 'space' ? '◈' : item.type === 'thread' ? '◉' : '◎'}
                    </span>
                    <span className="cmd-item__body">
                      <span className="cmd-item__title">{item.title}</span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* ── Threads (shown when no query) ── */}
            {!hasQuery && (nav?.threads ?? []).length > 0 && (
              <Command.Group heading="Threads" className="cmd-group">
                {(nav?.threads ?? []).slice(0, 5).map((thread) => (
                  <Command.Item
                    key={thread.id}
                    value={thread.title + thread.id}
                    onSelect={() => handleSelect(`/thread/${thread.id}`)}
                    className="cmd-item"
                  >
                    <span
                      className="cmd-item__color-dot"
                      style={{ background: thread.backgroundGradient }}
                      aria-hidden="true"
                    />
                    <span className="cmd-item__body">
                      <span className="cmd-item__title">{thread.title}</span>
                      {thread.noteCount > 0 && (
                        <span className="cmd-item__sub">{thread.noteCount} note{thread.noteCount !== 1 ? 's' : ''}</span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* ── Commands ── */}
            <Command.Group heading="Commands" className="cmd-group">
              <Command.Item
                value="new note create"
                onSelect={handleNewNote}
                className="cmd-item"
              >
                <span className="cmd-item__icon" aria-hidden="true">+</span>
                <span className="cmd-item__body">
                  <span className="cmd-item__title">New Note</span>
                </span>
                <kbd className="cmd-item__kbd">⌘ N</kbd>
              </Command.Item>
              <Command.Item
                value="new thread create"
                onSelect={handleNewThread}
                className="cmd-item"
              >
                <span className="cmd-item__icon" aria-hidden="true">◉</span>
                <span className="cmd-item__body">
                  <span className="cmd-item__title">New Thread</span>
                </span>
                <kbd className="cmd-item__kbd">⌘ ⇧ N</kbd>
              </Command.Item>
              <Command.Item
                value="search find notes"
                onSelect={() => handleSelect('/search')}
                className="cmd-item"
              >
                <span className="cmd-item__icon" aria-hidden="true">⌕</span>
                <span className="cmd-item__body">
                  <span className="cmd-item__title">Search</span>
                </span>
                <kbd className="cmd-item__kbd">⌘ F</kbd>
              </Command.Item>
              <Command.Item
                value="home dashboard"
                onSelect={() => handleSelect('/')}
                className="cmd-item"
              >
                <span className="cmd-item__icon" aria-hidden="true">⌂</span>
                <span className="cmd-item__body">
                  <span className="cmd-item__title">Go to Home</span>
                </span>
              </Command.Item>
              <Command.Item
                value="profile settings account"
                onSelect={() => handleSelect('/profile')}
                className="cmd-item"
              >
                <span className="cmd-item__icon" aria-hidden="true">◯</span>
                <span className="cmd-item__body">
                  <span className="cmd-item__title">Profile & Settings</span>
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="cmd-footer">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
