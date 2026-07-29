import { describe, expect, it } from 'vitest';
import { legacySpaceNoteRedirectSearch, router } from '../../../router';

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
