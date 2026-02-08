# @harvous/sdk

TypeScript SDK for the Harvous Bible study notes API.

> **Status:** Foundation (v0.1.0) — typed client for core endpoints with authentication, error handling, and retry logic. No OAuth partner system or UI components yet.

## Installation

```bash
npm install @harvous/sdk
```

Requires Node.js 18+ (uses native `fetch`). Zero runtime dependencies.

## Quick Start

```typescript
import { HarvousClient } from '@harvous/sdk';

const client = new HarvousClient({
  token: 'your_clerk_session_token',
});

// Create a note
const { note } = await client.notes.create({
  content: 'Study notes on Romans 8',
  threadId: 'thread_abc',
});

// List threads
const threads = await client.threads.list();

// Search
const { results } = await client.search.query({ q: 'grace' });

// Detect scripture references
const detection = await client.scripture.detect('John 3:16 is important');
```

## Authentication

The SDK supports two authentication modes:

### Static token

For scripts and short-lived operations:

```typescript
const client = new HarvousClient({
  token: 'sess_...',
});
```

### Dynamic token (recommended for apps)

For long-running apps where tokens refresh:

```typescript
const client = new HarvousClient({
  getToken: async () => {
    // Return a fresh Clerk session token
    return await clerk.session?.getToken();
  },
});
```

### Updating the token

```typescript
client.setToken('new_session_token');
```

## API Reference

All methods return typed Promises. The client uses namespaced resources:

### `client.notes`

| Method | Description |
|--------|-------------|
| `create(params)` | Create a note (default, scripture, or resource type) |
| `get(noteId)` | Get note details with threads, tags, comments |
| `recent(limit?)` | List recent notes (default: 50, max: 100) |
| `updateContent(noteId, params)` | Update note content |
| `delete(noteId)` | Delete a note |
| `nextId()` | Get next sequential note ID (N001, N002...) |

### `client.threads`

| Method | Description |
|--------|-------------|
| `create(params)` | Create a thread |
| `list()` | List all threads with note counts |
| `update(params)` | Update thread title, color, notes |
| `delete(threadId)` | Delete a thread (preserves notes) |
| `notes(threadId, options?)` | List notes in a thread (paginated) |

### `client.spaces`

| Method | Description |
|--------|-------------|
| `create(params)` | Create a space |
| `delete(spaceId)` | Delete a space |
| `notes(spaceId)` | Get notes in a space |
| `addItems(spaceId, params)` | Add notes/threads to a space |
| `removeItems(spaceId, params)` | Remove notes/threads from a space |

### `client.tags`

| Method | Description |
|--------|-------------|
| `create(params)` | Create a tag |
| `list()` | List all tags |
| `delete(tagId)` | Delete a tag |
| `assign(params)` | Assign a tag to a note |
| `remove(params)` | Remove a tag from a note |

### `client.scripture`

| Method | Description |
|--------|-------------|
| `detect(text)` | Detect scripture references in text |
| `fetchVerse(reference)` | Fetch verse text (NET Bible) |
| `checkExisting(params)` | Check if a scripture note already exists |

### `client.resources`

| Method | Description |
|--------|-------------|
| `metadata(url)` | Fetch URL metadata (title, description, image) |
| `checkDuplicate(url)` | Check if a resource URL already exists |

### `client.search`

| Method | Description |
|--------|-------------|
| `query(params)` | Search notes and threads |

### `client.user`

| Method | Description |
|--------|-------------|
| `profile()` | Get current user's profile |
| `xp(options?)` | Get current user's XP data |

## Error Handling

The SDK throws typed errors for different failure modes:

```typescript
import {
  HarvousClient,
  HarvousAuthError,
  HarvousNotFoundError,
  HarvousRateLimitError,
  HarvousValidationError,
  HarvousNetworkError,
} from '@harvous/sdk';

try {
  await client.notes.get('note_123');
} catch (err) {
  if (err instanceof HarvousAuthError) {
    // 401 — token expired or missing
    console.log('Please re-authenticate');
  } else if (err instanceof HarvousNotFoundError) {
    // 404 — resource doesn't exist
    console.log('Note not found');
  } else if (err instanceof HarvousRateLimitError) {
    // 429 — too many requests
    console.log(`Retry after: ${err.resetTime}`);
  } else if (err instanceof HarvousValidationError) {
    // 400 — invalid input
    console.log(`Validation error: ${err.code}`);
  } else if (err instanceof HarvousNetworkError) {
    // Network failure or timeout
    console.log('Network error, please retry');
  }
}
```

## Configuration

```typescript
const client = new HarvousClient({
  // Base URL (default: 'https://harvous.com')
  baseUrl: 'https://harvous.com',

  // Auth token (static)
  token: 'sess_...',

  // Or auth token (dynamic)
  getToken: async () => getSessionToken(),

  // Request timeout in ms (default: 10000)
  timeout: 15000,

  // Retry attempts for 5xx errors (default: 2)
  retries: 3,
});
```

### Retry behavior

- **5xx errors**: Retried with exponential backoff (200ms, 400ms, 800ms...)
- **4xx errors**: Never retried (thrown immediately)
- **Network errors**: Retried (connection refused, timeout, etc.)

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run tests
npm run test:run

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
