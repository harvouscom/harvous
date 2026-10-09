/**
 * The row-writing half of creating a personal Shared Space: the space and its owner's
 * membership. Shared by `POST /api/spaces/create-shared` and `POST /api/family` (a Family
 * Space is an ordinary shared space), so cover, gradient and title casing can't drift.
 *
 * Validation and the billing gate stay with each caller — they differ.
 */

import { db, first, Spaces, SpaceMemberships } from '../db';
import { getThreadGradientCSS } from '@/utils/colors';
import { serializeSpaceCoverForDb, spaceCoverFromThreadColor } from '@/utils/space-cover';
import { generateSpaceId } from '@/utils/ids';

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export async function insertPersonalSharedSpace(
  tx: Executor,
  input: {
    ownerUserId: string;
    title: string;
    color: string;
    coverVariant: number;
    description?: string | null;
    now: Date;
    /** Extra columns the caller has already validated (meeting rhythm, place). */
    extra?: Partial<typeof Spaces.$inferInsert>;
  },
): Promise<typeof Spaces.$inferSelect> {
  const cover = spaceCoverFromThreadColor(input.color, input.coverVariant);
  const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(cover);
  const title = input.title.charAt(0).toUpperCase() + input.title.slice(1);

  const space = first(
    await tx
      .insert(Spaces)
      .values({
        id: generateSpaceId(),
        title,
        description: input.description?.trim() || null,
        color: input.color,
        backgroundGradient: getThreadGradientCSS(input.color),
        coverBgLight,
        coverBgDark,
        userId: input.ownerUserId,
        type: 'shared',
        isPublic: false,
        isActive: true,
        order: 0,
        createdAt: input.now,
        ...(input.extra ?? {}),
      })
      .returning(),
  )!;

  await tx.insert(SpaceMemberships).values({
    id: `smem_${crypto.randomUUID()}`,
    spaceId: space.id,
    userId: input.ownerUserId,
    role: 'owner',
    joinedAt: input.now,
    createdAt: input.now,
  });

  return space;
}
