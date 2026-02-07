import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarvousClient } from '../src/client.js';
import { NotesResource } from '../src/resources/notes.js';
import { ThreadsResource } from '../src/resources/threads.js';
import { SpacesResource } from '../src/resources/spaces.js';
import { TagsResource } from '../src/resources/tags.js';
import { ScriptureResource } from '../src/resources/scripture.js';
import { ResourcesResource } from '../src/resources/resources.js';
import { SearchResource } from '../src/resources/search.js';
import { UserResource } from '../src/resources/user.js';

describe('HarvousClient', () => {
  it('creates all resource instances', () => {
    const client = new HarvousClient({ token: 'test' });

    expect(client.notes).toBeInstanceOf(NotesResource);
    expect(client.threads).toBeInstanceOf(ThreadsResource);
    expect(client.spaces).toBeInstanceOf(SpacesResource);
    expect(client.tags).toBeInstanceOf(TagsResource);
    expect(client.scripture).toBeInstanceOf(ScriptureResource);
    expect(client.resources).toBeInstanceOf(ResourcesResource);
    expect(client.search).toBeInstanceOf(SearchResource);
    expect(client.user).toBeInstanceOf(UserResource);
  });

  it('accepts empty config', () => {
    const client = new HarvousClient();
    expect(client.notes).toBeInstanceOf(NotesResource);
  });

  it('setToken updates auth for subsequent requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new HarvousClient({ baseUrl: 'https://api.test' });
    client.setToken('new-token');

    await client.notes.recent();

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer new-token');

    vi.unstubAllGlobals();
  });
});
