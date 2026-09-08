/**
 * Which organize verbs a query is asking for.
 *
 * The palette showed every available command unconditionally, because its field was the
 * only thing in it. Here the field also searches notes, folders, Threads, highlights,
 * Scripture and resources — so an unfiltered Actions group would sit above every result
 * offering six verbs to someone who typed "grace".
 *
 * Matching uses the same fuzzy matcher the rest of the surface uses, so "delet" finding a
 * verb and "grac" finding a note behave alike rather than being two different ideas of
 * what counts as a match.
 */
import { fuzzyMatches } from '../fuzzy-search';
import {
  availablePrototypeCommands,
  type CommandContext,
  type PrototypeCommand,
} from '../../../lib/prototype-commands';

export function matchPrototypeCommands(
  ctx: CommandContext | null,
  query: string,
): PrototypeCommand[] {
  /* No context means nothing is selected or focused for a verb to act on. Offering verbs
     that would have no object is worse than offering none. */
  if (!ctx) return [];

  const available = availablePrototypeCommands(ctx);
  const trimmed = query.trim();

  /* Empty query: the palette's behaviour, and the case decision 4 keeps — with a row
     focused and nothing typed, the whole point is to show you what you could do to it,
     chords included. */
  if (!trimmed) return available;

  return available.filter(
    (command) =>
      fuzzyMatches(trimmed, command.referenceLabel) || fuzzyMatches(trimmed, command.label(ctx)),
  );
}
