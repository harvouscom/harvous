import { describe, expect, it } from 'vitest';
import { legacySpaceNoteRedirectSearch, router } from '../../../router';
import PrototypeNotePage from '../PrototypeNotePage';

describe('dedicated prototype note route', () => {
  it('renders the note page at /n/$noteId and keeps the root slug as a redirect', () => {
    const canonical = router.routesByPath['/n/$noteId'];
    const compatibility = router.routesByPath['/$noteId'];

    expect(canonical?.options.component).toBe(PrototypeNotePage);
    expect(compatibility?.options.component).toBeUndefined();
    expect(typeof compatibility?.options.beforeLoad).toBe('function');
  });

  it('preserves search and normalizes space on legacy space-note redirects', () => {
    expect(
      legacySpaceNoteRedirectSearch(
        {
          highlight: 'study_1',
          dockReq: 'request_1',
          space: 'space_stale',
        },
        'shared',
      ),
    ).toEqual({
      highlight: 'study_1',
      dockReq: 'request_1',
      space: 'space_shared',
    });
  });
});
