# How Harvous Works: A Complete Guide

This document explains how Harvous works, why decisions were made, and how all the pieces fit together. It's written for non-technical readers who want to understand the app's architecture and design philosophy.

---

## Table of Contents

1. [What is Harvous?](#what-is-harvous)
2. [The Big Picture: How Everything Connects](#the-big-picture)
3. [Why We Built It This Way](#why-we-built-it-this-way)
4. [The Three-Layer Organization System](#the-three-layer-organization-system)
5. [How Content Flows Through the System](#how-content-flows-through-the-system)
6. [The Technology Choices and Why They Matter](#the-technology-choices)
7. [User Experience Decisions](#user-experience-decisions)
8. [Data Safety and Security](#data-safety-and-security)
9. [Mobile vs Desktop: One App, Two Experiences](#mobile-vs-desktop)
10. [The Future: How the System Grows](#the-future)

---

## What is Harvous?

Harvous is a Bible study notes application designed specifically for people who want to organize their spiritual study in a meaningful way. Unlike generic note-taking apps, Harvous understands that Bible study has unique needs:

- **Scripture references** need special handling
- **Study topics** often connect across multiple themes
- **Personal reflections** need to be preserved forever
- **Group study** requires collaboration
- **Visual organization** helps you find things quickly

Think of Harvous like a digital filing cabinet specifically designed for Bible study, where:
- **Spaces** are like the main drawers (Bible Study, Prayer Journal, Sermon Notes)
- **Threads** are like collections within those drawers (Gospel of John, Romans Study, Daily Prayers)
- **Notes** are like individual documents in those collections (your thoughts, insights, and reflections)

---

## The Big Picture: How Everything Connects

### The User's Journey

When you use Harvous, here's what happens behind the scenes:

1. **You sign in** → The app verifies who you are (using Clerk authentication)
2. **You see your dashboard** → The app loads your spaces, threads, and notes from the database
3. **You create content** → The app saves it immediately and gives you XP points
4. **You organize content** → The app updates relationships between notes and threads
5. **You search** → The app finds your content using smart matching algorithms
6. **You navigate** → The app remembers where you've been and shows recent items

### The System Architecture (In Simple Terms)

Imagine Harvous as a house with three main rooms:

**Room 1: The Front End (What You See)**
- This is the website you interact with
- Built as a React SPA with a native-like shell
- Like the furniture and decorations in your house - it's what makes the space usable

**Room 2: The Back End (The Brain)**
- This is where all the logic happens
- API endpoints that handle creating, updating, and deleting content
- Like the electrical and plumbing systems - you don't see them, but everything depends on them

**Room 3: The Database (The Memory)**
- This is where all your content is stored permanently
- Uses Supabase Postgres (a managed cloud database) to store everything safely
- Like a filing cabinet that never loses anything

**The Security System: Clerk**
- Handles authentication (signing in, verifying who you are)
- Like a doorman who only lets you into your own apartment
- Your data is completely isolated from other users

---

## Why We Built It This Way

### Decision 1: Hierarchical Organization (Spaces → Threads → Notes)

**Why:** Bible study naturally organizes itself in layers. You might have a "Bible Study" space containing multiple Threads (Gospel of John, Romans, etc.), and each Thread contains multiple notes.

**The Problem We Solved:** Generic note apps force you into flat lists or rigid filing hierarchies. Bible study needs flexibility - sometimes you want to see all notes about "faith" across different threads, sometimes you want to focus on one specific study.

**How It Works:** 
- Spaces are top-level containers (like project workspaces)
- Threads are collections within spaces (nested groupings for a study or topic)
- Notes can belong to multiple threads (many-to-many relationships)
- This gives you the flexibility to organize however makes sense

**Example:** A note about "God's love" might belong to both "Romans Study" and "Personal Growth" threads, so you can find it from either context.

### Decision 2: Sequential Note IDs (N001, N002, N003...)

**Why:** Traditional database IDs are long, random strings like `note_1756318000001`. These are confusing for users and make it hard to reference notes in conversation.

**The Problem We Solved:** Users need simple, memorable IDs they can reference. "Check out my insight in N015" is much better than "Check out note_1756318000001".

**How It Works:**
- Each user gets their own sequential numbering starting at N001
- When you create a note, it gets the next number (N001, N002, N003...)
- **Critical:** Deleted note IDs are NEVER reused
- If you delete N003, the next note is N004 (not N003 again)
- This prevents confusion and maintains data integrity

**Why Never Reuse IDs:** Imagine if you deleted N003, then later created a new note that also got N003. You might think it's your old note, but it's actually new content. This could cause serious confusion.

### Decision 3: Color-Coded Organization

**Why:** Visual organization helps you find things quickly. When you see a blue space in your navigation, you immediately know it's your "Bible Study" space.

**The Problem We Solved:** Long lists of text are hard to scan. Colors provide instant visual recognition.

**How It Works:**
- Spaces and threads get unique colors from an 8-color palette
- Colors appear in navigation, headers, and buttons
- You choose colors when creating spaces/threads
- Colors help you navigate quickly without reading every label

**The Color Palette:** We chose 8 pastel colors (Paper, Blessed Blue, Mindful Mint, Graceful Gold, Pleasant Peach, Caring Coral, Peaceful Pink, Lovely Lavender) because:
- They're soft and calming (better for extended reading)
- They don't compete with content for attention
- They provide enough variety without being overwhelming

### Decision 4: React SPA (Single-Page Application) Architecture

**Why:** As the authenticated app grew more complex, the React Islands + Astro SSR model added friction. Every navigation required a full server round-trip. Moving to a full React SPA gives instant client-side navigation, persistent state across route changes, and a more native app-like feel — especially on mobile PWA.

**The Problem We Solved:** Astro SSR required server rendering for every page navigation, which introduced latency and made smooth route transitions difficult. The mobile PWA experience also needed faster response to touch inputs.

**How It Works:**
- The bundled **Hono API** handles `/api/*`, authentication checks, and database access
- The **React SPA** handles the authenticated and public web routes as a client-side single-page application
- TanStack Router manages client-side routing — navigating between dashboard, threads, notes, and spaces never triggers a full page reload
- TanStack Query caches server data so navigating back to a page you've already visited is instant

**Think of it like:** The Hono API is the building's plumbing and electrical. The React SPA is the app you live
in — loaded once and updating as you navigate.

**Benefits:**
- Navigation is instant (client-side, no server round-trip)
- No empty-state flash when revisiting pages (data cached by TanStack Query)
- Smooth route transition animations (fade + slide)
- Mobile PWA feels like a native app
- Shared components (`src/components/react/`) are reused by SPA surfaces

### Decision 5: Many-to-Many Note-Thread Relationships

**Why:** Real Bible study doesn't fit into rigid categories. A note about "faith" might belong to both "Romans Study" and "Personal Growth" threads.

**The Problem We Solved:** Traditional note apps force you to choose one category. But Bible study topics naturally overlap.

**How It Works:**
- Notes can belong to multiple threads simultaneously
- When you add a note to a thread, it creates a relationship (not a move)
- Removing a note from a thread doesn't delete it - it just removes that relationship
- If a note has no thread relationships, it becomes "unorganized"

**Example:** You create a note about "God's grace" in your "Romans Study" thread. Later, you realize it also fits your "Personal Growth" thread. You can add it to both without duplicating the note.

### Decision 6: Note Preservation (Never Delete)

**Why:** Accidental deletion is devastating. You might delete a thread thinking you don't need it, then realize later you lost important insights.

**The Problem We Solved:** Users need confidence that their content is safe. Deletion should be reversible or at least preserve the content.

**How It Works:**
- When you delete a thread, all its notes are moved to "My Pile" (not deleted)
- Notes are never permanently deleted from the database
- You can always recover content by looking in "My Pile"
- This gives you safety without cluttering your active organization

**Why This Matters:** Bible study insights are precious. A note you wrote months ago might become relevant again. We preserve everything so you never lose your spiritual journey.

### Decision 7: XP Gamification System

**Why:** Creating content consistently is hard. Gamification provides motivation and makes the app more engaging.

**The Problem We Solved:** Users need encouragement to build the habit of regular Bible study note-taking.

**How It Works:**
- You earn XP (Experience Points) for activities:
  - Creating a thread: 10 XP
  - Creating a note: 10 XP
  - Opening notes/threads: 1 XP (capped at 50 per day to prevent gaming)
  - First note of the day: +5 XP bonus
- XP is tracked in your profile
- Future: Levels, badges, achievements based on XP

**Why Daily Caps:** Without caps, users could "game" the system by rapidly opening and closing notes. The 50 XP daily cap encourages genuine engagement without rewarding empty actions.

### Decision 8: Persistent Navigation

**Why:** You frequently switch between spaces and threads. Having to navigate through menus every time is slow and frustrating.

**The Problem We Solved:** Users need quick access to recently used content without navigating through the full hierarchy.

**How It Works:**
- The app tracks your recently accessed spaces and threads
- Shows the last 5-10 items in a sidebar navigation
- Uses localStorage (browser storage) to remember across sessions
- Active item (what you're currently viewing) is highlighted

**Why localStorage:** It's fast, works offline, and doesn't require database queries. The navigation updates instantly when you access new content.

### Decision 9: My Home ownership and Shared Spaces

**Why:** Studying together should not make people give up ownership of their notes or create several stale copies.

**How it works:**

- **My Home is complete.** Every note you author remains in your private My Home aggregate.
- A shared space is a live audience and organization context. `SpaceNotes` associates your canonical note with
  that context; the space does not become the note's owner.
- One note can appear in several spaces. Each space independently stores folders, pins, order, Threads, and
  responses.
- **My Home compose** creates privately. **This space compose** creates the Home note plus its association.
- Authors use **Add to space**. Non-authors use **Save a copy**, which creates an attributed independent note.

**Conversation and Activity:**

- A member can select a passage on another person's read-only note and leave a response.
- Persistent response overlays appear only while reading in that shared space.
- My Home shows responses in **Note Activity**, grouped by space.
- Note Activity is not the same as space activity or the “new since your visit” watermark.
- When a durable response anchor no longer matches after an edit, Activity says **Passage changed**.
- Note version history is available only to the author.

**Threads:** The owner uses **Start a Thread** and selects one current Thread. Members can view it and attach
their own notes that are active in the space. Internal identifiers such as `StudyThreadEntries` describe response
storage, not a user-facing feature name.

**Lifecycle and privacy:**

- Leaving or removal archives a person's authored associations and preserves their responses on other people's
  notes.
- Re-sharing restores responses but not stale folders, pins, or Thread placement.
- Deleting a shared space hides and revokes it immediately. The owner can restore it from Settings for 30 days;
  after that, space data is purged while canonical notes remain.
- Encrypted notes never enter a shared context. Invite preview is metadata-only, and non-owner member responses
  do not expose email.
- Public-link controls stay hidden in shared context. My Home warns before making an associated note public.
- Creating/hosting requires the Shared Spaces add-on; joining is free.

---

## The Three-Layer Organization System

### Layer 1: Spaces (The Big Picture)

**What They Are:** Top-level containers that hold everything related to a major study area.

**Examples:**
- "Bible Study" - Your main study space
- "Prayer Journal" - Personal prayer notes
- "Church Small Group" - Shared group study
- "Sermon Notes" - Church service insights

**Key Features:**
- Private spaces and dedicated Shared Spaces are created through separate flows; there is no privacy toggle that
  converts one into the other
- Get a **custom color** for visual recognition
- Show **total item count** (threads + notes)
- Can contain both threads and individual notes

**Why This Matters:** Spaces let you separate different aspects of your spiritual life. Your personal study stays separate from group study, which stays separate from sermon notes.

### Layer 2: Threads (The Collections)

**What They Are:** Collections of related notes within a space. Think of them as study topics or themes.

**Examples:**
- "Gospel of John" - All notes about John's Gospel
- "Romans 8 Study" - Deep dive into Romans 8
- "Daily Prayers" - Your prayer journal entries
- "Prayer Requests" - Intercession list

**Key Features:**
- Belong to a space (or can be unorganized)
- Get a **custom color** (different from their space)
- Show **note count** (how many notes in the thread)
- Can be **pinned** to appear at the top
- Notes can belong to **multiple threads** (many-to-many)

**Why This Matters:** Threads let you organize notes by topic while keeping them within a larger context. A "Romans Study" thread in your "Bible Study" space keeps all Romans-related notes together.

### Layer 3: Notes (The Content)

**What They Are:** Individual pieces of content - your thoughts, insights, reflections, and study notes.

**Examples:**
- "John 3:16 Reflection" - Your thoughts on a verse
- "Prayer for Healing" - A prayer request
- "Sermon Notes - Jan 15" - Church service notes
- "Cross-reference: Faith" - Connecting different verses

**Key Features:**
- **Sequential IDs** (N001, N002, N003...) that never change
- **Rich text content** with formatting (bold, italic, lists)
- Can belong to **multiple threads** simultaneously
- Can exist **directly in a space** (not in any thread)
- **Never deleted** - moved to "My Pile" if thread is deleted

**Why This Matters:** Notes are your actual content. They're what you create, what you search for, and what you reference. The ID system makes them easy to reference, and the preservation system ensures you never lose them.

---

## How Content Flows Through the System

### Creating a Note: The Complete Journey

1. **You click "Add Note"**
   - The NewNotePanel opens (a React component)
   - You see a rich text editor (TiptapEditor)

2. **You write your content**
   - The editor saves your typing in real-time (local state)
   - You can format text (bold, italic, lists)
   - You select which thread to add it to

3. **You click "Create"**
   - The app validates your content (can't be empty)
   - It gets your next sequential ID (e.g., N042)
   - It creates the note in the database
   - It updates your `highestSimpleNoteId` (so next note is N043)
   - It creates the note-thread relationship
   - It awards you 10 XP for creating a note
   - It checks if this is your first note today (+5 XP bonus)

4. **The app redirects you**
   - After 100ms (for smooth UX), you're taken to the new note page
   - You see a success toast notification
   - The navigation updates to show the new note count

5. **Behind the scenes**
   - Auto-tagging runs (detects biblical keywords and adds tags)
   - Scripture detection runs (finds Bible references)
   - Search index updates (so you can find it later)

### Creating a Thread: The Complete Journey

1. **You click "Add Thread"**
   - The NewThreadPanel opens
   - You see the Thread form for the current context

2. **You fill out the form**
   - You type a title (e.g., "Gospel of John")
   - You select a color (e.g., Lovely Lavender)
   - You can search for existing notes to add

3. **You click "Create"**
   - The app validates your input
   - It creates the thread in the database
   - It awards you 10 XP for creating a thread
   - It adds the thread to your navigation (localStorage)
   - It converts the color to a CSS gradient for display

4. **The app redirects you**
   - After 100ms, you're taken to the new thread page
   - You see the thread with its color in the header
   - The navigation shows the thread with its color

### Searching for Content: The Complete Journey

1. **You type in the search box**
   - The app sends your query to the search API
   - The API searches across notes and threads

2. **The search algorithm works**
   - **Title matches** get highest priority (100+ points)
   - **Content matches** get medium priority (50+ points)
   - **Tag matches** get high priority (75+ points)
   - **Multiple occurrences** get bonus points
   - Results are sorted by relevance score

3. **You see results**
   - Most relevant results appear first
   - You see note titles, previews, and thread context
   - You can click to open any result

**Why This Algorithm:** Title matches are most relevant (you're probably looking for a specific note). Content matches are helpful but less precise. Tag matches show related content. The scoring system balances all these factors.

### Navigation: How It Remembers

1. **You access a space or thread**
   - The app adds it to your navigation history (localStorage)
   - It converts the color to a CSS gradient
   - It shows the item count

2. **The navigation updates**
   - New items appear at the top
   - Old items drop off (keeps last 5-10 items)
   - Active item (current page) is highlighted

3. **You close an item**
   - Confirmation appears for destructive actions
   - Deleted Shared Spaces are hidden immediately and remain owner-recoverable in Settings for 30 days
   - Item is removed from navigation
   - You're redirected to dashboard

**Why localStorage:** It's instant (no database query), works offline, and persists across sessions. The navigation feels immediate and responsive.

---

## The Technology Choices and Why They Matter

### Hono: The API Layer

**What It Is:** The bundled Node API that handles server-side logic for authenticated and public routes.

**Why We Use It:**
- **Database access:** All database queries run through Hono API endpoints — they stay on the server, never in the browser
- **Security:** Auth middleware (Clerk) runs server-side, so every API call is verified
- **Deployment:** The API bundles into one Netlify Function with its runtime dependencies

**How It Works:**
- Hono handles every request to `/api/*`
- The React SPA calls these API endpoints to fetch/create/update data
- The React SPA also renders sign-in, public shared-note, and invitation routes

**The Benefit:** The database and authentication stay safely on the server. The React SPA only ever sees JSON responses, never raw database access.

### React SPA: The Authenticated App

**What It Is:** A full single-page application (React + Vite + TanStack Router) that runs the entire authenticated experience.

**Why We Chose It:**
- **Instant navigation:** Moving between threads, notes, and spaces never reloads the page
- **Persistent state:** Navigation, panels, and data stay loaded as you move around
- **Mobile PWA feel:** Behaves like a native app — fast, responsive, smooth
- **Component reusability:** Shared React components (`src/components/react/`) serve multiple SPA surfaces

**How It Works:**
- When you visit the app, `spa/index.html` loads once
- TanStack Router updates the URL and swaps in the correct page component — no full reload
- TanStack Query caches your spaces, threads, and notes — navigating back to a page you've already visited is instant (no loading spinner)
- Route transitions animate with a subtle fade + slide so navigation feels fluid

**The Benefit:** You get a fast, app-like experience on both desktop and mobile.

### Supabase Postgres Database: The Memory

**What It Is:** A managed PostgreSQL database that stores all your content.

**Why We Chose It:**
- **Managed platform:** Hosted Postgres with built-in operational tooling
- **Reliable:** Mature PostgreSQL engine with strong data integrity guarantees
- **Flexible:** Works cleanly with Drizzle ORM and SQL-first workflows
- **Scalable:** Handles growth without custom database ops overhead

**How It Works:** 
- All your content (notes, threads, spaces) is stored in tables
- Relationships (note-thread connections) are stored in junction tables
- Queries are fast because the database is optimized for our use case

**The Benefit:** Your data is safe, fast, and scales as you grow.

### Clerk: The Security System

**What It Is:** An authentication service that handles sign-in, sign-up, and user management.

**Why We Chose It:**
- **Security:** Handles all the complex security (password hashing, session management)
- **User management:** Built-in profile management, email verification
- **Social login:** Can add Google, Apple, etc. login easily
- **Metadata storage:** Can store user preferences in `public_metadata`

**How It Works:**
- You sign in through Clerk
- Clerk verifies your identity
- Clerk gives the app your user ID
- The app uses your user ID to fetch only YOUR content

**The Benefit:** You don't have to worry about security - it's handled by experts.

### Tiptap: The Rich Text Editor

**What It Is:** A modern, extensible rich text editor built for React.

**Why We Chose It:**
- **React-native:** Works seamlessly with React components
- **Extensible:** Can add features (scripture detection, formatting) easily
- **Modern:** Better than older editors (Quill, TinyMCE)
- **TypeScript support:** Type-safe, fewer bugs

**How It Works:**
- Renders as a React component
- Handles text input, formatting, and content state
- Saves content as HTML
- Can be extended with plugins (scripture detection, auto-tagging)

**The Benefit:** You get a modern, powerful editor that feels native to the app.

---

## User Experience Decisions

### Why 100ms Redirects?

**The Decision:** After creating content, wait 100ms before redirecting.

**Why:** 
- Gives the UI time to show the success toast
- Feels instant to users (under 200ms feels immediate)
- Prevents jarring instant redirects

**The Trade-off:** Slightly slower than instant, but much better UX.

### Why Toast Notifications?

**The Decision:** Show small notification popups for success/error messages.

**Why:**
- Immediate feedback (you know your action worked)
- Non-intrusive (doesn't block the UI)
- Clear communication (success = green, error = red)

**The Trade-off:** Requires React component, but provides essential user feedback.

### Why Bottom Sheet on Mobile?

**The Decision:** Use a slide-up bottom sheet for mobile panels instead of full-screen modals.

**Why:**
- **Modern UX:** Standard pattern on mobile (iOS, Android)
- **Context preservation:** You can still see the page behind it
- **Easy dismissal:** Tap outside or swipe down to close
- **Smooth animations:** Feels native and polished

**The Trade-off:** More complex than a modal, but much better mobile experience.

**Implementation:** The slide-up shell is **[Vaul](https://github.com/emilkowalski/vaul)** ([`src/components/ui/drawer.tsx`](../src/components/ui/drawer.tsx)), styled with Harvous overlay and bottom-sheet CSS. Toast feedback uses **[Sonner](https://github.com/emilkowalski/sonner)**. UX and motion direction credit **[Emil Kowalski](https://emilkowal.ski/)**.

### Why Inline Editing?

**The Decision:** Click a note to edit it directly (no separate edit page).

**Why:**
- **Faster:** No page navigation
- **Context:** You see the note in its context while editing
- **Less friction:** One click to edit, one click to save

**The Trade-off:** Slightly more complex code, but much better user experience.

### Why Persistent Navigation?

**The Decision:** Show recently accessed items in a sidebar navigation.

**Why:**
- **Quick access:** Jump to frequently used content instantly
- **Context awareness:** You always know where you are
- **Visual organization:** Colors help you find things quickly

**The Trade-off:** Takes up screen space, but dramatically improves navigation speed.

---

## Data Safety and Security

### How Your Data is Protected

1. **Authentication:** Only you can access your account (Clerk handles this)
2. **User Isolation:** Database queries filter by user ID - you only see your content
3. **Data Persistence:** Everything is saved immediately to the database
4. **Backup:** Database backup and recovery are handled by the Supabase project configuration
5. **No Data Loss:** Notes are never deleted, only moved to "My Pile"

### Why Sequential IDs Never Reuse

**The Problem:** If we reused deleted IDs, you might think a new note is an old note you deleted.

**The Solution:** Track the highest ID ever used. Next ID is always `highestSimpleNoteId + 1`.

**Example:**
- You create N001, N002, N003
- You delete N003
- Next note is N004 (not N003)
- Even if you delete N001 and N002, next note is still N004

**Why This Matters:** Data integrity. You can always trust that N015 is the 15th note you created, even if you deleted earlier notes.

### Why Notes Are Never Deleted

**The Problem:** Accidental deletion is devastating. You might delete a thread and lose important notes.

**The Solution:** When you delete a thread, all its notes are moved to "My Pile" (not deleted).

**How It Works:**
- Delete thread → Remove note-thread relationships
- Notes with no relationships → Automatically land in "My Pile"
- The My Pile thread always exists (can't be deleted)
- You can always recover content from "My Pile"

**Why This Matters:** Your spiritual journey is precious. We preserve everything so you never lose insights.

---

## Mobile vs Desktop: One App, Two Experiences

### The Challenge

Mobile and desktop have different needs:
- **Desktop:** More screen space, mouse/keyboard input, multi-column layouts
- **Mobile:** Limited screen space, touch input, single-column layouts

### The Solution: Responsive Design

**Same Components, Different Layouts:**
- Desktop: 3-column layout (navigation, main content, additional column)
- Mobile: Stacked layout with bottom sheet for panels

**Breakpoint:** 1160px width
- Above 1160px = Desktop layout
- Below 1160px = Mobile layout

### Mobile-Specific Features

1. **Bottom Sheet:** Panels slide up from bottom (modern mobile pattern)
2. **Touch-Optimized:** Larger touch targets, swipe gestures
3. **Simplified Navigation:** Mobile dropdown instead of sidebar
4. **Optimized Forms:** Full-width inputs, larger buttons

### Desktop-Specific Features

1. **Sidebar Navigation:** Persistent navigation column
2. **Additional Column:** Extra space for panels and details
3. **Hover States:** Rich hover interactions (close icons, tooltips)
4. **Keyboard Shortcuts:** Power user features

### Why This Approach Works

**Unified Codebase:** Same React components work on both platforms. We don't maintain separate mobile and desktop apps.

**Responsive components:** Components adapt to their context. A panel can use a bottom sheet on mobile and an
additional column on desktop.

**The Benefit:** One codebase, two great experiences. Updates work on both platforms simultaneously.

---

## The Future: How the System Grows

### Current status: Harvous 2.x

**What's Done:**
- ✅ Core content creation (notes, threads, spaces)
- ✅ Rich text editing
- ✅ Search functionality
- ✅ Mobile/desktop responsive design
- ✅ XP gamification
- ✅ Navigation system
- ✅ Shared Spaces canonical associations, responses, Threads, lifecycle, and recovery

**Shared Spaces roadmap:** v1.1 adds content/person mentions and a one-heart acknowledgment without
notifications. v1.2 production-verifies realtime invalidation before presence and event unread state. v2 covers
leaders, billing operations, email invites, ownership transfer, public broadcast, and church organizations.
Native parity remains long-term; same-note collaborative editing is optional and evidence-led.

### How New Features Are Added

**The Process:**
1. **Design:** Plan the feature, understand user needs
2. **Database:** Add any new tables/fields needed
3. **API:** Create endpoints for the feature
4. **Components:** Build or reuse React components
5. **Integration:** Connect everything together
6. **Testing:** Test on desktop and mobile
7. **Deployment:** Release to production

**Example: Adding Note Types**
1. **Database:** Add `noteType` field to Notes table
2. **API:** Update create/update endpoints to handle note types
3. **Components:** Add note type selector to NewNotePanel
4. **Display:** Show note type in note cards and pages
5. **Search:** Filter by note type in search results

### Architecture That Scales

**Why Our Architecture Works for Growth:**
- **Modular:** Features are separate components, easy to add/remove
- **Database-First:** Schema changes are straightforward
- **API-Driven:** New features just need new API endpoints
- **React SPA:** New interactive features compose into the native-like shell
- **Type-Safe:** TypeScript catches errors before they reach users

**The Benefit:** We can add features quickly without breaking existing functionality.

---

## Key Principles That Guide Everything

### 1. User-First Design

Every decision starts with: "What's best for the user?"

- **Sequential IDs:** Users can reference notes easily
- **Color coding:** Users can find things visually
- **Note preservation:** Users never lose content
- **Fast redirects:** Users get immediate feedback

### 2. Data Integrity

We never compromise on data safety:
- **Never reuse IDs:** Prevents confusion
- **Never delete notes:** Preserves your journey
- **User isolation:** Your data is yours alone
- **Immediate saves:** No data loss on crashes

### 3. Performance Matters

Fast is better than slow:
- **Client-side navigation:** The shell stays mounted between routes
- **TanStack Query:** Cached server data avoids unnecessary refetches
- **Database optimization:** Fast queries
- **localStorage:** Instant navigation updates

### 4. Flexibility Over Rigidity

The system adapts to you, not the other way around:
- **Many-to-many relationships:** Notes in multiple threads
- **Flexible organization:** Mix threads and notes in spaces
- **Custom colors:** Make it yours
- **Multiple workflows:** Top-down or bottom-up organization

### 5. Bible Study Focused

Everything is designed for Bible study, not generic note-taking:
- **Scripture detection:** Finds Bible references automatically
- **Auto-tagging:** Tags biblical keywords
- **Spiritual context:** Features that make sense for Bible study
- **Group collaboration:** Shared spaces for study groups

---

## Conclusion

Harvous is built on a foundation of thoughtful decisions, each one made to serve a specific purpose:

- **Hierarchical organization** gives you flexibility
- **Sequential IDs** give you clarity
- **Color coding** gives you speed
- **The native-like React shell** gives you fast navigation
- **Note preservation** gives you safety
- **Many-to-many relationships** give you freedom

Every piece of the system works together to create an experience that's fast, safe, flexible, and focused on Bible study. The architecture is designed to grow with you as your study journey evolves.

**The Bottom Line:** Harvous isn't just a note-taking app - it's a system designed specifically for Bible study, with every decision made to enhance your spiritual growth and make your study more meaningful.

---

**Last Updated:** July 2026
**Status:** Harvous 2.x production architecture; Shared Spaces v1 implemented, operational verification ongoing







