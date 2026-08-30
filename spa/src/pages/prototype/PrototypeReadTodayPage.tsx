/**
 * `/read/today` — the reader, on whatever today's passage is.
 *
 * A stable URL for a moving target. It exists because the marketing site is a static build and
 * cannot know what today's passage is, but "Try it free" has to land somewhere real: an arriving
 * guest gets the same screen someone who tapped Today's passage would get, without harvous.com
 * having to learn anything about VOTD or ship a build every morning.
 *
 * Both endpoints behind this — `/api/votd/today` and the chapter itself — are public, which is
 * what makes an account-less arrival possible at all.
 */
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import { readerRouteForReference } from '../../utils/reader-nav';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import ProtoRoutePending from './ProtoRoutePending';

/**
 * Where a guest lands when VOTD cannot answer.
 *
 * Not an error state: someone who followed "Try it free" is owed a chapter, not an apology for
 * an endpoint they have never heard of. John 1 because it needs no set-up to be worth reading.
 */
const FALLBACK_REFERENCE = 'John 1';

export default function PrototypeReadTodayPage() {
  const navigate = useNavigate();
  const { data, isPending, isError } = useVotdToday();

  useEffect(() => {
    if (isPending) return;
    const reference = (!isError && data?.reference) || FALLBACK_REFERENCE;
    const route =
      readerRouteForReference(reference, getEffectiveDefaultTranslation()) ??
      readerRouteForReference(FALLBACK_REFERENCE, getEffectiveDefaultTranslation());
    if (!route) return;
    // `replace`, so Back from the reader leaves the app rather than bouncing through a
    // redirect that would immediately send them forward again.
    navigate({ ...route, replace: true });
  }, [data, isPending, isError, navigate]);

  return <ProtoRoutePending />;
}
