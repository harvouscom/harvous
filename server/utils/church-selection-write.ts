/**
 * The one place a person's church selection is written to UserMetadata.
 *
 * Two doors lead here: Settings › My Church (`POST /api/user/update-church`, which
 * the native app calls too) and a church's join link (`POST /api/church/join/:token/
 * redeem`). They used to be one door, and the write carries three side effects that a
 * second copy would drift from: the first-church XP award, the `churchAddedAt` stamp,
 * and releasing the old church's channel follows when someone moves. Keeping both
 * doors on this function is what keeps "joined by link" and "picked in Settings" the
 * same kind of connection.
 *
 * Congregants are never added to the church's Clerk organization (that is the staff
 * roster); `connected*` is the whole link. See church-connection.ts.
 */

import { db, first, UserMetadata, eq } from '../db';
import { nowISO, toDate } from '../db/dates';
import { awardChurchAddedXP } from './xp-system';
import { orgLeftByChurchChange, releaseChannelFollowsForOrg } from './ministry-channel-follow';
import type { ChurchConnectionFields } from './church-connection';

/** The five denormalized church columns on UserMetadata. */
export type ChurchSelectionFields = {
  hmcChurchId: string | null;
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  churchCountry: string | null;
};

type UserMetadataRow = typeof UserMetadata.$inferSelect;

function hasAnyChurchField(fields: ChurchSelectionFields): boolean {
  return Boolean(
    fields.hmcChurchId ||
      fields.churchName ||
      fields.churchCity ||
      fields.churchState ||
      fields.churchCountry,
  );
}

/**
 * Write a church selection and its connection, then release the old church's
 * follows if the person left one.
 *
 * The release runs **after** the write and never fails it: a failure there must not
 * cost someone their new connection. Returns the org that was left, if any.
 */
export async function persistChurchSelection(input: {
  userId: string;
  existing: UserMetadataRow | undefined;
  fields: ChurchSelectionFields;
  connection: ChurchConnectionFields;
  /** Names the caller in the release warning. */
  logTag: string;
}): Promise<{ leftOrgId: string | null }> {
  const { userId, existing, fields, connection } = input;

  if (existing) {
    const isFirstTimeAddingChurch =
      !existing.hmcChurchId &&
      !existing.churchName &&
      !existing.churchCity &&
      !existing.churchState &&
      !existing.churchCountry &&
      hasAnyChurchField(fields);

    await db
      .update(UserMetadata)
      .set({
        hmcChurchId: fields.hmcChurchId,
        churchName: fields.churchName,
        churchCity: fields.churchCity,
        churchState: fields.churchState,
        churchCountry: fields.churchCountry,
        connectedChurchId: connection.connectedChurchId,
        connectedOrgId: connection.connectedOrgId,
        connectedChurchAt: connection.connectedChurchAt,
        churchAddedAt: isFirstTimeAddingChurch ? nowISO() : existing.churchAddedAt,
        updatedAt: nowISO(),
      })
      .where(eq(UserMetadata.userId, userId));

    if (isFirstTimeAddingChurch) {
      await awardChurchAddedXP(userId);
    }
  } else {
    const hasChurchData = hasAnyChurchField(fields);
    await db.insert(UserMetadata).values({
      id: crypto.randomUUID(),
      userId,
      hmcChurchId: fields.hmcChurchId,
      churchName: fields.churchName,
      churchCity: fields.churchCity,
      churchState: fields.churchState,
      churchCountry: fields.churchCountry,
      connectedChurchId: connection.connectedChurchId,
      connectedOrgId: connection.connectedOrgId,
      connectedChurchAt: connection.connectedChurchAt,
      churchAddedAt: hasChurchData ? nowISO() : null,
      highestSimpleNoteId: 0,
      userColor: 'blue',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
    if (hasChurchData) await awardChurchAddedXP(userId);
  }

  /* Moved or left: the old church's channels stop filling this person's feed.
     After the write, so a failure here never costs them the new connection. */
  const leftOrgId = orgLeftByChurchChange(existing?.connectedOrgId, connection.connectedOrgId);
  if (leftOrgId) {
    try {
      await releaseChannelFollowsForOrg(userId, leftOrgId);
    } catch (error) {
      console.warn(`[${input.logTag}] could not release old channel follows`, { leftOrgId, error });
    }
  }
  return { leftOrgId };
}

/** The `Churches` columns a connection is built from. */
export type ConnectableChurch = {
  id: string;
  orgId: string;
  hmcChurchId: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type ConnectUserToChurchResult = {
  /** Already connected to this church before the call — nothing new happened. */
  alreadyConnected: boolean;
  /** The church they were connected to before, if it was a different one. */
  leftOrgId: string | null;
};

/**
 * Connect a person to a registered church by its `Churches` row.
 *
 * `update-church` finds a church through its Here's My Church directory id, and
 * `Churches.hmcChurchId` can be null — a church registered by hand has none. So a
 * join link connects by the row itself, and copies the church's own name and place
 * into the person's denormalized fields, the same fields a directory pick fills.
 *
 * Reconnecting to the same church keeps `connectedChurchAt`, as a Settings re-save does.
 */
export async function connectUserToChurch(
  userId: string,
  church: ConnectableChurch,
): Promise<ConnectUserToChurchResult> {
  const existing = first(
    await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1),
  );
  const alreadyConnected = existing?.connectedChurchId === church.id;
  const preserved = alreadyConnected ? toDate(existing?.connectedChurchAt ?? null) : null;

  const { leftOrgId } = await persistChurchSelection({
    userId,
    existing,
    fields: {
      hmcChurchId: church.hmcChurchId ?? null,
      churchName: church.name,
      churchCity: church.city ?? null,
      churchState: church.state ?? null,
      churchCountry: church.country ?? null,
    },
    connection: {
      connectedChurchId: church.id,
      connectedOrgId: church.orgId,
      connectedChurchAt: preserved ?? nowISO(),
    },
    logTag: 'church-join',
  });

  return { alreadyConnected, leftOrgId };
}
