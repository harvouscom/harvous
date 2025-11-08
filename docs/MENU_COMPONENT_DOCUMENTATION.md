# Menu Component Documentation

## Overview

The `Menu.tsx` component is a consolidated, reusable React component that provides dynamic menu functionality for the Harvous application. It replaces the previous separate `AddMenu.tsx` and `ContextMoreMenu.tsx` components, providing a single unified interface for all menu interactions.

**Location**: `src/components/react/Menu.tsx`

## Purpose

The Menu component serves as a flexible menu system that:
- Displays a list of action options with icons and labels
- Handles various actions including creation, editing, deletion, and navigation
- Provides confirmation dialogs for destructive actions (erase)
- Integrates with the SquareButton component for consistent UI/UX
- Uses React Portals for modal dialogs that escape z-index constraints

## Key Features

### 1. **Dynamic Menu Options**
The component accepts an array of menu options, each with:
- `action`: String identifier for the action (e.g., `"eraseNote"`, `"openNewThreadPanel"`)
- `label`: Display text for the menu item
- `icon`: SVG icon imported from FontAwesome

### 2. **Context-Aware Actions**
The menu adapts its behavior based on:
- `contentType`: The type of content being acted upon (`"thread"`, `"note"`, `"space"`, `"dashboard"`, `"profile"`)
- `contentId`: The unique identifier of the content item

### 3. **Confirmation Dialogs**
For destructive actions (erase), the component:
- Shows a modal confirmation dialog before executing
- Prevents body scroll when dialog is open
- Uses React Portals to render outside the normal DOM hierarchy
- Maintains component state during async operations

### 4. **Event-Driven Architecture**
The component dispatches custom events for inter-component communication:
- `openNewThreadPanel` / `openNewNotePanel`: Create new content
- `openEditThreadPanel` / `openEditSpacePanel`: Edit existing content
- `openNoteDetailsPanel`: View note details
- `threadDeleted` / `noteDeleted` / `spaceDeleted`: Content deletion notifications
- `closeMoreMenu`: Close the parent menu container

## Component API

### Props

```typescript
interface MenuProps {
  options: MenuOption[];           // Array of menu items to display
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;             // ID of the content being acted upon
  onClose?: () => void;           // Optional callback when menu closes
}

interface MenuOption {
  action: string;                 // Action identifier
  label: string;                  // Display text
  icon: any;                      // SVG icon (FontAwesome import)
}
```

### Usage Example

```typescript
import Menu from '@/components/react/Menu';
import ThreadIcon from "@fortawesome/fontawesome-free/svgs/solid/layer-group.svg";
import NoteStickyIcon from "@fortawesome/fontawesome-free/svgs/solid/note-sticky.svg";

const options = [
  { action: "openNewThreadPanel", label: "New Thread", icon: ThreadIcon },
  { action: "openNewNotePanel", label: "New Note", icon: NoteStickyIcon }
];

<Menu
  options={options}
  contentType="dashboard"
/>
```

## Action Handling

### Supported Actions

#### Creation Actions
- `openNewThreadPanel`: Opens panel to create a new thread
- `openNewNotePanel`: Opens panel to create a new note

#### Editing Actions
- `editThread`: Opens edit panel for a thread
- `editSpace`: Opens edit panel for a space

#### View Actions
- `seeDetails`: Opens details panel for a note

#### Destructive Actions
- `eraseThread`: Deletes a thread (requires confirmation)
- `eraseNote`: Deletes a note (requires confirmation)
- `eraseSpace`: Deletes a space (requires confirmation)

### Action Flow

1. **Non-Destructive Actions**:
   - User clicks menu item
   - Menu closes immediately
   - Custom event dispatched
   - Parent component handles the action

2. **Destructive Actions (Erase)**:
   - User clicks "Erase" menu item
   - Menu stays open
   - Confirmation dialog appears (via Portal)
   - User confirms or cancels
   - If confirmed: API call executes, menu closes, redirect occurs
   - If cancelled: Dialog closes, menu remains open

## Erase Functionality

### API Endpoints

The component automatically determines the correct API endpoint based on `contentType`:

- **Threads**: `DELETE /api/threads/delete?threadId={contentId}`
- **Notes**: `DELETE /api/notes/delete?noteId={contentId}`
- **Spaces**: `DELETE /api/spaces/delete?spaceId={contentId}`

### Authentication

All delete requests include `credentials: 'include'` to ensure authentication cookies are sent with the request.

### Success Flow

1. API call succeeds
2. Deletion event dispatched (`threadDeleted`, `noteDeleted`, or `spaceDeleted`)
3. User redirected to dashboard with success toast: `/dashboard?toast=success&message={message}`

### Error Handling

- Network errors: Error toast or alert shown
- API errors: Error message from API response displayed
- Missing data: Error shown if `contentId` or `contentType` is missing

## Portal-Based Confirmation Dialog

### Why Portals?

The confirmation dialog uses React Portals (`createPortal`) to render to `document.body` instead of the normal component tree. This ensures:

1. **Z-Index Management**: Dialog appears above all other content
2. **Overflow Escape**: Dialog visible even if parent has `overflow: hidden`
3. **Viewport Coverage**: Full-screen overlay works correctly

### Dialog Features

- **Accessibility**: `role="dialog"` and `aria-modal="true"` attributes
- **Click-Outside**: Clicking overlay closes dialog (cancels action)
- **Scroll Lock**: Body scroll prevented when dialog is open
- **Safe Area**: Padding respects device safe areas (notches, etc.)

### Portal Click-Outside Handling

**Important**: The parent `SquareButton` component's click-outside handler must be configured to ignore clicks on the portaled dialog. See `REACT_PORTAL_CLICK_OUTSIDE_LESSONS.md` for details.

## State Management

### Internal State

```typescript
const [showConfirmDialog, setShowConfirmDialog] = useState(false);
const [pendingAction, setPendingAction] = useState<string | null>(null);
```

- `showConfirmDialog`: Controls visibility of confirmation dialog
- `pendingAction`: Stores the action to execute after confirmation

### State Flow for Erase Actions

1. User clicks "Erase" → `pendingAction` set, `showConfirmDialog` = `true`
2. Dialog appears, user confirms → `showConfirmDialog` = `false`
3. Action executes → `pendingAction` cleared
4. Menu closes → Component may unmount

**Critical**: The action must execute **before** closing the menu to ensure the component stays mounted during the async API call.

## Integration with SquareButton

The Menu component is typically rendered as a child of `SquareButton`:

```typescript
// In SquareButton.tsx
{withMenu && menuOptions.length > 0 && isOpen && (
  <div className="more-menu-container">
    <Menu
      options={menuOptions}
      contentType={contentType}
      contentId={contentId}
    />
  </div>
)}
```

### Event Communication

- **Menu → SquareButton**: Dispatches `closeMoreMenu` event to close parent
- **SquareButton → Menu**: Click-outside handler respects portal dialogs

## Styling

### CSS Classes

- `.menu`: Main menu container (white background, rounded corners)
- `.menu-item`: Individual menu option buttons
- `.menu-separator`: Subtle border between menu items

### Custom Styles

The component includes inline styles for:
- Menu minimum width (223px)
- Button styling (no borders, outlines, or shadows)

### Dialog Styling

- Full-screen overlay: `fixed inset-0` with semi-transparent black background
- Dialog box: White background, rounded corners, max-width constraint
- Z-index: `z-[100]` to appear above all content

## Error Handling

### User-Facing Errors

- Missing `contentId` or `contentType`: Toast/alert shown
- API errors: Error message from API response displayed
- Network errors: Generic error message with console logging

### Error Logging

- `console.error()` used for debugging (not user-facing)
- Error details logged to console for development
- Production errors still shown via toast/alert

## Best Practices

### 1. **Always Provide contentType and contentId**
For context menus (More button), always pass both props:
```typescript
<Menu
  options={menuOptions}
  contentType="note"
  contentId={noteId}
/>
```

### 2. **Handle Menu Options via Utility**
Use `getMenuOptions()` from `@/utils/menu-options` to generate options based on context:
```typescript
import { getMenuOptions } from "@/utils/menu-options";
const options = getMenuOptions(contentType, contentId);
```

### 3. **Use Appropriate Icons**
Import FontAwesome SVG icons directly:
```typescript
import EraseIcon from "@fortawesome/fontawesome-free/svgs/solid/eraser.svg";
```

### 4. **Test Portal Interactions**
Always test that:
- Dialog appears and stays visible
- Click-outside doesn't close menu when dialog is open
- Dialog can be interacted with normally
- Cancel and confirm buttons work correctly

## Migration from Legacy Components

### From AddMenu.tsx
- **Before**: Separate component for "Add" button menu
- **After**: Pass `options` with `openNewThreadPanel` and `openNewNotePanel` actions

### From ContextMoreMenu.tsx
- **Before**: Separate component for "More" button menu
- **After**: Pass `options` from `getMenuOptions(contentType, contentId)`

### Benefits of Consolidation
- Single codebase for menu logic
- Consistent styling and behavior
- Easier maintenance and updates
- Unified event handling

## Related Components

- **SquareButton.tsx**: Parent component that renders Menu
- **EraseConfirmDialog.tsx**: Confirmation dialog buttons
- **ButtonSmall.tsx**: Small buttons used in confirmation dialog

## Related Documentation

- `REACT_PORTAL_CLICK_OUTSIDE_LESSONS.md`: Portal click-outside handling
- `REACT_ISLANDS_STRATEGY.md`: React Islands architecture
- `ARCHITECTURE.md`: Overall application architecture

## Future Enhancements

Potential improvements:
- [ ] Keyboard navigation support (arrow keys, Enter, Escape)
- [ ] Focus trapping in confirmation dialog
- [ ] Animation transitions for menu/dialog appearance
- [ ] Support for sub-menus or nested options
- [ ] Loading states during async operations
- [ ] Customizable dialog messages per content type

---

**Last Updated**: November 4, 2025
**Component Version**: 1.0
**Status**: Production Ready

