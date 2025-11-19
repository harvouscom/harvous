### Jan 28, 2025 - Present

**Edit Thread Panel - Successfully Implemented** ✅

- ✅ **Edit Thread Panel**: Successfully implemented EditThreadPanel React component after learning from failed attempt
- ✅ **React Islands Architecture**: Fully functional React component integrated into DesktopPanelManager
- ✅ **Thread Editing**: Users can now edit thread title and color from thread page menu
- ✅ **Form Validation**: Proper validation for thread title with user-friendly error messages
- ✅ **Color Selection**: Full color picker with all 8 thread colors supported
- ✅ **Integration**: Seamlessly integrated with ContextMoreMenu and BottomSheet systems
- ✅ **API Endpoint**: `/api/threads/[id]/update` endpoint handles thread updates with proper error handling

**Technical Implementation:**
- New `src/components/react/EditThreadPanel.tsx` React component
- Updated `src/components/react/DesktopPanelManager.tsx` for panel management
- Enhanced thread update API with conditional timestamp management
- Proper event handling for panel open/close states
- Dynamic background gradients matching thread colors

**Files Created:**
- `src/components/react/EditThreadPanel.tsx` - Complete React component
- `src/pages/api/threads/[id]/update.ts` - Thread update endpoint

**Result**: Edit Thread functionality now works flawlessly! Users can edit threads directly from the thread page menu. 🎉

**Scripture Metadata System - Complete Implementation** ✅

- ✅ **Scripture Note Type**: Implemented comprehensive scripture note type system
- ✅ **ScriptureMetadata Table**: New database table for storing scripture references and metadata
- ✅ **Automatic Detection**: Scripture detection in NewNotePanel automatically creates scripture notes
- ✅ **Bible Reference Parsing**: Full parsing support for book, chapter, verse, and verse ranges
- ✅ **Translation Support**: Translation field support (currently NET, extensible for future translations)
- ✅ **Display Integration**: Scripture notes display with proper metadata in CardFullEditable
- ✅ **API Integration**: Note creation endpoint automatically creates ScriptureMetadata records

**Scripture Features:**
- Parse scripture references (e.g., "John 3:16", "Romans 8:1-4")
- Store book, chapter, verse, and verseEnd (for ranges)
- Store original verse text and translation information
- Automatic scripture detection in note creation
- Foundation for future scripture-specific features

**Technical Implementation:**
- New `ScriptureMetadata` table in `db/config.ts`
- Enhanced `src/pages/api/notes/create.ts` with scripture metadata creation
- Updated `src/components/react/CardFullEditable.tsx` for scripture version display
- Scripture detection integration in `src/components/react/NewNotePanel.tsx`
- Enhanced `[id].astro` with error handling for scripture metadata fetching

**Database Schema:**
```typescript
ScriptureMetadata {
  id, noteId, reference, book, chapter, verse, verseEnd, translation, originalText, createdAt
}
```

**Result**: Complete scripture note type system ready for Bible study workflows! 📖

**ContextMoreMenu React Conversion** ✅

- ✅ **React Islands Migration**: Converted ContextMoreMenu from Alpine.js to React Islands
- ✅ **Unified Menu Component**: Created reusable `Menu.tsx` component for all menu interactions
- ✅ **Menu System Refactoring**: Consolidated AddMenu and ContextMoreMenu into single Menu component
- ✅ **Event-Driven Architecture**: Proper event dispatching for panel open/close actions
- ✅ **Confirmation Dialogs**: React Portal-based confirmation dialogs for destructive actions
- ✅ **Icon Integration**: FontAwesome icon support for all menu actions
- ✅ **Context-Aware Actions**: Dynamic menu options based on contentType and contentId

**Technical Implementation:**
- New `src/components/react/Menu.tsx` - Unified menu component
- Updated `src/components/ContextMoreMenu.astro` - Wrapper component
- Enhanced `src/components/react/SquareButton.tsx` - Menu integration
- New `src/components/react/EraseConfirmDialog.tsx` - Confirmation dialog
- Menu options utility in `src/utils/menu-options.ts`

**Features:**
- Edit thread/space actions
- Erase (delete) thread/note/space with confirmation
- See details for notes
- Context-aware menu options
- Proper event handling for panel management

**Result**: Modern React Islands menu system with better performance and maintainability! 🎯

**MyDataPanel - User Data Management** ✅

- ✅ **MyDataPanel Component**: Complete React component for user data management
- ✅ **Data Export**: Export user data in CSV and Markdown formats
- ✅ **Account Deletion**: Delete account functionality with confirmation dialog
- ✅ **Export API Refactoring**: Simplified CSV and Markdown output generation
- ✅ **Error Handling**: Comprehensive error handling and user feedback
- ✅ **Loading States**: Proper loading indicators during export operations
- ✅ **Confirmation Dialogs**: React Portal-based confirmation for account deletion

**MyDataPanel Features:**
- Export all user data as CSV
- Export all user data as Markdown
- Delete account with confirmation
- Loading states for async operations
- Toast notifications for success/error feedback

**Technical Implementation:**
- New `src/components/react/MyDataPanel.tsx` React component
- Enhanced `src/pages/api/user/export.ts` - Simplified export logic
- New `src/components/react/DeleteAccountConfirmDialog.tsx` - Account deletion confirmation
- Updated `src/pages/profile.astro` - Panel integration
- Error logging enhancements in delete-account API

**Result**: Complete user data management system with export and deletion capabilities! 📊

**Automatic Version Bumping System** ✅

- ✅ **Version Management**: Automatic version bumping based on conventional commit messages
- ✅ **Conventional Commits**: Supports `feat:`, `fix:`, and `BREAKING CHANGE` patterns
- ✅ **Semantic Versioning**: Automatic minor (feat), patch (fix), and major (BREAKING) bumps
- ✅ **Git Integration**: Reads commit messages and stages package.json automatically
- ✅ **Safety Features**: Skips version bump for version bump commits to avoid recursion

**Version Bump Rules:**
- `feat:` → Minor bump (0.10.0 → 0.11.0)
- `fix:` → Patch bump (0.10.0 → 0.10.1)
- `BREAKING CHANGE` or `!` → Major bump (0.10.0 → 1.0.0)
- Default → Patch bump for safety

**Technical Implementation:**
- New `scripts/bump-version.js` - Version bumping script
- Integrated into npm scripts as `version:bump`
- Git commit message parsing
- Package.json version management
- Current version: 0.10.3

**Result**: Automated version management following semantic versioning best practices! 🔢

**Color System Refactoring** ✅

- ✅ **Color Utility Consolidation**: Refactored color system to use centralized utility functions
- ✅ **Background Gradient Handling**: Unified `getThreadGradientCSS` function across all components
- ✅ **Text Color Logic**: Dynamic text color adjustments based on background color
- ✅ **Consistency Improvements**: Consistent color application across desktop and mobile
- ✅ **Mobile Navigation**: Enhanced MobileNavigation with dynamic text color adjustments
- ✅ **Component Updates**: Updated all components to use centralized color utilities

**Technical Implementation:**
- Enhanced `src/utils/colors.ts` with gradient and text color utilities
- Updated components to use `getThreadGradientCSS()` function
- Refactored background gradient handling across CardThread, NavigationColumn, etc.
- Improved color-to-gradient conversion logic
- Better mobile/desktop color consistency

**Result**: Unified color system with consistent styling across all components! 🎨

**HTML Stripping & Content Processing Improvements** ✅

- ✅ **Content Processing Refactoring**: Improved HTML stripping logic across all components
- ✅ **CardFullEditable Enhancement**: Better HTML content processing in editable components
- ✅ **CardNote Improvements**: Enhanced text processing and display
- ✅ **Content Display**: Clean text display without HTML artifacts
- ✅ **Text Processing**: Consistent HTML entity decoding and whitespace normalization

**Technical Implementation:**
- Refactored `stripHtml()` function usage
- Enhanced `CardFullEditable.tsx` with better content processing
- Improved `CardNote.astro` text handling
- Consistent content processing across dashboard, search, and navigation

**Result**: Clean, consistent content display across all components! 📝

**Mobile Layout & Responsiveness Enhancements** ✅

- ✅ **Layout Refinements**: Improved mobile layout responsiveness and overflow handling
- ✅ **Height Management**: Better height constraints and scrollability management
- ✅ **BottomSheet System**: Enhanced BottomSheet and Sheet components for mobile panels
- ✅ **Animation Handling**: Improved animation and transition handling in mobile components
- ✅ **Viewport Settings**: Enhanced viewport and theme color settings for mobile compatibility
- ✅ **Spacing Improvements**: Better spacing and structure for mobile layouts

**Technical Implementation:**
- Enhanced `src/layouts/Layout.astro` - Mobile layout improvements
- Updated `src/components/react/BottomSheet.tsx` - Better mobile panel management
- Improved `src/components/react/Sheet.tsx` - Animation and layout handling
- Better height constraints and overflow management
- Enhanced mobile navigation and panel systems

**Result**: Polished mobile experience with smooth animations and proper layout management! 📱

**TiptapEditor Enhancements** ✅

- ✅ **Focus State Management**: Enhanced TiptapEditor with proper focus state handling
- ✅ **Scroll Position Management**: Better scroll position handling in CardFullEditable
- ✅ **Layout Improvements**: Improved layout and responsiveness in editor components
- ✅ **Accessibility**: Better tabIndex and accessibility features
- ✅ **Auto-Focus**: Auto-focus content area in NewNotePanel on mount

**Technical Implementation:**
- Enhanced `src/components/react/TiptapEditor.tsx` - Focus state management
- Updated `src/components/react/CardFullEditable.tsx` - Scroll position handling
- Improved `src/components/react/NewNotePanel.tsx` - Auto-focus and accessibility

**Result**: Better editor experience with proper focus management and accessibility! ✏️

**Navigation & Thread Management Improvements** ✅

- ✅ **Thread Management Logic**: Enhanced thread management in add-thread API
- ✅ **Active Item Management**: Improved active item management in NavigationContext
- ✅ **Persistent Navigation**: Enhanced persistent navigation logic and context integration
- ✅ **Data Attributes**: Dynamic data attributes for navigation tracking
- ✅ **Color Initialization**: Consistent color initialization in NewThreadPanel create mode

**Technical Implementation:**
- Enhanced `src/pages/api/threads/add-thread.ts` - Better thread management
- Updated `src/components/react/navigation/NavigationContext.tsx` - Active item handling
- Improved navigation state management
- Better thread color and data attribute handling

**Result**: More reliable navigation system with better thread management! 🧭

**Code Quality & Production Readiness** ✅

- ✅ **Logging Cleanup**: Removed verbose console.log statements for production readiness
- ✅ **Error Logging Enhancement**: Enhanced error logging in delete-account API
- ✅ **Code Quality**: Improved code quality across navigation and note components
- ✅ **Production Optimizations**: Cleaned up debugging code for production deployment

**Technical Implementation:**
- Removed console.log statements from production code
- Enhanced error logging in API endpoints
- Improved code quality in React components
- Better error handling and user feedback

**Result**: Production-ready code with proper logging and error handling! 🚀

**Note Type System Foundation** ✅

- ✅ **Note Type Field**: Added `noteType` field to Notes table (default, scripture, resource)
- ✅ **Database Schema**: Foundation for specialized note types
- ✅ **Scripture Type**: Fully implemented (see Scripture Metadata System above)
- ✅ **Future Extensibility**: Designed for future resource note type and other specialized types

**Technical Implementation:**
- `noteType` field in Notes table with default value 'default'
- Scripture note type fully implemented
- Foundation for resource note type (design document created)
- Extensible architecture for future note types

**Result**: Foundation for specialized note types to enhance Bible study workflow! 📚

**Design System & Documentation Updates** ✅

- ✅ **Design Updates Documentation**: Consolidated design treatment priorities in DESIGN_UPDATES.md
- ✅ **Component Documentation**: Enhanced component documentation and patterns
- ✅ **Architecture Documentation**: Updated architecture docs with new patterns and implementations
- ✅ **Design System Rules**: Figma design system rules generation support

**Result**: Better documentation and design system integration! 📖

### Jan 28, 2025

**Private Spaces Enabled** ✅

- ✅ **New Space Button Re-enabled**: "New Space" button now enabled in both desktop and mobile navigation
- ✅ **Private Spaces Only**: Users can create private spaces with full color customization
- ✅ **Shared Spaces Coming Soon**: Shared option disabled in UI with "Coming Soon" indicator (matching thread type dropdown pattern)
- ✅ **Form Updates**: Space creation form always creates private spaces (`isPublic=false`)
- ✅ **Files Modified**: 
  - `src/components/react/navigation/NavigationColumn.tsx` - Re-enabled New Space button with link to `/new-space`
  - `src/components/react/navigation/MobileNavigation.tsx` - Re-enabled New Space button with link
  - `src/pages/new-space.astro` - Updated Shared option to be disabled with "Coming Soon" text
- ✅ **Status**: Private spaces fully functional, shared spaces planned for future release

**Navigation System Complete Overhaul - SUCCESS** ✅

- ✅ **Immediate Navigation Updates**: New threads/spaces now appear in navigation immediately without requiring page refresh
- ✅ **Thread Color Backgrounds**: Proper color gradients display correctly in navigation items
- ✅ **Race Condition Elimination**: Fixed conflicts between React NavigationContext and JavaScript Layout.astro systems
- ✅ **FontAwesome Close Icons**: Restored 16px close buttons with proper hover states and click functionality
- ✅ **Synchronous localStorage Updates**: Navigation data is now updated before page redirects occur
- ✅ **Event-Driven Architecture**: Clean separation of concerns between React and JavaScript systems

**Technical Achievements:**
- Implemented synchronous localStorage updates before `window.location.href` redirects
- Added proper color-to-gradient conversion for thread/space backgrounds
- Eliminated duplicate event handling that was causing race conditions
- Created comprehensive documentation in `NAVIGATION_SYSTEM_WINS.md`

**Files Modified:**
- `src/components/react/NewThreadPanel.tsx` - Added synchronous localStorage updates
- `src/pages/new-space.astro` - Added synchronous localStorage updates
- `src/components/react/navigation/NavigationContext.tsx` - Updated to reload from localStorage
- `src/layouts/Layout.astro` - Maintained JavaScript navigation system

**Result**: Navigation system now works flawlessly with immediate updates, proper styling, and no race conditions! 🎉

### Jan 26, 2025

**Edit Thread Panel Implementation Attempt - FAILED**

- ❌ **Edit Thread Panel**: Attempted to implement missing "Edit Thread" functionality from thread page menu options
- ❌ **Custom Confirmation Dialog**: Tried to replace browser `confirm()` with custom styled dialog for delete actions
- ❌ **Event System Issues**: Complex event flow between Astro, Alpine.js, and React components proved unreliable
- ❌ **Component Architecture Problems**: Attempted to reuse `NewThreadPanel.tsx` for editing, creating confusion between create/edit modes
- ❌ **Data Flow Issues**: Thread data passing through multiple layers (Astro → Alpine.js → React) was fragile and hard to debug
- ❌ **Toast Notifications**: Delete actions still don't show success/error toasts despite event dispatching

**What Went Wrong:**
- Over-engineered solution with too many new components (`EditThreadPanel.tsx`, `ConfirmationDialog.tsx`)
- Didn't follow existing patterns in the codebase (should have studied `EditNameColorPanel.tsx`)
- Added unnecessary complexity to event system instead of using existing patterns
- Global variables and complex data flow made debugging difficult
- Tried to solve multiple problems at once instead of incrementally

**Key Lessons Learned:**
- Study existing patterns before implementing new features
- Use simpler data passing methods instead of complex event chains
- Test incrementally rather than implementing everything at once
- Follow existing codebase patterns instead of creating new ones
- Sometimes the simplest solution is the best solution

**Current State:**
- All changes have been reverted
- "Edit Thread" menu option exists but doesn't work
- No Edit Thread Panel exists
- Toast notifications for delete actions still don't work
- Need to approach this problem more systematically next time

**Documentation Created:**
- `EDIT_THREAD_ATTEMPT.md` - Comprehensive documentation of the failed attempt and lessons learned

### Jan 22, 2025

**Rich Text Editor Migration & Content Processing**

- ✅ **TiptapEditor Integration**: Successfully implemented TiptapEditor for rich text editing in React components
- ✅ **NewNotePanel Editor**: React version uses TiptapEditor for creating new notes with full rich text support
- ✅ **Inline Note Editing**: Implemented inline editing functionality for existing notes with TiptapEditor integration
- ✅ **React Islands Architecture**: TiptapEditor works seamlessly within React Islands pattern
- ✅ **Font Styling Consistency**: Applied app's Reddit Sans font family to all editors to match existing design
- ✅ **HTML Content Processing**: Implemented comprehensive HTML stripping across all content preview components
- ✅ **Content Display Optimization**: Fixed HTML tags showing in note previews across dashboard, search, and navigation components

**Rich Text Editor Features:**
- Bold, italic, underline formatting
- Ordered and unordered lists
- Clean, distraction-free interface
- Consistent font styling with app theme
- Real-time content updates
- Proper form submission integration

**Technical Implementation:**
- New `src/components/react/TiptapEditor.tsx` component for React Islands
- Enhanced `src/components/react/NewNotePanel.tsx` with TiptapEditor integration (used via NewNotePanelSimple.astro wrapper)
- Updated `src/components/react/CardFullEditable.tsx` for inline note editing
- Comprehensive HTML stripping in `CardNote.astro`, `CardFeat.astro`, and data utilities
- Global callback system for save functionality using `window.noteSaveCallback`
- Robust initialization logic with multiple fallback mechanisms
- **Architecture**: Layout.astro → NewNotePanelSimple.astro → NewNotePanel.tsx → TiptapEditor.tsx

**Content Processing Improvements:**
- Added `stripHtml()` function across all content display components
- Fixed HTML tags appearing in note previews on dashboard, search, and thread pages
- Consistent content truncation with proper HTML entity decoding
- Clean text display in all card components and navigation elements

**UI/UX Enhancements:**
- Removed redundant "Edit Note" option from more menu (replaced by inline editing)
- Improved note editing workflow with click-to-edit functionality
- Better content preview display without HTML artifacts
- Seamless integration with existing Alpine.js state management

**Profile Panel System & Avatar Customization**

- ✅ **Profile Panel System**: Implemented comprehensive profile editing system with dedicated panels
- ✅ **Edit Name & Color Panel**: Created `EditNameColorPanel.astro` for customizing first name, last name, and avatar color
- ✅ **Dynamic Avatar Colors**: Users can choose from 8 beautiful colors for their avatar (Paper, Blessed Blue, Mindful Mint, Graceful Gold, Pleasant Peach, Caring Coral, Peaceful Pink, Lovely Lavender)
- ✅ **Real-time Updates**: Avatar colors and initials update immediately across desktop navigation
- ✅ **Database Persistence**: User color preferences are saved to `UserMetadata` table and persist across sessions
- ✅ **Clerk Integration**: First name and last name changes are saved to Clerk authentication system
- ✅ **Panel Transitions**: Smooth view transitions matching other panels in the app
- ✅ **Toast Notifications**: Success feedback when profile is updated
- ✅ **XP Icon Update**: Updated XP icon to Font Awesome bolt icon on profile page

**Profile Features:**
- Name display format: "First Name + Last Initial" (e.g., "John D")
- Avatar initials format: "First Initial + Last Initial" (e.g., "JD")
- Color selection with pre-checked default (Paper)
- Full-width save button with primary blue styling
- Auto-close panel after successful save
- Dynamic placeholders that show existing names when editing

**Technical Implementation:**
- New `src/components/EditNameColorPanel.astro` component with Alpine.js state management
- New API endpoints: `/api/user/update-profile.ts` and `/api/user/get-profile.ts`
- Enhanced `src/components/Avatar.astro` with dynamic color prop support
- Updated all pages to fetch and pass `userColor` to Avatar components
- Global `updateAllAvatars` function for real-time avatar updates
- Database schema update: Added `userColor` field to `UserMetadata` table

**Known Issues:**
- Mobile navigation avatar color does not update in real-time (desktop works perfectly)
- Mobile avatar shows correct color on page refresh but not during live updates
- Issue appears to be CSS specificity or DOM structure related
- **EditNameColorPanel Navigation Retention Issue**: When navigating away from profile page and returning, the EditNameColorPanel does not retain the saved first name, last name, and color values. The component shows empty placeholders instead of the actual saved values. This is due to Astro template interpolation issues in Alpine.js x-data attributes. Multiple approaches have been attempted including data attributes, event-driven initialization, and direct template interpolation, but the issue persists. The API calls work correctly and data is saved properly, but the component initialization fails to display the correct values after navigation.

**Space Creation & Navigation System Enhancement**

- ✅ **New Space Creation**: Added complete space creation functionality with dedicated `/new-space` page
- ✅ **Space Form Design**: Implemented space creation form similar to NewThreadPanel with title input and tabs
- ✅ **Space API Endpoint**: Created `/api/spaces/create` endpoint for space creation with proper validation
- ✅ **Persistent Navigation Integration**: Spaces now appear in persistent navigation when accessed
- ✅ **Active State Styling**: Active spaces show proper background gradient and shadow styling
- ✅ **Confirmation Dialog**: Added confirmation dialog when closing spaces (since they can't be recovered)
- ✅ **Navigation Consistency**: Spaces behave like threads in navigation - appear when accessed, closable when not active
- ✅ **Data Attributes**: Proper space data attributes for navigation tracking and active state detection

**Space Features:**
- Spaces always use "paper" color as specified
- Spaces redirect to their page after creation (`/space_id`)
- Spaces show in persistent navigation with proper active/inactive states
- Spaces require confirmation before closing (permanent removal)
- Spaces display item counts (threads + notes) in navigation

**Technical Implementation:**
- New `src/pages/new-space.astro` page with form and tab navigation
- New `src/pages/api/spaces/create.ts` API endpoint
- Enhanced `src/components/PersistentNavigation.astro` for space support
- Updated `src/pages/[id].astro` for proper space data attribute handling
- Modified navigation filtering to show active spaces (unlike threads)
- Added space-specific confirmation dialogs in close handlers

**Navigation System Updates:**
- Removed static space lists to prevent duplicates
- Spaces now only appear in persistent navigation when accessed
- Active spaces show with proper shadow styling and background gradients
- Close confirmation prevents accidental space removal
- Consistent behavior with threads but with space-specific protections

### Jan 21, 2025

**XP System & Gamification Implementation**

- ✅ **XP System**: Implemented comprehensive Experience Points system to gamify user engagement
- ✅ **Automatic XP Awarding**: XP is automatically awarded when users create threads (10 XP) and notes (10 XP)
- ✅ **Daily Bonuses**: First note of each day earns +5 XP bonus
- ✅ **Smart Daily Caps**: Note opening XP capped at 50 per day to prevent gaming
- ✅ **Dynamic Profile Display**: Profile page now shows real-time XP instead of hardcoded value
- ✅ **Backfill System**: Can retroactively calculate XP for existing users and content
- ✅ **Database Schema**: Added UserXP table to track all XP activities and amounts

**XP Values & Rules:**
- Creating a new thread: 10 XP
- Creating a full note: 10 XP
- Opening notes/threads: 1 XP (50 XP daily cap)
- First note of the day: +5 XP bonus

**Technical Implementation:**
- New `UserXP` table in database schema with activity tracking
- `src/utils/xp-system.ts` utility for XP calculation and awarding
- Integration into note and thread creation endpoints and actions
- API endpoints: `/api/user/xp` for XP data, `/api/test/xp` for testing
- Real-time XP display on profile page with dynamic updates

**Future Expansion Ready:**
- Designed to support levels, badges, and achievement systems
- Metadata field in UserXP table for additional data storage
- Configurable XP values and activity types for easy expansion

**NewThreadPanel Search Functionality & Tab Persistence**

- ✅ **Fixed tab persistence**: NewThreadPanel tabs now maintain their state when navigating between pages
- ✅ **Implemented search functionality**: Added working search within NewThreadPanel using client-side API calls
- ✅ **Fixed Enter key behavior**: Removed dropdown opening on Enter key press in search input
- ✅ **Alpine.js scope handling**: Resolved Alpine.js scope issues with global search function approach
- ✅ **Search results display**: Added proper search results rendering with CardFeat components
- ✅ **localStorage integration**: Tab state persists across page navigations using localStorage

**Technical Implementation:**
- Used global `window.newThreadPanelSearch` function to bypass Alpine.js scope limitations
- Client-side search via `/api/search` endpoint for real-time results
- Proper error handling and result clearing for short queries
- Custom search input with clear functionality and proper styling

**Key Lessons Learned:**
- Server-side data injection into Alpine.js `x-data` attributes doesn't work reliably
- Global functions are sometimes necessary to work around Alpine.js scope limitations
- Client-side API calls provide better UX for real-time search functionality
- The "cleaner" approach isn't always the right approach for complex client-server interactions

### Aug 8, 2025 

Added Toast-v2 components. 

Next up: select button

### Jul 25, 2025

Created ActionButton and SelectColor components.

Next up: Update Toast.