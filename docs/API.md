# Harvous API Documentation

Complete API reference for all Harvous endpoints with request/response examples and error codes.

## Table of Contents

- [Authentication](#authentication)
- [Notes](#notes)
- [Threads](#threads)
- [Spaces](#spaces)
- [User](#user)
- [Tags](#tags)
- [Search](#search)
- [Scripture](#scripture)
- [Inbox](#inbox)
- [Navigation](#navigation)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)

## Authentication

All API endpoints require authentication via Clerk. The `userId` is automatically extracted from the request context. Unauthenticated requests return `401 Unauthorized`.

## Notes

### Create Note

**POST** `/api/notes/create`

Creates a new note. Notes are always created in the "Unorganized" thread initially, and can be added to specific threads via the junction table.

**Request Body** (FormData):
```
content: string (required, 1-50,000 characters)
title?: string (optional)
threadId?: string (optional, format: "thread_*")
noteType?: "default" | "scripture" | "resource" (default: "default")
scriptureReference?: string (optional)
scriptureVersion?: string (optional)
spaceId?: string (optional, format: "space_*")
```

**Response** (200 OK):
```json
{
  "id": "note_1234567890",
  "content": "This is my note content",
  "title": "My Note Title",
  "threadId": "thread_unorganized",
  "spaceId": null,
  "simpleNoteId": 1,
  "noteType": "default",
  "userId": "user_abc123",
  "isPublic": false,
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input (validation failed)
  - `CONTENT_REQUIRED`: Content is required
  - `CONTENT_EMPTY`: Content cannot be empty
  - `CONTENT_TOO_LONG`: Content exceeds 50,000 characters
  - `INVALID_NOTE_TYPE`: Invalid note type
  - `INVALID_THREAD_ID`: Invalid thread ID format
  - `INVALID_SPACE_ID`: Invalid space ID format
- `401 Unauthorized`: Authentication required
- `429 Too Many Requests`: Rate limit exceeded
  - `RATE_LIMIT_EXCEEDED`: Maximum 20 requests per minute
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Update Note

**PUT** `/api/notes/update`

Updates an existing note's content.

**Request Body** (JSON):
```json
{
  "noteId": "note_1234567890",
  "content": "Updated note content",
  "title": "Updated title"
}
```

**Response** (200 OK):
```json
{
  "id": "note_1234567890",
  "content": "Updated note content",
  "title": "Updated title",
  "threadId": "thread_unorganized",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
  - `CONTENT_REQUIRED`: Content is required
  - `CONTENT_EMPTY`: Content cannot be empty
  - `CONTENT_TOO_LONG`: Content exceeds 50,000 characters
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note not found or doesn't belong to user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Delete Note

**DELETE** `/api/notes/delete?noteId=note_1234567890`

Deletes a note and revokes associated XP.

**Query Parameters**:
- `noteId` (required): Note ID to delete

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Note deleted successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing noteId parameter
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note not found or doesn't belong to user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Get Note Details

**GET** `/api/notes/[id]/details`

Gets detailed information about a specific note, including associated threads, comments, and tags.

**Path Parameters**:
- `id` (required): Note ID

**Response** (200 OK):
```json
{
  "note": {
    "id": "note_1234567890",
    "content": "Note content",
    "title": "Note title",
    "threadId": "thread_unorganized",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T11:00:00.000Z"
  },
  "threads": [
    {
      "id": "thread_abc123",
      "title": "My Thread",
      "count": 5
    }
  ],
  "comments": [],
  "tags": [
    {
      "id": "tag_xyz789",
      "name": "Bible Study"
    }
  ],
  "scriptureMetadata": null
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note not found or doesn't belong to user
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Add Note to Thread

**POST** `/api/notes/[id]/add-thread`

Adds a note to an additional thread via the junction table.

**Path Parameters**:
- `id` (required): Note ID

**Request Body** (JSON):
```json
{
  "threadId": "thread_abc123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Note added to thread successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid threadId or note already in thread
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note or thread not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Remove Note from Thread

**POST** `/api/notes/[id]/remove-thread`

Removes a note from a thread. If it's the last thread, the note becomes unorganized.

**Path Parameters**:
- `id` (required): Note ID

**Request Body** (JSON):
```json
{
  "threadId": "thread_abc123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Note removed from thread successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid threadId
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note or thread not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Get Recent Notes

**GET** `/api/notes/recent?limit=10`

Gets the most recently created notes for the authenticated user.

**Query Parameters**:
- `limit` (optional): Number of notes to return (default: 10, max: 100)

**Response** (200 OK):
```json
{
  "notes": [
    {
      "id": "note_1234567890",
      "content": "Recent note",
      "title": "Recent Title",
      "threadId": "thread_unorganized",
      "createdAt": "2025-01-15T12:00:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

## Threads

### Create Thread

**POST** `/api/threads/create`

Creates a new thread.

**Request Body** (FormData):
```
title: string (optional, defaults to "Untitled Thread", max 200 characters)
color?: string (optional, must be one of: paper, blue, yellow, orange, pink, purple, green)
isPublic?: boolean (default: false)
spaceId?: string (optional, format: "space_*")
selectedNoteIds?: string (optional, JSON array of note IDs to add to thread)
```

**Response** (200 OK):
```json
{
  "id": "thread_abc123",
  "title": "My Thread",
  "subtitle": null,
  "spaceId": null,
  "userId": "user_abc123",
  "isPublic": false,
  "color": "blue",
  "isPinned": false,
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
  - `TITLE_TOO_LONG`: Title exceeds 200 characters
  - `INVALID_COLOR`: Invalid color value
  - `INVALID_SPACE_ID`: Invalid space ID format
- `401 Unauthorized`: Authentication required
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Update Thread

**POST** `/api/threads/update`

Updates thread properties and manages associated notes.

**Request Body** (FormData):
```
id: string (required)
title: string (required, 1-200 characters)
color?: string (optional, must be valid thread color)
isPublic?: boolean (optional)
selectedNoteIds?: string (optional, JSON array of note IDs)
```

**Response** (200 OK):
```json
{
  "id": "thread_abc123",
  "title": "Updated Thread Title",
  "color": "green",
  "isPublic": false,
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
  - `TITLE_REQUIRED`: Title is required
  - `TITLE_EMPTY`: Title cannot be empty
  - `TITLE_TOO_LONG`: Title exceeds 200 characters
  - `INVALID_COLOR`: Invalid color value
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Thread not found or doesn't belong to user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Delete Thread

**DELETE** `/api/threads/delete?threadId=thread_abc123`

Deletes a thread and moves associated notes to the "Unorganized" thread.

**Query Parameters**:
- `threadId` (required): Thread ID to delete

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Thread deleted successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing threadId parameter
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Thread not found or doesn't belong to user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Get Thread Notes

**GET** `/api/threads/[threadId]/notes`

Gets all notes in a specific thread.

**Path Parameters**:
- `threadId` (required): Thread ID

**Response** (200 OK):
```json
{
  "notes": [
    {
      "id": "note_1234567890",
      "content": "Note content",
      "title": "Note title",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Thread not found or doesn't belong to user
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### List Threads

**GET** `/api/threads/list`

Gets all threads for the authenticated user.

**Response** (200 OK):
```json
{
  "threads": [
    {
      "id": "thread_abc123",
      "title": "My Thread",
      "color": "blue",
      "isPinned": false,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Ensure Unorganized Thread

**POST** `/api/threads/ensure-unorganized`

Ensures the "Unorganized" thread exists for the authenticated user. This is called automatically when needed.

**Response** (200 OK):
```json
{
  "id": "thread_unorganized",
  "title": "Unorganized",
  "exists": true
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

## Spaces

### Create Space

**POST** `/api/spaces/create`

Creates a new space and optionally assigns selected notes and threads to it.

**Request Body** (FormData):
```
title: string (required, 1-200 characters)
color?: string (optional, must be valid thread color, default: "paper")
isPublic?: boolean (optional, default: false)
selectedNoteIds?: string (optional, JSON array)
selectedThreadIds?: string (optional, JSON array)
```

**Response** (200 OK):
```json
{
  "id": "space_xyz789",
  "title": "My Space",
  "color": "paper",
  "isPublic": false,
  "backgroundGradient": "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)",
  "userId": "user_abc123",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
  - `TITLE_REQUIRED`: Title is required
  - `TITLE_EMPTY`: Title cannot be empty
  - `TITLE_TOO_LONG`: Title exceeds 200 characters
  - `INVALID_COLOR`: Invalid color value
- `401 Unauthorized`: Authentication required
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Delete Space

**DELETE** `/api/spaces/delete?spaceId=space_xyz789`

Deletes a space and all associated threads and notes.

**Query Parameters**:
- `spaceId` (required): Space ID to delete

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Space deleted successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing spaceId parameter
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Space not found or doesn't belong to user
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Get Space Items

**GET** `/api/spaces/items`

Gets all spaces, threads, and notes for the authenticated user.

**Response** (200 OK):
```json
{
  "spaces": [
    {
      "id": "space_xyz789",
      "title": "My Space",
      "totalItemCount": 10
    }
  ],
  "threads": [
    {
      "id": "thread_abc123",
      "title": "My Thread",
      "noteCount": 5
    }
  ],
  "notes": [
    {
      "id": "note_1234567890",
      "title": "My Note"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Update Space

**POST** `/api/spaces/[spaceId]/update`

Updates space properties.

**Path Parameters**:
- `spaceId` (required): Space ID

**Request Body** (FormData):
```
title?: string (optional, 1-200 characters)
color?: string (optional, must be valid thread color)
isPublic?: boolean (optional)
```

**Response** (200 OK):
```json
{
  "id": "space_xyz789",
  "title": "Updated Space Title",
  "color": "blue",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Space not found or doesn't belong to user
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Add Items to Space

**POST** `/api/spaces/[spaceId]/add-items`

Adds notes and/or threads to a space.

**Path Parameters**:
- `spaceId` (required): Space ID

**Request Body** (FormData):
```
noteIds?: string (optional, JSON array)
threadIds?: string (optional, JSON array)
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Items added to space successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Space not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Remove Items from Space

**POST** `/api/spaces/[spaceId]/remove-items`

Removes notes and/or threads from a space.

**Path Parameters**:
- `spaceId` (required): Space ID

**Request Body** (FormData):
```
noteIds?: string (optional, JSON array)
threadIds?: string (optional, JSON array)
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Items removed from space successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Space not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

## User

### Get User Profile

**GET** `/api/user/get-profile`

Gets the authenticated user's profile data, including cached Clerk data and church information.

**Response** (200 OK):
```json
{
  "userId": "user_abc123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "displayName": "John D",
  "userColor": "blue",
  "profileImageUrl": "https://...",
  "emailVerified": true,
  "churchData": {
    "churchName": "My Church",
    "churchCity": "City",
    "churchState": "State"
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Update User Profile

**POST** `/api/user/update-profile`

Updates user's first name, last name, and color preference.

**Request Body** (JSON):
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "color": "blue"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Profile updated successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
  - `FIRST_NAME_REQUIRED`: First name is required
  - `LAST_NAME_REQUIRED`: Last name is required
  - `FIRST_NAME_TOO_LONG`: First name exceeds 100 characters
  - `LAST_NAME_TOO_LONG`: Last name exceeds 100 characters
  - `INVALID_COLOR`: Invalid color value
- `401 Unauthorized`: Authentication required
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Update Church Information

**POST** `/api/user/update-church`

Updates user's church information.

**Request Body** (JSON):
```json
{
  "churchName": "My Church",
  "churchCity": "City",
  "churchState": "State"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Church information updated successfully"
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Update Credentials

**POST** `/api/user/update-credentials`

Updates user's email and/or password via Clerk.

**Request Body** (JSON):
```json
{
  "email": "newemail@example.com",
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Credentials updated successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input or Clerk validation error
  - `form_password_incorrect`: Current password is incorrect
  - `form_password_pwned`: Password found in data breach
  - `form_password_too_common`: Password is too common
  - `form_email_address_invalid`: Invalid email address
  - `form_email_address_already_exists`: Email already in use
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Get User XP

**GET** `/api/user/xp`

Gets user's XP (experience points) data.

**Response** (200 OK):
```json
{
  "totalXP": 150,
  "level": 2,
  "xpHistory": [
    {
      "id": "xp_123",
      "amount": 10,
      "reason": "note_created",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Delete Account

**DELETE** `/api/user/delete-account`

Deletes the user's account and all associated data.

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Clear Data

**DELETE** `/api/user/clear-data`

Clears all user data but keeps the account.

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Data cleared successfully"
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

## Tags

### Create Tag

**POST** `/api/tags/create`

Creates a new tag.

**Request Body** (FormData):
```
name: string (required, 1-50 characters)
```

**Response** (200 OK):
```json
{
  "id": "tag_xyz789",
  "name": "Bible Study",
  "userId": "user_abc123",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input or tag already exists
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### List Tags

**GET** `/api/tags/list`

Gets all tags for the authenticated user.

**Response** (200 OK):
```json
{
  "tags": [
    {
      "id": "tag_xyz789",
      "name": "Bible Study",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Delete Tag

**DELETE** `/api/tags/delete?tagId=tag_xyz789`

Deletes a tag and removes all associations with notes.

**Query Parameters**:
- `tagId` (required): Tag ID to delete

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Tag deleted successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing tagId parameter
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Tag not found or doesn't belong to user
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

## Note Tags

### Assign Tag to Note

**POST** `/api/note-tags/assign`

Assigns a tag to a note.

**Request Body** (JSON):
```json
{
  "noteId": "note_1234567890",
  "tagId": "tag_xyz789"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Tag assigned successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input or tag already assigned
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note or tag not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Remove Tag from Note

**POST** `/api/note-tags/remove`

Removes a tag from a note.

**Request Body** (JSON):
```json
{
  "noteId": "note_1234567890",
  "tagId": "tag_xyz789"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Tag removed successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note or tag not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### List Note Tags

**GET** `/api/note-tags/list?noteId=note_1234567890`

Gets all tags for a specific note.

**Query Parameters**:
- `noteId` (required): Note ID

**Response** (200 OK):
```json
{
  "tags": [
    {
      "id": "tag_xyz789",
      "name": "Bible Study"
    }
  ]
}
```

**Error Responses**:
- `400 Bad Request`: Missing noteId parameter
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Note not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

## Search

### Search

**GET** `/api/search?q=query&type=all&limit=50`

Searches notes and threads by content and title.

**Query Parameters**:
- `q` (required): Search query
- `type` (optional): `"all"` | `"notes"` | `"threads"` (default: `"all"`)
- `limit` (optional): Maximum results (default: 50, max: 100)

**Response** (200 OK):
```json
{
  "results": [
    {
      "type": "note",
      "id": "note_1234567890",
      "title": "Search Result Note",
      "content": "Matching content...",
      "threadId": "thread_abc123"
    },
    {
      "type": "thread",
      "id": "thread_abc123",
      "title": "Search Result Thread"
    }
  ]
}
```

**Error Responses**:
- `400 Bad Request`: Missing query parameter
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

## Scripture

### Fetch Verse

**POST** `/api/scripture/fetch-verse`

Fetches scripture verse text from Bible.org API.

**Request Body** (JSON):
```json
{
  "reference": "John 3:16"
}
```

**Response** (200 OK):
```json
{
  "reference": "John 3:16",
  "text": "For God so loved the world...",
  "version": "ESV"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid reference format
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error or Bible.org API error

**Rate Limit**: 100 requests/minute (read operation)

---

### Detect Scripture References

**POST** `/api/scripture/detect`

Detects scripture references in text content.

**Request Body** (JSON):
```json
{
  "content": "Check out John 3:16 and Romans 8:28"
}
```

**Response** (200 OK):
```json
{
  "references": [
    {
      "reference": "John 3:16",
      "normalized": "John 3:16"
    },
    {
      "reference": "Romans 8:28",
      "normalized": "Romans 8:28"
    }
  ]
}
```

**Error Responses**:
- `400 Bad Request`: Missing content
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Check Existing Scripture

**GET** `/api/scripture/check-existing?reference=John 3:16`

Checks if scripture metadata already exists for a reference.

**Query Parameters**:
- `reference` (required): Scripture reference

**Response** (200 OK):
```json
{
  "exists": true,
  "metadata": {
    "id": "scripture_123",
    "reference": "John 3:16",
    "normalizedReference": "John 3:16"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing reference parameter
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

## Navigation

### Get Navigation Data

**GET** `/api/navigation/data`

Gets navigation data including spaces, threads, and inbox count.

**Response** (200 OK):
```json
{
  "spaces": [
    {
      "id": "space_xyz789",
      "title": "My Space",
      "totalItemCount": 10,
      "backgroundGradient": "linear-gradient(...)"
    }
  ],
  "threads": [
    {
      "id": "thread_abc123",
      "title": "My Thread",
      "noteCount": 5,
      "backgroundGradient": "linear-gradient(...)"
    }
  ],
  "inboxCount": 3
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

## Inbox

### Get Inbox Preview

**GET** `/api/inbox/preview`

Gets preview of inbox items.

**Response** (200 OK):
```json
{
  "items": [
    {
      "id": "inbox_123",
      "title": "Inbox Item",
      "content": "Item content...",
      "isActive": true
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error

**Rate Limit**: 100 requests/minute (read operation)

---

### Add to Harvous

**POST** `/api/inbox/add-to-harvous`

Adds an inbox item to Harvous as a note or thread.

**Request Body** (FormData):
```
inboxItemId: string (required)
asNote?: boolean (default: true)
threadId?: string (optional)
```

**Response** (200 OK):
```json
{
  "success": true,
  "noteId": "note_1234567890",
  "threadId": "thread_abc123"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Inbox item not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Archive Inbox Item

**POST** `/api/inbox/archive`

Archives an inbox item.

**Request Body** (JSON):
```json
{
  "inboxItemId": "inbox_123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Item archived successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing inboxItemId
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Inbox item not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

### Unarchive Inbox Item

**POST** `/api/inbox/unarchive`

Unarchives an inbox item.

**Request Body** (JSON):
```json
{
  "inboxItemId": "inbox_123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Item unarchived successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Missing inboxItemId
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Inbox item not found
- `500 Internal Server Error`: Server error

**Rate Limit**: 20 requests/minute (write operation)

---

## Error Codes

### Standard Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Error Code Reference

#### Authentication Errors
- `AUTH_REQUIRED`: Authentication required (401)

#### Validation Errors
- `CONTENT_REQUIRED`: Content is required
- `CONTENT_EMPTY`: Content cannot be empty
- `CONTENT_TOO_LONG`: Content exceeds maximum length (50,000 characters)
- `TITLE_REQUIRED`: Title is required
- `TITLE_EMPTY`: Title cannot be empty
- `TITLE_TOO_LONG`: Title exceeds maximum length (200 characters)
- `FIRST_NAME_REQUIRED`: First name is required
- `LAST_NAME_REQUIRED`: Last name is required
- `FIRST_NAME_TOO_LONG`: First name exceeds maximum length (100 characters)
- `LAST_NAME_TOO_LONG`: Last name exceeds maximum length (100 characters)
- `INVALID_COLOR`: Invalid color value (must be one of: paper, blue, yellow, orange, pink, purple, green)
- `INVALID_NOTE_TYPE`: Invalid note type (must be: default, scripture, or resource)
- `INVALID_THREAD_ID`: Invalid thread ID format
- `INVALID_SPACE_ID`: Invalid space ID format
- `USER_ID_MISMATCH`: User ID mismatch

#### Rate Limiting Errors
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded (429)
  - Read operations: 100 requests/minute
  - Write operations: 20 requests/minute

#### Clerk Errors (for credential updates)
- `form_password_incorrect`: Current password is incorrect
- `form_password_pwned`: Password found in data breach
- `form_password_too_common`: Password is too common
- `form_email_address_invalid`: Invalid email address
- `form_email_address_already_exists`: Email already in use

#### HTTP Status Codes
- `200 OK`: Request successful
- `400 Bad Request`: Invalid input or validation error
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Resource not found or doesn't belong to user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

## Rate Limiting

### Limits

- **Read Operations**: 100 requests per minute
- **Write Operations**: 20 requests per minute

### Rate Limit Headers

When rate limited, responses include:

```
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705315200000
```

### Rate Limited Endpoints

**Read Operations** (100 req/min):
- GET `/api/notes/[id]/details`
- GET `/api/notes/recent`
- GET `/api/threads/list`
- GET `/api/threads/[threadId]/notes`
- GET `/api/spaces/items`
- GET `/api/user/get-profile`
- GET `/api/user/xp`
- GET `/api/tags/list`
- GET `/api/note-tags/list`
- GET `/api/search`
- GET `/api/scripture/check-existing`
- GET `/api/navigation/data`
- GET `/api/inbox/preview`

**Write Operations** (20 req/min):
- POST `/api/notes/create`
- PUT `/api/notes/update`
- DELETE `/api/notes/delete`
- POST `/api/notes/[id]/add-thread`
- POST `/api/notes/[id]/remove-thread`
- POST `/api/threads/create`
- POST `/api/threads/update`
- DELETE `/api/threads/delete`
- POST `/api/spaces/create`
- DELETE `/api/spaces/delete`
- POST `/api/spaces/[spaceId]/update`
- POST `/api/spaces/[spaceId]/add-items`
- POST `/api/spaces/[spaceId]/remove-items`
- POST `/api/user/update-profile`
- POST `/api/user/update-church`
- POST `/api/user/update-credentials`
- POST `/api/tags/create`
- DELETE `/api/tags/delete`
- POST `/api/note-tags/assign`
- POST `/api/note-tags/remove`
- POST `/api/inbox/add-to-harvous`
- POST `/api/inbox/archive`
- POST `/api/inbox/unarchive`

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- All IDs follow the pattern: `{type}_{timestamp}_{random}`
- Content is HTML-encoded and sanitized
- Auto-tagging and XP awards are non-critical operations (won't fail the main request)
- Scripture metadata creation is non-critical (won't fail note creation)

---

**Last Updated**: January 2025

