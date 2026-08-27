/**
 * ⇧K — search and commands in one field.
 *
 * Not a retrofit of `SpotlightSearch`. That one is bound to Classic (Classic routes,
 * `idToUrl`, Classic row components) and returns null on prototype paths on purpose; the
 * two would have fought over the same overlay. This shares its dependency (`cmdk`) and
 * nothing else.
 *
 * The Actions section is the point. Every organize verb the keyboard can raise appears
 * here with its chord printed beside it, which is how the chords get taught: you reach for
 * the palette because you do not remember the key, and the palette shows you the key.
 * Commands come from `prototype-commands.ts`, so what is offered here and what a chord
 * will actually do cannot drift apart.
 *
 * Lazily loaded, so `open` is owned by the shell rather than by this component: something
 * has to be listening for ⇧K while this module is still unfetched, and it cannot be this.
 */
import { Command } from 'cmdk';
import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useSearch, type SearchResult } from '../../hooks/queries/useSearch';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { availablePrototypeCommands, type CommandContext } from '../../lib/prototype-commands';
import { usePrototypeCommandContext } from '../../lib/prototype-command-context-store';
import ProtoKbdChord from './ProtoKbdChord';

const PALETTE_Z_INDEX = 7000;

export type PrototypeCommandPaletteProps = {
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
  navigationItems: readonly {
    id: string;
    label: string;
    icon: string;
    keys?: string;
    run: () => void;
  }[];
  homeSpaceId: string | null;
};

export default function PrototypeCommandPalette({
  onClose,
  onOpenNote,
  navigationItems,
  homeSpaceId,
}: PrototypeCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { input: query, setInput: setQuery, debounced } = useDebouncedSearchState();

  /* Mounted only while open, so there is no stale query to clear — the next ⇧K builds a
     fresh component. */
  const close = onClose;

  const searchScope = useMemo(
    () => ({ spaceId: homeSpaceId ?? undefined, excludeLegacyScriptureNotes: true }),
    [homeSpaceId],
  );
  const { data: results } = useSearch(debounced, searchScope, 'notes');

  /* Read once on mount rather than every render — see the store's note on why this is a
     getter. Mounting *is* opening, so this runs on each ⇧K. */
  const published = usePrototypeCommandContext();
  const commandContext: CommandContext | null = useMemo(
    () => published.getContext?.() ?? null,
    [published],
  );
  const commands = useMemo(
    () => (commandContext ? availablePrototypeCommands(commandContext) : []),
    [commandContext],
  );

  if (typeof document === 'undefined') return null;

  const notes: SearchResult[] = (results?.results ?? [])
    .filter((r) => r.type === 'note')
    .slice(0, 8);
  const searching = debounced.trim().length >= MIN_SEARCH_QUERY_LENGTH;

  return createPortal(
    <div
      className="proto-command-palette__backdrop"
      style={{ zIndex: PALETTE_Z_INDEX }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command
        className="proto-command-palette"
        label="Search and commands"
        /* The rows are already ordered by relevance server-side and by intent locally;
           cmdk's own fuzzy re-ranking would shuffle Actions in among the notes. */
        shouldFilter={false}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="proto-command-palette__field">
          <Icon name="magnifying-glass" size={15} aria-hidden />
          <Command.Input
            ref={inputRef}
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search notes or run a command"
            className="proto-command-palette__input"
          />
        </div>

        <Command.List className="proto-command-palette__list">
          {commands.length > 0 ? (
            <Command.Group heading="Actions" className="proto-command-palette__group">
              {commands.map((command) => (
                <Command.Item
                  key={command.id}
                  value={command.id}
                  className="proto-command-palette__item"
                  onSelect={() => {
                    close();
                    published.run?.(command.id);
                  }}
                >
                  <span className="proto-command-palette__icon" aria-hidden>
                    <Icon name={command.icon as never} size={14} />
                  </span>
                  <span className="proto-command-palette__label">
                    {command.label(commandContext as CommandContext)}
                  </span>
                  {command.keys ? <ProtoKbdChord keys={command.keys} compact /> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {searching && notes.length > 0 ? (
            <Command.Group heading="Notes" className="proto-command-palette__group">
              {notes.map((note) => (
                <Command.Item
                  key={note.id}
                  value={`note:${note.id}`}
                  className="proto-command-palette__item"
                  onSelect={() => {
                    close();
                    onOpenNote(note.id);
                  }}
                >
                  <span className="proto-command-palette__icon" aria-hidden>
                    <Icon name="note-sticky" size={14} />
                  </span>
                  <span className="proto-command-palette__label">
                    {/* Same naming as the sidebar rows — the server's placeholder title is
                        stripped so a note is not called one thing in the list and another
                        here. */}
                    {stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') ||
                      'New Note'}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Go to" className="proto-command-palette__group">
            {navigationItems.map((item) => (
              <Command.Item
                key={item.id}
                value={`nav:${item.id}`}
                className="proto-command-palette__item"
                onSelect={() => {
                  close();
                  item.run();
                }}
              >
                <span className="proto-command-palette__icon" aria-hidden>
                  <Icon name={item.icon as never} size={14} />
                </span>
                <span className="proto-command-palette__label">{item.label}</span>
                {item.keys ? <ProtoKbdChord keys={item.keys} compact /> : null}
              </Command.Item>
            ))}
          </Command.Group>

          {searching && notes.length === 0 ? (
            <Command.Empty className="proto-command-palette__empty">
              No notes match “{debounced.trim()}”
            </Command.Empty>
          ) : null}
        </Command.List>

        <div className="proto-command-palette__footer">
          <span>
            <ProtoKbdChord keys="↑↓" compact /> move
          </span>
          <span>
            <ProtoKbdChord keys="↵" compact /> select
          </span>
          <span>
            <ProtoKbdChord keys="⎋" compact /> close
          </span>
        </div>
      </Command>
    </div>,
    document.body,
  );
}
