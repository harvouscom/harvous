# Profile System Priorities for Cam - Week 2 Focus

## 🎯 **Overview**

This document outlines two critical focus areas for Week 2 that are **BLOCKING V1 release**:

1. **Profile System Refactor** (CRITICAL + HIGH Priority) - 5-7 days
2. **Settings Panel System** (HIGH Priority) - 1-2 days

Both issues are contained within the profile page, making this a cohesive area of work that will significantly improve code quality, performance, and user experience.

---

## 🚨 **Priority 1: Profile System Refactor**

### **Problem Statement**

The profile page (`src/pages/profile.astro`) has **705 lines** with **400+ lines of complex JavaScript** that handles:

1. **CRITICAL**: Profile updates (name, initials, color) don't consistently update across the app
2. **HIGH**: Poor performance due to complex event handling and DOM manipulation
3. **HIGH**: Difficult to maintain and debug due to excessive complexity

### **Current Issues**

#### **Avatar Update System Problems**
- **Multiple update paths**: Profile updates trigger updates in `profile.astro`, `EditNameColorPanel.tsx`, and `avatar-manager-global.js`
- **Complex selector system**: Uses 10+ different selectors to find avatars (`.avatar-button`, `[data-avatar-color]`, `#mobile-navigation-avatar`, etc.)
- **Event listener conflicts**: Multiple overlapping event listeners (`updateProfileRequest`, `updateProfile`, `avatarUpdated`)
- **Inconsistent behavior**: Updates work in some contexts but fail in others (mobile navigation avatar doesn't update in real-time)
- **SessionStorage complexity**: Profile data stored in sessionStorage but sync logic is scattered

#### **Code Quality Issues**
- **700+ lines** in a single Astro file with complex TypeScript in `<script>` tags
- **100+ console.log statements** for debugging
- **Multiple initialization functions** that conflict with View Transitions
- **Complex DOM queries** using attribute selectors like `div[style*="background-color"]`
- **No proper state management** - relies on direct DOM manipulation

### **Current Architecture**

#### **File Structure**
```
src/pages/profile.astro                    # 705 lines (main problem)
src/components/EditNameColorPanelReact.astro
src/components/react/EditNameColorPanel.tsx # React component (works well)
src/components/EmailPasswordPanelReact.astro
src/components/react/EmailPasswordPanel.tsx # React component (works well)
public/scripts/avatar-manager-global.js     # Global avatar updater
src/pages/api/user/update-profile.ts       # API endpoint (works well)
src/pages/api/user/update-credentials.ts   # API endpoint (works well)
```

#### **Key Code Locations**

**Profile Update Flow** (currently problematic):
1. User submits form in `EditNameColorPanel.tsx` (lines 107-212)
2. Makes API call to `/api/user/update-profile`
3. API updates Clerk and database (works correctly)
4. Component updates sessionStorage and dispatches events
5. `profile.astro` listens for `updateProfileRequest` (lines 357-468)
6. Also listens for `updateProfile` event (lines 644-687)
7. Calls `window.updateAllAvatars()` from `avatar-manager-global.js`
8. Avatar manager uses selector `.avatar-button[data-avatar-color]` (line 12)
9. Updates DOM directly with `style.backgroundColor` and `textContent`

**Panel Switching** (currently problematic):
- Panel switching logic in `profile.astro` (lines 559-599)
- Uses simple `display: none/block` toggling
- Event-driven via `openProfilePanel` / `closeProfilePanel` events
- Only works on desktop (`window.innerWidth >= 1160`)

### **Recommended Solution**

#### **Phase 1: Convert Profile Page to React Component (3-4 days)**

**Goal**: Move all profile page logic to a React component for better state management and performance.

**Structure**:
```
src/components/react/ProfilePage.tsx       # New React component
src/pages/profile.astro                     # Simplified to shell (props only)
```

**Key Changes**:
1. **Extract all JavaScript** from `profile.astro` into React hooks
2. **Use React state** instead of DOM manipulation for:
   - Panel visibility (`useState` for active panel)
   - Profile data (`useState` + `useEffect` for loading)
   - Form submission handling
3. **Create custom hooks**:
   - `useProfileData()` - Load and manage profile data
   - `useAvatarUpdates()` - Handle avatar updates across app
   - `useProfilePanels()` - Manage panel switching
4. **Simplify avatar updates**:
   - Single source of truth for avatar updates
   - Use React Context or custom hook instead of global function
   - Proper event system with cleanup

**Benefits**:
- ✅ 70% code reduction (from 700+ lines to ~200-300 lines)
- ✅ Better performance (React virtual DOM vs direct DOM manipulation)
- ✅ Easier debugging (React DevTools, clear state flow)
- ✅ Type safety (TypeScript in React component vs script tags)
- ✅ Consistent architecture (matches rest of app using React Islands)

#### **Phase 2: Fix Avatar Update System (1-2 days)**

**Goal**: Create a reliable, single-source avatar update system.

**Approach**:
1. **Create React Context** for avatar state:
   ```typescript
   // src/components/react/contexts/AvatarContext.tsx
   interface AvatarContextType {
     color: string;
     initials: string;
     updateAvatar: (color: string, initials: string) => Promise<void>;
   }
   ```
2. **Provide context** at Layout level so all components have access
3. **Replace global function** `updateAllAvatars` with context-based updates
4. **Use Context API** instead of DOM queries:
   - Components subscribe to avatar changes
   - React handles re-renders automatically
   - No need for complex selectors

**Benefits**:
- ✅ Consistent updates across all avatar instances
- ✅ No DOM queries needed (React handles rendering)
- ✅ Works on mobile and desktop automatically
- ✅ Easier to test and debug

#### **Phase 3: Clean Up & Optimize (1 day)**

**Goal**: Remove debug code, optimize performance, add proper error handling.

**Tasks**:
1. Remove excessive `console.log` statements (keep only critical ones)
2. Add proper error boundaries for React components
3. Optimize re-renders with `useMemo` and `useCallback`
4. Clean up sessionStorage logic (keep for persistence, simplify sync)

### **Implementation Steps**

#### **Step 1: Create ProfilePage React Component**
1. Create `src/components/react/ProfilePage.tsx`
2. Extract all state management from `profile.astro`
3. Convert panel switching to React state
4. Move profile update handlers to React hooks

#### **Step 2: Create Avatar Context**
1. Create `src/components/react/contexts/AvatarContext.tsx`
2. Provide context in `Layout.astro`
3. Update all avatar components to use context
4. Remove global `updateAllAvatars` function

#### **Step 3: Simplify profile.astro**
1. Convert to shell component (just data fetching and props)
2. Pass data to `ProfilePage` React component
3. Use `client:load` directive for ProfilePage

#### **Step 4: Test & Debug**
1. Test profile updates (name, color) across all avatar instances
2. Verify mobile and desktop both work
3. Test panel switching
4. Verify View Transitions still work

### **Files to Modify**

**New Files**:
- `src/components/react/ProfilePage.tsx` - Main React component
- `src/components/react/contexts/AvatarContext.tsx` - Avatar state management

**Files to Refactor**:
- `src/pages/profile.astro` - Simplify to shell (reduce from 705 to ~100 lines)
- `public/scripts/avatar-manager-global.js` - Can be removed after Context implementation

**Files to Update**:
- `src/components/react/EditNameColorPanel.tsx` - Use Avatar Context instead of global function
- `src/components/react/navigation/NavigationColumn.tsx` - Use Avatar Context
- `src/components/react/navigation/MobileNavigation.tsx` - Use Avatar Context
- `src/layouts/Layout.astro` - Provide Avatar Context

### **Testing Checklist**

- [ ] Profile name updates immediately across all avatars (desktop + mobile)
- [ ] Avatar color updates immediately across all avatars (desktop + mobile)
- [ ] Initials update correctly when name changes
- [ ] Changes persist after page refresh
- [ ] Panel switching works smoothly (desktop only)
- [ ] Edit Name & Color panel opens/closes correctly
- [ ] Email & Password panel opens/closes correctly
- [ ] View Transitions don't break profile updates
- [ ] No console errors or warnings
- [ ] Performance is acceptable (no lag on updates)

---

## 🚨 **Priority 2: Settings Panel System**

### **Problem Statement**

The settings panels (Email & Password, My Church, My Data, Get Support) have broken panel switching logic. Currently:
- Panels show "coming soon..." placeholders
- Panel switching system doesn't work reliably
- No proper state management for panel visibility

### **Current Issues**

#### **Panel Switching Problems**
- **Simple display toggling**: Uses `display: none/block` (lines 560-581 in `profile.astro`)
- **Event-driven but fragile**: Relies on custom events that may not fire correctly
- **No mobile support**: Only works on desktop (`window.innerWidth >= 1160`)
- **Placeholder panels**: 3 panels just show "coming soon..." text

#### **Current Implementation**

**Panel Structure** (lines 258-292 in `profile.astro`):
```astro
<div slot="additional" class="h-full additional-slot" id="profile-panels">
  <div id="default-panel" class="flex flex-col items-left h-full justify-end">
    <!-- Empty -->
  </div>
  
  <div id="editNameColor-panel" class="h-full" style="display: none;">
    <EditNameColorPanel ... />
  </div>
  
  <div id="emailPassword-panel" class="h-full" style="display: none;">
    <EmailPasswordPanel />
  </div>
  
  <div id="myChurch-panel" style="display: none;">
    <div class="text-center ...">
      <p>My Church panel coming soon...</p>
    </div>
  </div>
  
  <!-- Similar for myData-panel and getSupport-panel -->
</div>
```

**Panel Switching Logic** (lines 559-599 in `profile.astro`):
```typescript
function showPanel(panelName: string) {
  document.querySelectorAll('#profile-panels [id$="-panel"]').forEach((panel) => {
    (panel as HTMLElement).style.display = 'none';
  });
  const targetPanel = document.getElementById(`${panelName}-panel`);
  if (targetPanel) {
    targetPanel.style.display = 'block';
  }
}

function setupPanelListeners() {
  window.addEventListener('openProfilePanel', (event) => {
    if (window.innerWidth >= 1160) {
      const panelName = event.detail?.panelName;
      if (panelName) {
        showPanel(panelName);
      }
    }
  });
}
```

### **Recommended Solution**

#### **Option A: Fix Panel Switching (Quick Fix - 1 day)**

**Goal**: Fix the existing panel switching system to work reliably.

**Changes**:
1. **Improve panel management**:
   - Add proper state tracking (which panel is active)
   - Fix edge cases (closing panels, opening same panel twice)
   - Add proper cleanup on panel close

2. **Fix mobile support**:
   - Integrate with existing `BottomSheet` system for mobile
   - Use same event system but route to bottom sheet on mobile

3. **Keep placeholders for now**:
   - Maintain "coming soon..." for My Church, My Data, Get Support
   - Focus on making panel switching work correctly

**Implementation**:
```typescript
// In ProfilePage React component (after refactor)
const [activePanel, setActivePanel] = useState<string | null>(null);

const openPanel = (panelName: string) => {
  setActivePanel(panelName);
};

const closePanel = () => {
  setActivePanel(null);
};
```

#### **Option B: Create Settings Panel Components (Full Implementation - 2 days)**

**Goal**: Create proper React components for all settings panels.

**Panels to Create**:
1. **My Church Panel** - Church selection/management
2. **My Data Panel** - Data export/download
3. **Get Support Panel** - Contact support, help docs

**Structure**:
```
src/components/react/settings/
  MyChurchPanel.tsx
  MyDataPanel.tsx
  GetSupportPanel.tsx
```

**Recommendation**: Start with **Option A** (fix switching) since it's faster and unblocks the feature. Then implement **Option B** if time permits or in a future iteration.

### **Implementation Steps**

#### **Step 1: Fix Panel Switching (if doing ProfilePage refactor first)**
- Panel switching will be handled by React state in `ProfilePage.tsx`
- No separate implementation needed

#### **Step 2: Create Settings Panel Components (if time permits)**
1. Create placeholder components with proper structure
2. Match design pattern from `EditNameColorPanel.tsx`
3. Integrate with panel switching system

### **Files to Modify**

**If doing Option A only**:
- `src/pages/profile.astro` (will be simplified during ProfilePage refactor)
- Panel switching logic moves to React state

**If doing Option B**:
- `src/components/react/settings/MyChurchPanel.tsx` - New
- `src/components/react/settings/MyDataPanel.tsx` - New
- `src/components/react/settings/GetSupportPanel.tsx` - New
- `src/pages/profile.astro` - Import and use new components

### **Testing Checklist**

- [ ] Panel switching works smoothly (no flickering)
- [ ] Correct panel opens when button clicked
- [ ] Panels close correctly (back button, overlay click)
- [ ] Only one panel shows at a time
- [ ] Desktop panel switching works (>= 1160px)
- [ ] Mobile uses bottom sheet system (if implemented)
- [ ] No console errors

---

## 📋 **Recommended Approach**

### **Week 2 Timeline**

**Days 1-4: Profile System Refactor**
- Day 1: Create `ProfilePage.tsx` React component, extract state management
- Day 2: Create `AvatarContext.tsx`, migrate avatar updates
- Day 3: Simplify `profile.astro`, integrate ProfilePage
- Day 4: Test, debug, and polish

**Day 5: Settings Panel System**
- Fix panel switching logic (handled by React state from refactor)
- Create placeholder components if time permits

**Days 6-7: Buffer & Polish**
- Fix any issues discovered during testing
- Performance optimization
- Code cleanup and documentation

### **Success Criteria**

✅ **Profile System**:
- Profile updates work consistently across all avatars (mobile + desktop)
- Code reduced from 705 lines to <300 lines
- React-based architecture matching rest of app
- No performance issues

✅ **Settings Panel System**:
- Panel switching works reliably
- Clean state management
- Ready for future panel implementations

---

## 🔗 **Related Documentation**

- **CAM_SUMMARY.md** - Full project overview and context
- **REACT_ISLANDS_STRATEGY.md** - React Islands architecture patterns
- **ARCHITECTURE.md** - Database schema, component structure
- **PROFILE_PERSISTENCE_SOLUTION.md** - Profile data persistence implementation
- **REFACTORING_PLAN.md** - General refactoring guidelines

---

## 💡 **Key Insights**

1. **Both priorities are in the same file** - Refactoring `profile.astro` will fix both issues
2. **React Islands pattern** - Match existing architecture (NewNotePanel, NoteDetailsPanel, etc.)
3. **Avatar Context** - Use React Context instead of global functions for better state management
4. **Mobile/Desktop unified** - Same components work for both (React handles this)
5. **View Transitions** - Ensure React components work with Astro's View Transitions

---

## 🚀 **Questions or Issues?**

If you encounter any issues or need clarification:
1. Check existing React Islands implementations (NewNotePanel, NoteDetailsPanel)
2. Review Avatar component implementations (`src/components/react/navigation/Avatar.tsx`)
3. Consult React Islands Strategy document for patterns

**You've got this! The foundation is solid and these changes will significantly improve code quality and user experience.** 🎯

