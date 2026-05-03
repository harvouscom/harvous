/**
 * Space switcher popover — mirrors native SpaceSwitcherView sections/actions.
 *
 * Sections (matching native order):
 *   1. Space list (active checkmark)
 *   2. New private shared… / New public shared… / Join with token…
 *   3. Manage current space… (only when a space is active)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { GearSix, Key, Link as LinkIcon, Lock, SquaresFour } from '@phosphor-icons/react';
import type { NavSpace } from '../../hooks/queries/useNavigation';

function spaceSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

function mergeSpaces(spaces: NavSpace[], memberOf: NavSpace[]): NavSpace[] {
  const map = new Map<string, NavSpace>();
  for (const s of spaces) map.set(s.id, s);
  for (const s of memberOf) if (!map.has(s.id)) map.set(s.id, s);
  return Array.from(map.values());
}

export default function SpaceSwitcherMenu({
  spaces,
  memberOfSpaces,
  activeSpaceId,
}: {
  spaces: NavSpace[];
  memberOfSpaces: NavSpace[];
  activeSpaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const list = useMemo(() => mergeSpaces(spaces, memberOfSpaces), [spaces, memberOfSpaces]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const normalizedActive = activeSpaceId?.startsWith('space_')
    ? activeSpaceId
    : activeSpaceId
      ? `space_${activeSpaceId}`
      : null;

  return (
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className="proto-space-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Switch space"
        onClick={() => setOpen((x) => !x)}
      >
        <SquaresFour size={15} />
      </button>

      {open ? (
        <div className="proto-menu__popover" role="menu" aria-label="Space switcher">
          {/* Section 1 — Space list */}
          <div className="proto-menu-section" role="group">
            {list.length === 0 ? (
              <p className="proto-menu-muted">No spaces yet — create one in the classic app.</p>
            ) : (
              list.map((s) => {
                const selected = normalizedActive === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className="proto-menu-item"
                    onClick={() => {
                      setOpen(false);
                      navigate({
                        to: '/prototype/space/$spaceId',
                        params: { spaceId: spaceSlug(s.id) },
                      });
                    }}
                  >
                    <span className="proto-menu-item__check" aria-hidden>
                      {selected ? '✓' : ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{s.title || 'Untitled space'}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Section 2 — Create / join actions */}
          <div className="proto-menu-section" role="group">
            <Link
              to="/new-space"
              search={{ visibility: 'private' }}
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><Lock size={13} /></span>
              New private shared…
            </Link>
            <Link
              to="/new-space"
              search={{ visibility: 'public' }}
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><LinkIcon size={13} /></span>
              New public shared…
            </Link>
            <Link
              to="/"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              title="Open the classic app to join with a token"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><Key size={13} /></span>
              Join with token…
            </Link>
          </div>

          {/* Section 3 — Manage current space */}
          {normalizedActive ? (
            <div className="proto-menu-section" role="group">
              <Link
                to="/space/$spaceId"
                params={{ spaceId: spaceSlug(normalizedActive) }}
                className="proto-menu-item"
                style={{ textDecoration: 'none' }}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <span className="proto-menu-item__icon"><GearSix size={13} /></span>
                Manage current space…
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
