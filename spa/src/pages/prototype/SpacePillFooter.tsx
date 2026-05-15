import { Link, useRouterState } from '@tanstack/react-router';
import { useSpace } from '../../hooks/queries/useSpace';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';

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
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const legacyMatch = pathname.match(/^\/prototype\/space\/([^/]+)/);
  const onFlatPrototypeHome =
    pathname === '/prototype' || pathname === '/prototype/' || pathname.startsWith('/prototype/n/');
  const spaceIdFromPath = legacyMatch?.[1]
    ? legacyMatch[1].startsWith('space_')
      ? legacyMatch[1]
      : `space_${legacyMatch[1]}`
    : onFlatPrototypeHome
      ? homeSpaceId ?? null
      : null;

  if (!spaceIdFromPath) return null;

  const { data: space } = useSpace(spaceIdFromPath);
  const dc = spaceColorAttr(space?.color ?? null);

  return (
    <Link
      to="/space/$spaceId"
      params={{ spaceId: spaceSlug(spaceIdFromPath) }}
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
