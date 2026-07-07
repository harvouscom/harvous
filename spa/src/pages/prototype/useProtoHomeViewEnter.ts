import { useRef } from 'react';

/**
 * Staggered section enter for space dashboards (My Home + shared spaces).
 * Fires once when `ready` becomes true; pass `replayKey` to replay when switching spaces.
 */
export function useProtoHomeViewClassName(ready: boolean, replayKey?: string | null): string {
  const shouldEnterRef = useRef(false);
  const replayKeyRef = useRef(replayKey);

  if (replayKey !== undefined && replayKey !== replayKeyRef.current) {
    replayKeyRef.current = replayKey;
    shouldEnterRef.current = false;
  }

  if (ready && !shouldEnterRef.current) {
    shouldEnterRef.current = true;
  }

  return shouldEnterRef.current ? 'proto-home-view proto-home-view--enter' : 'proto-home-view';
}
