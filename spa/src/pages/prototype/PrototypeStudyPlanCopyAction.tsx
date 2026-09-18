/**
 * "Use this study" — the curriculum handoff, on a channel's study plan.
 *
 * A follower takes the plan into their own study; a small-group leader hands it
 * to their group. Both are copies (see `useCopyStudyPlan`). The destination list
 * is only places the server will accept: My Home, and Shared Spaces the viewer
 * owns or leads. Offering a group they merely belong to would be a door the
 * server shuts.
 */
import { useMemo, useState } from 'react';
import { toast } from '@/utils/toast';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useCopyStudyPlan } from '../../hooks/mutations/useCopyStudyPlan';
import { toastError } from '../../lib/error-copy';

type Destination = { id: string | null; title: string };

export default function PrototypeStudyPlanCopyAction({
  channelSpaceId,
  threadId,
}: {
  channelSpaceId: string;
  threadId: string;
}) {
  const { data: nav } = useNavigation();
  const copy = useCopyStudyPlan();
  const [choosing, setChoosing] = useState(false);

  const destinations = useMemo<Destination[]>(() => {
    const groups: Destination[] = [];
    for (const space of nav?.spaces ?? []) {
      if (space.type === 'shared') groups.push({ id: space.id, title: space.title });
    }
    for (const space of nav?.memberOfSpaces ?? []) {
      if (space.type === 'shared' && (space.role === 'owner' || space.role === 'leader')) {
        groups.push({ id: space.id, title: space.title });
      }
    }
    return [{ id: null, title: 'My Home' }, ...groups];
  }, [nav?.spaces, nav?.memberOfSpaces]);

  const run = (destination: Destination) => {
    setChoosing(false);
    copy.mutate(
      { channelSpaceId, threadId, targetSpaceId: destination.id },
      {
        onSuccess: (result) => {
          if (result.alreadyCopied) {
            const where =
              destinations.find((d) => d.id === result.spaceId)?.title ??
              (result.spaceId ? 'another space' : 'My Home');
            toast.success(`You already have this study in ${where}`);
            return;
          }
          toast.success(`Added to ${destination.title}`);
        },
        onError: (err) => toastError(err, 'Could not copy this study'),
      },
    );
  };

  return (
    <div className="proto-shared-thread-drilldown__actions">
      {choosing ? (
        <>
          {destinations.map((destination) => (
            <button
              key={destination.id ?? 'home'}
              type="button"
              className="proto-shared-thread-action"
              disabled={copy.isPending}
              onClick={() => run(destination)}
            >
              {destination.title}
            </button>
          ))}
          <button type="button" className="proto-shared-thread-action" onClick={() => setChoosing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="proto-shared-thread-action"
          disabled={copy.isPending}
          /* One place to put it needs no question. */
          onClick={() => (destinations.length === 1 ? run(destinations[0]) : setChoosing(true))}
        >
          {copy.isPending ? 'Copying…' : 'Use this study'}
        </button>
      )}
    </div>
  );
}
