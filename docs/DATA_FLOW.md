# Data Flow

Complete documentation of data flows in Harvous, including sequence diagrams for key operations and event-driven update patterns.

## Note Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant NewNotePanel
    participant TiptapEditor
    participant API
    participant Database
    participant XPSystem
    participant AutoTagger
    participant NavigationColumn

    User->>NewNotePanel: Click "Add Note"
    NewNotePanel->>TiptapEditor: Render editor
    User->>TiptapEditor: Write content
    User->>NewNotePanel: Click "Create"

    NewNotePanel->>API: POST /api/notes/create

    API->>Database: Get highestSimpleNoteId
    Database-->>API: Return N042

    API->>Database: Insert note with simpleNoteId=43
    API->>Database: Update highestSimpleNoteId=43
    API->>Database: Insert into NoteThreads

    API->>XPSystem: Award XP (10 for note)
    XPSystem->>Database: Insert UserXP record

    API->>AutoTagger: Generate tags (async)
    AutoTagger->>Database: Insert NoteTags

    API-->>NewNotePanel: Return note data

    NewNotePanel->>NavigationColumn: Dispatch "noteCreated" event
    NavigationColumn->>NavigationColumn: Update note count

    NewNotePanel->>User: Redirect to note page

    Note over User,NavigationColumn: Astro View Transition refreshes page
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Middleware
    participant Clerk
    participant AstroPage
    participant Database
    participant UserCache

    Browser->>Middleware: Request /dashboard
    Middleware->>Clerk: Check auth status

    alt Not Authenticated
        Clerk-->>Middleware: No userId
        Middleware-->>Browser: Redirect to /sign-in
    else Authenticated
        Clerk-->>Middleware: Return userId
        Middleware->>AstroPage: Continue with userId

        AstroPage->>UserCache: getCachedUserData(userId)

        alt Cache fresh (<1 hour)
            UserCache->>Database: Query UserMetadata
            Database-->>UserCache: Return cached data
            UserCache-->>AstroPage: Return user data
        else Cache stale
            UserCache->>Clerk: Fetch fresh user data
            Clerk-->>UserCache: Return user data
            UserCache->>Database: Update UserMetadata
            UserCache-->>AstroPage: Return fresh data
        end

        AstroPage-->>Browser: Render page with user data
    end
```

## Event-Driven Updates

```mermaid
graph LR
    Action[User Action] --> API[API Call]
    API --> DB[(Database)]
    API --> Event[CustomEvent Dispatch]

    Event --> Nav[NavigationColumn]
    Event --> Panel[Panel Components]
    Event --> List[Content Lists]

    Nav --> Update1[Update Counts]
    Panel --> Update2[Close/Open]
    List --> Update3[Refresh Items]

    style Event fill:#ffd700,stroke:#333,stroke-width:2px
    style DB fill:#4caf50,stroke:#333,stroke-width:2px
```

### Key Events

- `noteCreated` → Update navigation counts, refresh lists
- `noteDeleted` → Update counts, remove from view
- `threadCreated` → Add to navigation
- `threadDeleted` → Remove from navigation
- `spaceCreated` → Add to navigation
- `openNewNotePanel` / `closeNewNotePanel` → Panel visibility
- `noteAddedToThread` / `noteRemovedFromThread` → Thread counts

## Thread Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant NewThreadPanel
    participant API
    participant Database
    participant XPSystem
    participant NavigationColumn

    User->>NewThreadPanel: Click "Add Thread"
    User->>NewThreadPanel: Fill form (title, color, space)
    User->>NewThreadPanel: Click "Create"

    NewThreadPanel->>API: POST /api/threads/create
    API->>Database: Insert thread
    API->>Database: Update space counts

    API->>XPSystem: Award XP (10 for thread)
    XPSystem->>Database: Insert UserXP record

    API-->>NewThreadPanel: Return thread data

    NewThreadPanel->>NavigationColumn: Dispatch "threadCreated" event
    NewThreadPanel->>NavigationColumn: Update localStorage synchronously
    NavigationColumn->>NavigationColumn: Update navigation display

    NewThreadPanel->>User: Redirect to thread page
```

## Note Update Flow

```mermaid
sequenceDiagram
    participant User
    participant CardFullEditable
    participant TiptapEditor
    participant API
    participant Database
    participant AutoTagger

    User->>CardFullEditable: Click to edit
    CardFullEditable->>TiptapEditor: Enable editing mode
    User->>TiptapEditor: Modify content
    User->>CardFullEditable: Click "Save"

    CardFullEditable->>API: POST /api/notes/update
    API->>Database: Update note content/title
    API->>Database: Update updatedAt timestamp

    API->>AutoTagger: Re-analyze tags (async)
    AutoTagger->>Database: Update NoteTags if needed

    API-->>CardFullEditable: Return updated note
    CardFullEditable->>CardFullEditable: Exit edit mode
    CardFullEditable->>User: Display updated content
```

## Multi-Thread Note Management

```mermaid
sequenceDiagram
    participant User
    participant NoteDetailsPanel
    participant API
    participant Database
    participant NavigationColumn

    User->>NoteDetailsPanel: Click "Add to Thread"
    NoteDetailsPanel->>NoteDetailsPanel: Show thread selector
    User->>NoteDetailsPanel: Select thread
    User->>NoteDetailsPanel: Click "Add"

    NoteDetailsPanel->>API: POST /api/notes/[id]/add-thread
    API->>Database: Insert into NoteThreads junction table
    API->>Database: Check if note was unorganized
    alt Note was unorganized
        API->>Database: Note automatically removed from unorganized
    end

    API-->>NoteDetailsPanel: Return success
    NoteDetailsPanel->>NavigationColumn: Dispatch "noteAddedToThread" event
    NavigationColumn->>NavigationColumn: Update thread counts

    NoteDetailsPanel->>User: Show updated thread list
```

## Scripture Detection Flow

```mermaid
sequenceDiagram
    participant User
    participant TiptapEditor
    participant API
    participant ScriptureDetector
    participant Database
    participant NavigationColumn

    User->>TiptapEditor: Type "John 3:16"
    User->>TiptapEditor: Save note
    TiptapEditor->>API: POST /api/notes/create (with content)

    API->>Database: Save note
    API->>ScriptureDetector: Detect references in content
    ScriptureDetector->>ScriptureDetector: Parse "John 3:16"
    ScriptureDetector->>Database: Check if scripture note exists
    alt Scripture note doesn't exist
        ScriptureDetector->>API: Create scripture note
        API->>Database: Insert scripture note
        API->>Database: Insert ScriptureMetadata
    end
    ScriptureDetector->>Database: Link scripture note to current note's thread

    API-->>TiptapEditor: Return note with scripture metadata
    TiptapEditor->>TiptapEditor: Convert references to pills
    TiptapEditor->>User: Display pills in editor
```

## Auto-Tagging Flow

```mermaid
sequenceDiagram
    participant API
    participant AutoTagger
    participant KeywordDatabase
    participant Database

    API->>AutoTagger: Trigger auto-tagging (async)
    AutoTagger->>AutoTagger: Extract text from note content
    AutoTagger->>KeywordDatabase: Search 1000+ biblical keywords
    KeywordDatabase-->>AutoTagger: Return matches with confidence scores

    AutoTagger->>AutoTagger: Filter by confidence (>80%)
    AutoTagger->>AutoTagger: Deduplicate and detect overlaps
    AutoTagger->>Database: Insert NoteTags with isAutoGenerated=true

    Note over API,Database: Tags applied automatically after note creation
```

## Navigation History Flow

```mermaid
sequenceDiagram
    participant User
    participant Layout
    participant localStorage
    participant NavigationColumn
    participant ReactContext

    User->>Layout: Navigate to thread/space
    Layout->>localStorage: Read navigation history
    localStorage-->>Layout: Return last 5 items
    Layout->>NavigationColumn: Render navigation items

    User->>NavigationColumn: Click navigation item
    NavigationColumn->>ReactContext: Update active state
    NavigationColumn->>localStorage: Update last accessed timestamp
    NavigationColumn->>User: Navigate to item

    alt Create new thread/space
        User->>API: Create thread/space
        API-->>User: Return new item
        User->>localStorage: Add to navigation (synchronous)
        User->>NavigationColumn: Dispatch "threadCreated" event
        NavigationColumn->>NavigationColumn: Refresh from localStorage
    end
```

## XP Award Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant XPSystem
    participant Database
    participant ProfilePage

    User->>API: Create note/thread or open note
    API->>XPSystem: Check if XP already awarded
    XPSystem->>Database: Query UserXP for activity

    alt XP not yet awarded
        XPSystem->>Database: Check daily caps
        alt Under daily cap
            XPSystem->>Database: Insert UserXP record
            XPSystem->>Database: Update user total XP
        else Over daily cap
            XPSystem->>XPSystem: Skip XP award
        end
    else XP already awarded
        XPSystem->>XPSystem: Skip duplicate award
    end

    API-->>User: Return success
    User->>ProfilePage: View profile
    ProfilePage->>API: GET /api/user/xp
    API->>Database: Query UserXP records
    Database-->>API: Return XP breakdown
    API-->>ProfilePage: Return XP data
    ProfilePage->>User: Display XP total and breakdown
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [COMPONENTS.md](./COMPONENTS.md) - Component system details
- [API.md](./API.md) - API endpoint documentation
- [DATABASE.md](./DATABASE.md) - Database schema and relationships

