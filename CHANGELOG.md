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