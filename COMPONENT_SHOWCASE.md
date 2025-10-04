# Harvous Component Showcase

This document showcases all the Harvous components built with shadcn/ui, their purposes, and where they'll be used in the application.

## 🎨 Base shadcn/ui Components

### Button
**Purpose**: Primary interaction component for all user actions
**Usage**: 
- Primary actions (Create Note, Save, Submit)
- Secondary actions (Cancel, Edit, Delete)
- Navigation buttons
- Icon buttons for toolbars

**Variants**:
- `default`: Primary actions
- `secondary`: Secondary actions  
- `outline`: Subtle actions
- `ghost`: Minimal actions
- `destructive`: Delete/dangerous actions

### Card
**Purpose**: Container for content blocks
**Usage**:
- Note cards
- Thread cards
- Space cards
- Dashboard widgets
- Settings panels

**Sub-components**:
- `CardHeader`: Title and metadata
- `CardContent`: Main content
- `CardFooter`: Actions and additional info

### Badge
**Purpose**: Status indicators and labels
**Usage**:
- Note status (Featured, Public)
- Thread status (Pinned, Public)
- XP level indicators
- Tag labels

### Avatar
**Purpose**: User and item identification
**Usage**:
- User profile pictures
- Note ID indicators (N001, N002, etc.)
- Thread/space icons

### Input
**Purpose**: Text input fields
**Usage**:
- Search functionality
- Form inputs
- Note titles
- Thread/space names

### DropdownMenu
**Purpose**: Context menus and actions
**Usage**:
- Note/thread/space action menus
- User profile menus
- Settings menus

## 🏗️ Harvous-Specific Components

### NoteCard
**Purpose**: Display individual notes with actions
**Where Used**:
- Dashboard recent notes
- Thread note listings
- Search results
- Featured notes section

**Features**:
- Note ID display (N001, N002, etc.)
- Content preview (first 150 chars)
- Featured status indicator
- Public/private status
- Action menu (Edit, Delete, Toggle Featured)
- Character count

**Props**:
- `note`: Note object
- `onPress`: Navigate to note
- `onEdit`: Edit note
- `onDelete`: Delete note
- `onToggleFeatured`: Toggle featured status

### ThreadCard
**Purpose**: Display thread collections with metadata
**Where Used**:
- Dashboard thread listings
- Space thread organization
- Navigation history
- Search results

**Features**:
- Color-coded thread indicators
- Note count display
- Pinned status indicator
- Public/private status
- Action menu (Edit, Delete, Pin/Unpin)
- Last updated timestamp

**Props**:
- `thread`: Thread object
- `onPress`: Navigate to thread
- `onEdit`: Edit thread
- `onDelete`: Delete thread
- `onTogglePin`: Pin/unpin thread

### SpaceCard
**Purpose**: Display space containers with organization info
**Where Used**:
- Dashboard space listings
- Space management
- Navigation history
- Settings panels

**Features**:
- Folder icon with color coding
- Item count display
- Active status indicator
- Public/private status
- Action menu (Settings, Edit, Delete)
- Creation date

**Props**:
- `space`: Space object
- `onPress`: Navigate to space
- `onEdit`: Edit space
- `onDelete`: Delete space
- `onSettings`: Open space settings

### NavigationItem
**Purpose**: Persistent navigation history items
**Where Used**:
- Navigation sidebar
- Recent items
- Quick access menu

**Features**:
- Type-specific icons (thread, space, note)
- Item count display
- Last accessed timestamp
- Remove functionality
- Color-coded by type

**Props**:
- `item`: NavigationItem object
- `onPress`: Navigate to item
- `onRemove`: Remove from navigation

### SearchInput
**Purpose**: Global search functionality
**Where Used**:
- Header search bar
- Dashboard search
- Mobile search drawer

**Features**:
- Search icon
- Clear button
- Placeholder text
- Real-time search

**Props**:
- `value`: Search query
- `onChange`: Search query handler
- `placeholder`: Placeholder text
- `onClear`: Clear search handler

### ColorPicker
**Purpose**: Color selection for spaces and threads
**Where Used**:
- Space creation/editing
- Thread creation/editing
- Settings panels

**Features**:
- 8 Harvous color options
- Visual color swatches
- Selected state indication
- Grid layout

**Props**:
- `selectedColor`: Currently selected color
- `onColorSelect`: Color selection handler

### XPCounter
**Purpose**: Gamification and progress tracking
**Where Used**:
- User profile
- Dashboard header
- Achievement displays

**Features**:
- XP display
- Level calculation
- Progress bar
- Achievement badges
- Next level progress

**Props**:
- `xp`: Current XP points
- `level`: Current level (optional)
- `showLevel`: Show level badge
- `showBadges`: Show achievement badges

## 🎯 Component Usage Patterns

### Dashboard Layout
```
┌─────────────────────────────────────────────────────────┐
│ Header: SearchInput + XPCounter + User Menu            │
├─────────────────────────────────────────────────────────┤
│ Navigation: NavigationItem[] (Recent items)            │
├─────────────────────────────────────────────────────────┤
│ Content:                                                │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│ │  NoteCard   │ │  NoteCard   │ │  NoteCard   │      │
│ └─────────────┘ └─────────────┘ └─────────────┘      │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│ │ ThreadCard  │ │ ThreadCard  │ │ SpaceCard   │      │
│ └─────────────┘ └─────────────┘ └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Thread View
```
┌─────────────────────────────────────────────────────────┐
│ ThreadCard (Header) + SearchInput                       │
├─────────────────────────────────────────────────────────┤
│ NoteCard[] (Thread notes)                              │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│ │  NoteCard   │ │  NoteCard   │ │  NoteCard   │      │
│ └─────────────┘ └─────────────┘ └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Space View
```
┌─────────────────────────────────────────────────────────┐
│ SpaceCard (Header) + ColorPicker                        │
├─────────────────────────────────────────────────────────┤
│ ThreadCard[] (Space threads)                           │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│ │ ThreadCard  │ │ ThreadCard  │ │ ThreadCard  │      │
│ └─────────────┘ └─────────────┘ └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## 🎨 Design System

### Color Palette
- **blessed-blue**: Primary actions, links
- **blessed-green**: Success states, positive actions
- **blessed-purple**: Premium features, special items
- **blessed-orange**: Warnings, attention items
- **blessed-red**: Destructive actions, errors
- **blessed-yellow**: Highlights, featured items
- **blessed-pink**: Special categories, personal items
- **paper**: Neutral, default state

### Typography
- **Headings**: CardTitle (2xl, semibold)
- **Body**: CardContent (sm, regular)
- **Metadata**: text-muted-foreground (xs, regular)
- **Labels**: Badge (xs, semibold)

### Spacing
- **Card padding**: p-6 (24px)
- **Component spacing**: space-y-3 (12px)
- **Grid gaps**: gap-4 (16px)
- **Icon sizes**: h-4 w-4 (16px)

### Interactions
- **Hover**: hover:shadow-md hover:scale-[1.02]
- **Focus**: focus-visible:ring-2 focus-visible:ring-ring
- **Transitions**: transition-all duration-200

## 🔧 Technical Implementation

### Component Structure
```
packages/ui/src/
├── components/
│   ├── ui/           # Base shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── avatar.tsx
│   │   ├── input.tsx
│   │   └── dropdown-menu.tsx
│   └── harvous/      # Harvous-specific components
│       ├── NoteCard.tsx
│       ├── ThreadCard.tsx
│       ├── SpaceCard.tsx
│       ├── NavigationItem.tsx
│       ├── SearchInput.tsx
│       ├── ColorPicker.tsx
│       └── XPCounter.tsx
├── lib/
│   └── utils.ts      # Utility functions
└── styles/
    └── globals.css   # Global styles and CSS variables
```

### Props Interface
All components follow consistent prop patterns:
- **Data props**: Component-specific data objects
- **Event handlers**: `onPress`, `onEdit`, `onDelete`, etc.
- **Styling**: `className` for custom styling
- **Optional props**: Most props are optional with sensible defaults

### Accessibility
- **Keyboard navigation**: All interactive elements are keyboard accessible
- **Screen readers**: Proper ARIA labels and semantic HTML
- **Focus management**: Clear focus indicators and logical tab order
- **Color contrast**: WCAG AA compliant color combinations

### Responsive Design
- **Mobile-first**: Components work on all screen sizes
- **Touch-friendly**: Adequate touch targets (44px minimum)
- **Adaptive layouts**: Components adjust to container width
- **Progressive enhancement**: Core functionality works without JavaScript

## 🚀 Next Steps

1. **Create Next.js showcase app** to demonstrate all components
2. **Add form components** (NoteEditor, ThreadEditor, SpaceEditor)
3. **Implement layout components** (Navigation, MobileDrawer)
4. **Add animation components** (Loading states, transitions)
5. **Create storybook** for component documentation

This component system provides a solid foundation for building the Harvous React application with consistent design, accessibility, and user experience across all platforms.
