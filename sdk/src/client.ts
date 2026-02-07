import { HttpClient } from './http.js';
import type { HarvousClientConfig } from './types/common.js';
import { NotesResource } from './resources/notes.js';
import { ThreadsResource } from './resources/threads.js';
import { SpacesResource } from './resources/spaces.js';
import { TagsResource } from './resources/tags.js';
import { ScriptureResource } from './resources/scripture.js';
import { ResourcesResource } from './resources/resources.js';
import { SearchResource } from './resources/search.js';
import { UserResource } from './resources/user.js';

export class HarvousClient {
  private http: HttpClient;

  public readonly notes: NotesResource;
  public readonly threads: ThreadsResource;
  public readonly spaces: SpacesResource;
  public readonly tags: TagsResource;
  public readonly scripture: ScriptureResource;
  public readonly resources: ResourcesResource;
  public readonly search: SearchResource;
  public readonly user: UserResource;

  constructor(config: HarvousClientConfig = {}) {
    this.http = new HttpClient(config);

    this.notes = new NotesResource(this.http);
    this.threads = new ThreadsResource(this.http);
    this.spaces = new SpacesResource(this.http);
    this.tags = new TagsResource(this.http);
    this.scripture = new ScriptureResource(this.http);
    this.resources = new ResourcesResource(this.http);
    this.search = new SearchResource(this.http);
    this.user = new UserResource(this.http);
  }

  /** Update the authentication token */
  setToken(token: string): void {
    this.http.setToken(token);
  }
}
