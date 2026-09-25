/**
 * A marked question whose exercise did not come back: dots for the moment it is on screen, then
 * gone. The server builds a sitting's exercises before handing it over and leaves out any it
 * cannot build, so this is the net under that, not the plan.
 *
 * The skip runs once, from an effect, so no render can loop on it — and a remount for the next
 * question is a new component, keyed by the dock, with its own once.
 */
import { useEffect, useRef } from 'react';
import ProtoLoadingDots from '../ProtoLoadingDots';

export function UnbuildableQuestion({ onSkip, label }: { onSkip: () => void; label: string }) {
  const skip = useRef(onSkip);
  skip.current = onSkip;
  useEffect(() => {
    skip.current();
  }, []);
  return (
    <div className="proto-review-dock__loading">
      <ProtoLoadingDots label={label} />
    </div>
  );
}
