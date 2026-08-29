import { stripHtmlForListPreview } from '@/utils/html-stripper';
import type { SpaceMemberRow } from '../../../hooks/queries/useSpace';

export function stripHtmlPreview(html: string | null | undefined, max = 80) {
  if (!html) return '';
  return stripHtmlForListPreview(html, max);
}

export function sharedSpaceAuthorChipProps(
  memberByUserId: Map<string, SpaceMemberRow>,
  options: {
    userId?: string;
    displayName: string;
    color?: string | null;
    isSelf?: boolean;
  },
) {
  const member = options.userId ? memberByUserId.get(options.userId) : undefined;
  return {
    displayName: options.displayName,
    userId: options.userId ?? '',
    firstName: member?.firstName,
    profileImageUrl: member?.profileImageUrl,
    color: options.color ?? member?.userColor ?? 'blue',
    isSelf: options.isSelf,
  };
}
