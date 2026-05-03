import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useNavigation, type NavSpace } from '../../hooks/queries/useNavigation';
import { PROTO_LAST_SPACE_KEY } from '../../layouts/proto-session-keys';

function mergeSpaces(spaces: NavSpace[], memberOf: NavSpace[]) {
  const map = new Map<string, NavSpace>();
  for (const s of spaces) map.set(s.id, s);
  for (const s of memberOf) if (!map.has(s.id)) map.set(s.id, s);
  return Array.from(map.values());
}

export default function PrototypeHomePage() {
  const { data: nav, isLoading } = useNavigation();
  const navigate = useNavigate();

  const list = useMemo(
    () => mergeSpaces(nav?.spaces ?? [], nav?.memberOfSpaces ?? []),
    [nav?.spaces, nav?.memberOfSpaces],
  );

  useEffect(() => {
    if (isLoading || list.length === 0) return;

    let preferred = list[0]?.id;
    try {
      const last = localStorage.getItem(PROTO_LAST_SPACE_KEY);
      if (last && list.some((s) => s.id === last)) preferred = last;
    } catch {
      /* ignore */
    }
    if (!preferred) return;
    const slug = preferred.startsWith('space_') ? preferred.slice('space_'.length) : preferred;
    navigate({
      to: '/prototype/space/$spaceId',
      params: { spaceId: slug },
      replace: true,
    });
  }, [isLoading, list, navigate]);

  if (isLoading && list.length === 0) {
    return (
      <div className="proto-main-pane proto-main-empty">
        <p className="proto-caption">Loading…</p>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="proto-main-pane proto-main-empty" style={{ maxWidth: 440 }}>
        <h1 className="proto-title-md" style={{ marginBottom: 8 }}>
          No spaces yet
        </h1>
        <p className="proto-body" style={{ color: 'var(--proto-text-secondary)', marginBottom: 20 }}>
          Create a space from the classic app, then pick it in the sidebar.
        </p>
        <Link to="/new-space" className="proto-caption" style={{ color: 'var(--proto-accent)', fontWeight: 600, textDecoration: 'none' }}>
          New space →
        </Link>
      </div>
    );
  }

  return <div className="proto-main-pane proto-main-empty"><p className="proto-caption">Opening your last space…</p></div>;
}
