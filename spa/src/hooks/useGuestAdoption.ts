/**
 * Runs adoption once, as soon as a new account has somewhere to put the work.
 *
 * The trigger is deliberately not "signed in": a brand-new account has no home space until
 * `/api/navigation/data` has answered and the server has created one, and a highlight posted
 * without a space id is a row the Highlights list will never find again — the exact bug the
 * `spaceId` parameter on `useCreateChapterHighlight` exists to document.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthReady } from './useAuthReady';
import { useHarvousIdentity } from './useHarvousIdentity';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import { adoptGuestWork } from '../lib/guest-adoption';
import { hasGuestSession } from '../lib/guest-session';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';

export function useGuestAdoption(): void {
  const { isAccount } = useHarvousIdentity();
  const authReady = useAuthReady();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (!isAccount || !authReady || !homeSpaceId) return;
    if (!hasGuestSession()) return;
    attempted.current = true;

    void adoptGuestWork(homeSpaceId).then((result) => {
      if (!result) return;
      if (result.failed > 0) {
        /*
         * The store is intact — say so plainly rather than claiming a partial success. Letting
         * `attempted` stay true is deliberate: a failing write will fail again this page, and a
         * retry loop behind a toast is worse than a reload the person chooses.
         */
        showPrototypeFeedbackToast(
          "Couldn't move everything from your trial yet — it's still on this device",
          'error',
        );
        return;
      }
      // The adopted rows are real now; every chapter view, the Highlights list and the note
      // lists are stale.
      void queryClient.invalidateQueries({ queryKey: ['prototype', 'scripture-highlights'] });
      void queryClient.invalidateQueries({ queryKey: ['space'] });
      void queryClient.invalidateQueries({ queryKey: ['navigation'] });

      /*
       * Counts what they made, in their words rather than ours — "2 highlights and 1 note",
       * not "3 items". It is the receipt for a promise the standing row made all visit.
       */
      const parts: string[] = [];
      if (result.adoptedHighlights > 0) {
        parts.push(`${result.adoptedHighlights} highlight${result.adoptedHighlights === 1 ? '' : 's'}`);
      }
      if (result.adoptedNotes > 0) {
        parts.push(`${result.adoptedNotes} note${result.adoptedNotes === 1 ? '' : 's'}`);
      }
      if (parts.length > 0) {
        showPrototypeFeedbackToast(`Saved to your account — ${parts.join(' and ')}`);
      }
    });
  }, [isAccount, authReady, homeSpaceId, queryClient]);
}
