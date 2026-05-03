import { Link, useRouterState } from '@tanstack/react-router';
import { useSpace } from '../../hooks/queries/useSpace';

function spaceSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

function spaceColorAttr(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  const x = c.toLowerCase();
  if (x === 'purple' || x === 'green' || x === 'orange') return x;
  return undefined;
}

export default function SpacePillFooter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const m = pathname.match(/^\/prototype\/space\/([^/]+)/);
  if (!m) return null;
  const raw = m[1];
  const spaceId = raw.startsWith('space_') ? raw : `space_${raw}`;
  const { data: space } = useSpace(spaceId);
  const dc = spaceColorAttr(space?.color ?? null);

  return (
    <Link
      to="/space/$spaceId"
      params={{ spaceId: spaceSlug(spaceId) }}
      className="proto-footer-pill"
      data-color={dc}
      style={{ textDecoration: 'none', color: 'inherit' }}
      title="Open space in classic app"
    >
      <span className="proto-footer-pill__tiles" aria-hidden />
      <span className="proto-footer-pill__label">{space?.title ?? 'Space'}</span>
    </Link>
  );
}
