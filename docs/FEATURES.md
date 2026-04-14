# Harvous Features

Discover the powerful features that make Harvous the perfect companion for your Bible study journey. Harvous is a modern Bible study notes application with a solid foundation and React Islands architecture. **v1 is complete** with production-ready core functionality; ongoing focus is performance and quality-of-life improvements.

## 🗂️ Flexible Organization

### Hierarchical Structure
- **Spaces** → **Threads** → **Notes**
- Organize your study materials in a way that makes sense to you
- Mix individual notes and thread collections within the same space
- **Easy Space Creation**: Dedicated space creation page with color selection and private/shared types
- **Customizable Spaces**: Choose from 8 beautiful colors and set privacy levels

### Example Organization:
```
📁 Bible Study Space (Private, Blue)
├── 📚 Gospel of John Thread (5 notes)
├── 📖 Romans Study Thread (12 notes)
└── 📝 Individual Reflection Note

📁 Church Group Study (Shared, Gold)
├── 🙏 Romans Discussion Thread (8 notes)
├── ❤️ Prayer Requests Thread (12 notes)
└── 📋 Group Notes

📁 Prayer Journal Space (Private, Mint)
├── 🙏 Daily Prayers Thread (30 notes)
├── ❤️ Intercession List Thread (8 notes)
└── 📋 Prayer Request Note
```

## 🎨 Visual Organization

### Color-Coded Content
- **Spaces and threads** get **unique colors** for instant recognition
- **8 beautiful colors** to choose from: Paper, Blessed Blue, Mindful Mint, Graceful Gold, Pleasant Peach, Caring Coral, Peaceful Pink, Lovely Lavender
- Colors appear in navigation and headers
- Easy to spot your favorite study topics at a glance

### Visual Counts
- **Space counts**: Total items (threads + notes) in each space
- **Thread counts**: Number of notes in each thread
- **Quick overview** of your study progress

## 🧭 Smart Navigation ✅ **IMPLEMENTED**

### Persistent Navigation
- **Recently Accessed**: Your most recent spaces and threads appear in the navigation
- **Active State**: Currently viewed items show with proper styling and shadows
- **Easy Access**: Quick navigation to your frequently used content

## Navigation Features ✅ **IMPLEMENTED**
- **Space Protection**: Confirmation dialog when closing spaces (since they can't be recovered)
- **Clean Interface**: No duplicate entries - each item appears only once
- **localStorage Integration**: Simple localStorage-based system for tracking recently accessed items
- **Color-coded Navigation**: Spaces and threads display with their respective colors
- **Item Counts**: Spaces show total item count, threads show note count

### Example Visual Layout:
```
🔵 Bible Study Space (8)     ← Blue space with 8 total items
  └── 🟣 Gospel of John (5)  ← Purple thread with 5 notes
🟡 Church Group Study (15)   ← Gold shared space with 15 items
  └── 🟠 Romans Discussion (8) ← Orange thread with 8 notes
🟢 Prayer Journal (23)       ← Green space with 23 items
```

## 📝 Rich Note Creation

### User-Friendly Note IDs
- **Sequential numbering**: N001, N002, N003, N004...
- **Never reused**: Deleted note IDs are never reused (N003 deleted → next is N004)
- **Easy reference**: "Check out my insight in N015"
- **Persistent**: IDs never change, even when reorganizing

### Rich Text Editor (TiptapEditor) ✅ **IMPLEMENTED**
- **Bold, italic, underline** formatting for emphasis and structure
- **Ordered and unordered lists** for organized thoughts and outlines
- **Clean, distraction-free interface** that matches the app's design
- **Consistent font styling** using the app's Reddit Sans font family
- **Real-time content updates** with seamless form integration
- **Inline editing** - click any note to edit directly without separate edit pages
- **HTML content processing** - clean text previews without formatting artifacts
- **Mobile-optimized toolbar** with proper viewport handling
- **React Islands integration** for seamless desktop and mobile experience

### Note Examples:
```
N001: John 3:16 - God's Love
N002: Romans 8:28 - All Things Work Together
N003: Psalm 23 - The Lord is My Shepherd
N004: Prayer Request - Healing for Sarah
```

## 🏠 Space Types & Collaboration

### Private Spaces
- **Personal study spaces** for focused individual work
- Keep your thoughts organized by major themes or study projects
- Perfect for personal Bible reading, prayer journaling, and individual reflection
- Only visible to you - your private spiritual journey

### Shared Spaces ✅ **v1 COMPLETE**
- **Collaborative environments** where multiple people can contribute
- Perfect for church small groups, Bible study groups, book clubs, and family devotions
- All members can create threads and notes within the shared space
- **Invitations:** Shareable invite link (link-based joining); owner copies link from Space details; join page and accept flow
- **Member management:** Owner can invite (via link), remove members; members can leave; tier limits (free: 3 shared spaces; paid: unlimited)
- **Visibility:** Join page, member view (same route as owner), shared space indicator; locked notes never shown in shared contexts

### Example Use Cases:
```
📁 Personal Study (Private, Blue)
├── Daily Bible Reading
├── Prayer Journal
└── Personal Reflections

📁 Church Small Group (Shared, Gold)
├── Romans Study Discussion
├── Group Prayer Requests
└── Meeting Notes

📁 Family Devotions (Shared, Mint)
├── Weekly Family Study
├── Children's Questions
└── Family Prayer List
```

## 🏠 Smart Inbox System ✅ **IMPLEMENTED**

### "For You" Tab
- **Capture zone** for quick note-taking
- **My Pile / unfiled content** that needs sorting
- **Threads without spaces** waiting for organization
- **Perfect for** rapid idea capture during study

### "Full List" Tab
- **Complete overview** of all organized content
- **Space-based organization** with counts
- **Thread hierarchies** within each space
- **Great for** finding and reviewing past studies

## 🔄 Flexible Content Management ✅ **IMPLEMENTED**

### Move Content Easily
- **Notes between threads**: Reorganize as your understanding grows
- **Threads between spaces**: Restructure your organization
- **Individual notes**: Can exist outside of threads when needed
- **NoteDetailsPanel**: Complete many-to-many thread management system

### Many-to-Many Relationships
- **Notes in multiple threads**: A note about "Faith" can belong to both "Romans Study" and "Personal Growth"
- **Cross-referencing**: Link related concepts across different study areas
- **Flexible organization**: Content isn't locked into rigid categories
- **Thread Management**: Add/remove notes from multiple threads with enhanced UX

## 🛡️ Data Protection ✅ **IMPLEMENTED**

### Note Preservation
- **Notes are never deleted** - they're always preserved
- **Thread deletion**: Notes move to "My Pile" instead of being lost
- **Accident protection**: No fear of losing important insights
- **Complete history**: Every note you've ever created is saved
- **Sequential Note IDs**: User-friendly IDs (N001, N002, N003) that never reuse deleted numbers
- **Database Integrity**: Robust database schema with proper relationships and constraints

### User Isolation
- **Private notes**: Only you can see your content
- **Secure authentication**: Protected by Clerk authentication
- **Personal organization**: Your spaces, threads, and notes are yours alone
- **User-specific data**: All content is isolated by user ID in the database

## 🚀 Real-Time Experience ✅ **IMPLEMENTED**

### Instant Updates
- **Real-time saving**: Changes are saved immediately
- **No manual save**: Focus on your thoughts, not file management
- **Cross-device sync**: Access your notes from anywhere
- **Persistent sessions**: Pick up where you left off
- **Fast redirects**: 100ms redirects to newly created content
- **Toast notifications**: Success/error feedback for all actions

### Smooth Navigation
- **View Transitions**: Seamless page changes without full reloads
- **Quick access**: Recent items in navigation for fast switching
- **Breadcrumb navigation**: Always know where you are
- **Search functionality**: Find any note or thread quickly with enhanced relevance scoring
- **React Islands**: Seamless desktop and mobile experience with unified components

## 📱 Responsive Design ✅ **IMPLEMENTED**

### Modern Mobile Experience
- **Bottom sheet (Vaul)**: Mobile panels use **[Vaul](https://vaul.emilkowal.ski/)** ([Emil Kowalski](https://emilkowal.ski/)) with Harvous overlay and layout CSS; smooth slide-up / drag behavior from the library
- **Toasts (Sonner)**: Notifications use **[Sonner](https://sonner.emilkowal.ski/)** (same author)
- **Unified Components**: Same React components for desktop and mobile (SPA + shared `src/components/react/`)
- **Fast Interactions**: 100ms redirects, immediate feedback with toast notifications
- **Professional UX**: Smooth animations, proper easing, and overlay dismiss functionality
- **Mobile-Only Rendering**: Bottom sheet only shows on mobile (< 1160px), desktop uses additional column

### Works Everywhere
- **Desktop**: Full-featured experience with all tools and additional column layout
- **Tablet**: Touch-friendly interface for note-taking with bottom sheet system
- **Mobile**: Optimized for quick capture and review with modern bottom sheet UX
- **Progressive Web App**: Install as a native app

## 🎮 Gamification & XP System

### Experience Points (XP) System ✅ **IMPLEMENTED**
- **Automatic XP Awarding**: XP is automatically awarded when users create threads (10 XP) and notes (10 XP)
- **Daily Bonuses**: First note of each day earns +5 XP bonus
- **Smart Daily Caps**: Note opening XP capped at 50 per day to prevent gaming
- **Real-time Tracking**: See your XP grow as you create and engage with content
- **Dynamic Profile Display**: Profile page shows real-time XP instead of hardcoded value
- **Backfill System**: Can retroactively calculate XP for existing users and content
- **Database Integration**: UserXP table tracks all XP activities and amounts

### XP Values & Rules:
- **Creating a new thread**: 10 XP
- **Creating a full note**: 10 XP
- **Opening notes/threads**: 1 XP (50 XP daily cap)
- **First note of the day**: +5 XP bonus

### Future Expansion Ready:
- **Levels and badges** based on total XP
- **Achievement system** for specific behaviors
- **Leaderboards** and social features
- **More activity types** (sharing, commenting, etc.)

## 👤 Profile Customization ✅ **IMPLEMENTED**

### Personal Profile Management
- **Edit Name & Color Panel**: Customize your first name, last name, and avatar color
- **Dynamic Avatar Colors**: Choose from 8 beautiful colors for your avatar
- **Real-time Updates**: Changes apply immediately across desktop and mobile
- **Persistent Preferences**: Your color choice is saved and remembered across sessions
- **Name Display**: Profile shows "First Name + Last Initial" format (e.g., "John D")
- **Avatar Initials**: Avatar displays "First Initial + Last Initial" format (e.g., "JD")
- **XP Display**: Profile shows real-time XP with Font Awesome bolt icon
- **Database Integration**: All profile data is securely stored and retrieved

### Color Options:
- **Paper** (default), **Blessed Blue**, **Mindful Mint**, **Graceful Gold**
- **Pleasant Peach**, **Caring Coral**, **Peaceful Pink**, **Lovely Lavender**
- Colors match the same palette used for spaces and threads
- Your avatar color preference is stored in your user profile

### Profile Features:
- **Panel System**: Organized profile editing with dedicated panels for different settings
- **Toast Notifications**: Success feedback when profile is updated
- **Cross-Device Sync**: Profile changes sync across all devices
- **Database Persistence**: All profile data is securely stored and retrieved

## 💳 Billing & Referrals ✅ **IMPLEMENTED**

### Free Tier & Upgrade
- **500 free notes**: Everyone gets 500 notes to start
- **Upgrade to Unlimited**: Manage Billing panel shows usage and links to upgrade
- **Dynamic limit display**: Note limit (500 + referral bonus) shown in Manage Billing and Referral panels

### Referral Bonus
- **Refer My Friends**: Profile option opens Referral panel with copyable referral link
- **100 extra notes per referral**: When friends sign up with your link, you get 100 additional notes on top of your 500 free notes
- **Autogenerated referral codes**: Short codes (e.g. JOHN-X7K2) for shareable links
- **Bonus stats**: Panel shows how many bonus notes you've earned from successful referrals
- **Subscription integration**: Effective limit (500 + referral bonus) used for note creation and displayed in billing UI

### Billing & Referral Features:
- **ReferralPanel**: Copy link, see bonus stats, dynamic "before you need unlimited" total
- **ManageBillingPanel**: Usage (e.g. "3 out of 500 note limit"), upgrade flow
- **API**: `/api/referral/status`, `/api/referral/credit`, subscription status includes limit and referral bonus

## 🔒 Locked Notes & Encryption ✅ **IMPLEMENTED**

### What We Use (Transparency & Trust)

Locked notes use **client-side encryption** so only you (and God) can read the content. The server and database only ever see ciphertext.

**Encryption (specific algorithms):**

- **Cipher:** **AES-GCM** (256-bit key). Authenticated encryption; tampering is detected.
- **Key derivation:** **PBKDF2-SHA256** with **310,000 iterations** (OWASP 2025 recommendation). Your 4-digit PIN is set once per account (Profile → Lock PIN); a key is derived from it and a per-note salt. PIN is never stored in plaintext; a verifier is stored for verification when locking.
- **Salt:** 16 bytes, cryptographically random, generated per encryption (stored with the ciphertext).
- **IV (nonce):** 12 bytes for AES-GCM, cryptographically random per encryption.
- **API:** Web Crypto API (SubtleCrypto). No keys or PINs are sent to or stored on the server.

**Stored format:** Per locked note, the `content` column holds a base64 blob: `salt (16 bytes) || IV (12 bytes) || ciphertext`. The `contentEncrypted` flag tells the server to treat it as opaque.

**Trust:** We do not have access to your locked note plaintext. If you forget your PIN, locked content cannot be recovered.

### Locked Notes Features
- **Account-level 4-digit PIN:** Set and change in Profile → Lock PIN; one PIN locks/unlocks any note. PIN is never stored or transmitted; a verifier is used only to confirm before locking.
- **Lock / Unlock UI:** Lock note button, PIN entry panel (set PIN from note or enter PIN to lock), inline unlock when viewing
- **List placeholders:** Locked notes show "Locked" in cards and lists; no plaintext preview
- **Search & features:** Locked notes are excluded from full-text search; scripture detection, auto-tags, and sharing respect the lock

## 🎯 Bible Study Focused

### Designed for Spiritual Growth
- **Study workflows**: Built for how you actually study the Bible
- **Reflection tools**: Space for insights, questions, and applications
- **Prayer integration**: Combine study notes with prayer requests
- **Sermon notes**: Organize church service insights

### Example Use Cases:
- **Daily Bible reading** with reflection notes
- **Sermon series** with weekly notes
- **Bible study groups** with shared insights
- **Personal devotions** with prayer journaling
- **Scripture memorization** with practice notes

## 🔍 Smart Search & Discovery ✅ **IMPLEMENTED**

### Enhanced Search Functionality
- **Full-text Search**: Search across all notes and threads with enhanced matching
- **Multiple Search Patterns**: Exact case match, lowercase match, and word boundary matching
- **Tag Support**: Search includes tag matching for comprehensive results
- **Relevance Scoring**: Smart relevance scoring based on title matches, content matches, and tag matches
- **Recent Content Boost**: Recent content gets slight boost in search results
- **Deduplication**: Automatic deduplication of search results

### Search Features:
- **Title Priority**: Title matches get highest relevance score (100+ points)
- **Content Matching**: Content matches get medium score (50+ points)
- **Tag Integration**: Tag matches get high score (75+ points)
- **Multiple Occurrences**: Bonus points for multiple occurrences in content
- **Date Sorting**: Results sorted by update date and creation date

### Content Discovery
- **Related notes**: See notes in the same thread or space
- **Cross-references**: Find notes that reference each other
- **Study patterns**: See which topics you study most
- **Growth tracking**: Watch your understanding develop over time

## 🆕 NEW V1 FEATURES: Core Differentiators

### Selected Text Note Creation 🆕 **COMING IN V1**
- **Select Text → Create Note**: Select meaningful text in TiptapEditor and instantly create a new note
- **Floating Action Button**: Small, unobtrusive button appears above selected text
- **Seamless Workflow**: Natural extension of reading experience for capturing insights
- **Pre-populated Content**: Selected text automatically populates the new note content
- **Mobile & Desktop Support**: Works seamlessly across all devices
- **Context Preservation**: Maintains original context while creating new notes

### Note Types System 🆕 **COMING IN V1**
- **Default Notes**: Standard notes with rich text content for general note-taking
- **Scripture Notes**: Specialized notes for Bible verses and scripture references
- **Resource Notes**: Notes for external resources, articles, and media
- **Automatic Detection**: Smart detection of scripture and resource content
- **Enhanced Organization**: Better categorization and search capabilities
- **Rich Metadata**: Additional context and information for each note type

## 🎨 Customizable Experience

### Personal Organization
- **Your spaces**: Create organizational structure that fits your study style
- **Your threads**: Group related content however makes sense to you
- **Your notes**: Write in your own voice and style
- **Your workflow**: Use the tools in ways that enhance your study

### Flexible Workflows
- **Top-down organizers**: Start with spaces, then threads, then notes
- **Bottom-up capturers**: Start with notes, then organize into threads and spaces
- **Hybrid approach**: Mix both methods as needed
- **Evolution**: Let your organization grow and change with your study

## 🌟 Unique Benefits

### Why Harvous is Different
- **Bible study focused**: Built specifically for spiritual study, not generic note-taking
- **Sequential IDs**: Never lose track of your notes with persistent numbering
- **Visual organization**: Colors and counts make content easy to find
- **Flexible structure**: Adapts to your study style, not the other way around
- **Data preservation**: Never lose important insights due to accidental deletion

### Perfect For:
- **Individual study**: Personal Bible reading and reflection
- **Group study**: Organize insights from Bible study groups
- **Sermon notes**: Capture and organize church service insights
- **Prayer journaling**: Combine study with prayer requests
- **Scripture study**: Deep dive into specific books or topics
- **Devotional time**: Daily reflection and spiritual growth

## 🚀 Getting Started

Ready to transform your Bible study? Here's how to begin:

1. **Sign in** to your Harvous account with Clerk authentication
2. **Create your first space** with a custom color and privacy setting (e.g., "Daily Study" - Private, Blue)
3. **Add a thread** with its own color (e.g., "Current Book Study" - Purple)
4. **Start taking notes** with the rich text editor and watch your XP grow!
5. **Use the search** to find your insights quickly with enhanced relevance scoring
6. **Create shared spaces** for group study and collaboration (invite via email or link, member management, tier limits)
7. Select text to create notes instantly and use specialized note types

### Current Status: V1 Complete
- ✅ **Core Features**: Content creation, viewing, and management
- ✅ **Mobile Experience**: Modern bottom sheet system with React Islands
- ✅ **XP System**: Gamification with automatic XP awarding
- ✅ **Search**: Enhanced search with relevance scoring and tag support
- ✅ **Billing & Referrals**: Free tier (500 notes), upgrade to unlimited, referral bonus (100 notes per friend)
- ✅ **Locked Notes**: Client-side encryption (AES-GCM 256-bit, PBKDF2-SHA256 310k iterations); 4-digit PIN, no recovery
- ✅ **Shared Spaces**: Invitations (email + link), member management, join/leave, tier limits; v1 complete. Next: performance and QoL.

Your journey of organized, meaningful Bible study starts now. 📖✨
