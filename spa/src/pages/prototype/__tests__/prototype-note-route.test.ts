import { describe, expect, it } from 'vitest';
import { router } from '../../../router';
/* Moved out of `router` in 60701df92; importing it from there resolved to `undefined` and the
   call below failed as "not a function" rather than as a wrong answer. */
import { legacySpaceNoteRedirectSearch } from '../../../router-search';

describe('dedicated prototype note route', () => {
  it('owns /$noteId params and forever-redirects /n/$noteId (shell hosts the note page)', () => {
    const canonical = router.routesByPath['/$noteId'];
    const legacy = router.routesByPath['/n/$noteId'];

    expect(typeof canonical?.options.component).toBe('function');
    expect(typeof canonical?.options.beforeLoad).toBe('function');
    expect(legacy?.options.component).toBeUndefined();
    expect(typeof legacy?.options.beforeLoad).toBe('function');
  });

  it('preserves search and emits bare space ids on legacy space-note redirects', () => {
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
      space: 'shared',
    });
  });
});
