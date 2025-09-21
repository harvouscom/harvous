### Jan 21, 2025

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