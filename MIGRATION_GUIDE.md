# Harvous Migration Guide

This comprehensive guide covers migrating Harvous from Astro to a cross-platform ecosystem with **shadcn/ui components**, **Next.js web app**, and **Expo React Native mobile app**.

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Migration Strategy](#migration-strategy)
3. [Technology Stack](#technology-stack)
4. [Git Workflow & Cursor Rules](#git-workflow--cursor-rules)
5. [Monorepo Structure](#monorepo-structure)
6. [Component Architecture](#component-architecture)
7. [Database & API Strategy](#database--api-strategy)
8. [Authentication](#authentication)
9. [State Management](#state-management)
10. [Cross-Platform Implementation](#cross-platform-implementation)
11. [Migration Phases](#migration-phases)

## Current Architecture Analysis

### Current Tech Stack
- **Framework**: Astro 5.13.7 with View Transitions
- **Database**: Turso (SQLite) with Astro DB
- **Authentication**: Clerk
- **Styling**: Tailwind CSS
- **Client-side**: Alpine.js for reactivity
- **Rich Text**: Quill.js
- **Deployment**: Netlify

### Key Features
- **Hierarchical Organization**: Spaces → Threads → Notes
- **Sequential Note IDs**: User-friendly IDs (N001, N002, N003) that never reuse deleted numbers
- **Color System**: 8-color palette for spaces and threads
- **XP System**: Gamification with points for content creation
- **Navigation**: Persistent navigation with recent items
- **Mobile-first**: Responsive design with mobile drawer system

### Database Schema
```typescript
// Core tables (keep existing schema)
- Spaces: Top-level containers with customizable colors
- Threads: Collections of related notes with unique colors
- Notes: Individual content items with rich text support
- NoteThreads: Many-to-many relationship between notes and threads
- NoteTags: Many-to-many relationship between notes and tags
- UserMetadata: Tracks highest simpleNoteId per user
- UserXP: XP tracking for gamification
- Tags: Tag definitions with categories
```

## Migration Strategy

### Why shadcn/ui + Cross-Platform?
- **Accessible by default**: Built on Radix UI primitives
- **Fully customizable**: CSS variables and Tailwind classes
- **No runtime dependencies**: Copy-paste components
- **Cross-platform ready**: Works with React Native via NativeWind
- **70-80% code sharing**: Between web and mobile
- **Consistent UX**: Same navigation and data flow

### Architecture Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web App       │    │  Mobile App     │    │   Shared Code   │
│   (Next.js)     │    │  (Expo RN)      │    │                 │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Next.js 14+   │    │ • Expo SDK 50+  │    │ • shadcn/ui     │
│ • App Router    │    │ • Expo Router   │    │ • API Client    │
│ • Server Comps  │    │ • React Native │    │ • Business Logic │
│ • API Routes    │    │ • NativeWind    │    │ • Types         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Backend       │
                    ├─────────────────┤
                    │ • Turso DB      │
                    │ • Clerk Auth    │
                    │ • API Routes    │
                    │ • Real-time     │
                    └─────────────────┘
```

## Technology Stack

### Web App
- **Framework**: Next.js 14+ with App Router
- **Components**: shadcn/ui + custom Harvous components
- **Styling**: Tailwind CSS with custom theme
- **State**: Zustand + React Query
- **Database**: Turso (keep existing)
- **Auth**: Clerk

### Mobile App
- **Framework**: Expo React Native
- **Navigation**: Expo Router
- **Styling**: NativeWind (Tailwind for React Native)
- **State**: Zustand + React Query (same as web)
- **Database**: Same Turso API calls
- **Auth**: Clerk React Native SDK

### Shared Code
- **Components**: shadcn/ui base + Harvous-specific components
- **API Client**: Shared API functions
- **Types**: Shared TypeScript interfaces
- **Business Logic**: Shared utilities and hooks

## Git Workflow & Cursor Rules

### Pre-Migration Setup

#### 1. Create Migration Branch
```bash
# Ensure current work is committed
git add .
git commit -m "feat: save current Astro implementation before migration"

# Create and switch to migration branch
git checkout -b migration/react-cross-platform

# Push migration branch to remote
git push -u origin migration/react-cross-platform
```

#### 2. Backup Current Implementation
```bash
# Create a backup tag for easy rollback
git tag -a v1.0-astro-backup -m "Backup of working Astro implementation"
git push origin v1.0-astro-backup

# Create a backup branch for reference
git checkout -b backup/astro-implementation
git push -u origin backup/astro-implementation

# Return to migration branch
git checkout migration/react-cross-platform
```

### Cursor Rules for Migration

#### 1. Create `.cursorrules` for Migration
```bash
# Create migration-specific cursor rules
cat > .cursorrules-migration << 'EOF'
# Cursor Rules for Harvous React Migration

## Migration Context
- **Current State**: Astro-based Harvous application
- **Target State**: Cross-platform React with shadcn/ui
- **Migration Branch**: migration/react-cross-platform
- **Backup Branch**: backup/astro-implementation

## Git Workflow Rules
- **ALWAYS work on migration branch**: Never commit to main during migration
- **Frequent commits**: Commit after each major component migration
- **Descriptive commit messages**: Use conventional commits format
- **Test before commit**: Ensure functionality works before committing
- **Rollback plan**: Keep backup branch updated with working states

## Migration Development Rules

### Phase-Based Development
- **Phase 1**: Foundation setup (monorepo, shadcn/ui)
- **Phase 2**: Component migration (NoteCard, ThreadCard, etc.)
- **Phase 3**: Web app implementation
- **Phase 4**: Mobile app implementation
- **Phase 5**: Cross-platform features
- **Phase 6**: Testing and polish
- **Phase 7**: Deployment

### Component Migration Rules
- **Start with shadcn/ui base**: Always use shadcn/ui as foundation
- **Preserve functionality**: Maintain exact same behavior as Astro version
- **Test incrementally**: Test each component before moving to next
- **Document changes**: Comment on any behavior differences
- **Keep original**: Don't delete Astro components until migration is complete

### Database & API Rules
- **Keep existing schema**: Don't change database structure
- **Maintain API compatibility**: Keep same API endpoints
- **Test data integrity**: Ensure data flows correctly
- **Backup database**: Export current data before migration

### Code Quality Rules
- **TypeScript strict**: Use strict TypeScript configuration
- **ESLint enabled**: Follow React/Next.js best practices
- **Prettier formatting**: Consistent code formatting
- **Component testing**: Write tests for critical components
- **Accessibility**: Maintain WCAG compliance

## Rollback Procedures
- **Quick rollback**: `git checkout backup/astro-implementation`
- **Tag rollback**: `git checkout v1.0-astro-backup`
- **Database rollback**: Restore from backup if needed
- **Test rollback**: Verify original functionality works

## Migration Checklist
- [ ] Current Astro implementation committed and tagged
- [ ] Migration branch created and pushed
- [ ] Backup branch created and pushed
- [ ] Database backup created
- [ ] Migration plan documented
- [ ] Team notified of migration branch
EOF
```

#### 2. Update Main `.cursorrules`
```bash
# Update main cursor rules to reference migration
cat >> .cursorrules << 'EOF'

## Migration Mode
- **Current Mode**: MIGRATION - Working on React cross-platform version
- **Migration Branch**: migration/react-cross-platform
- **Backup Available**: backup/astro-implementation
- **Rollback Command**: git checkout backup/astro-implementation

## Migration-Specific Rules
- **ALWAYS work on migration branch**: Never commit to main
- **Test before commit**: Ensure React version works
- **Preserve Astro version**: Keep original implementation intact
- **Document differences**: Note any behavior changes
- **Incremental migration**: One component at a time
EOF
```

### Git Workflow During Migration

#### 1. Daily Workflow
```bash
# Start each day
git checkout migration/react-cross-platform
git pull origin migration/react-cross-platform

# Work on migration
# ... make changes ...

# Commit frequently with descriptive messages
git add .
git commit -m "feat(components): migrate NoteCard to shadcn/ui"
git push origin migration/react-cross-platform
```

#### 2. Phase Completion Workflow
```bash
# At end of each phase
git tag -a "phase-1-foundation" -m "Completed Phase 1: Foundation setup"
git push origin "phase-1-foundation"

# Create checkpoint branch
git checkout -b "checkpoint/phase-1"
git push -u origin "checkpoint/phase-1"

# Return to migration branch
git checkout migration/react-cross-platform
```

#### 3. Testing Workflow
```bash
# Before major changes
git stash push -m "WIP: before testing"

# Test current implementation
npm run test
npm run build
npm run dev

# If tests pass, continue
git stash pop

# If tests fail, rollback
git stash drop
git reset --hard HEAD~1
```

#### 4. Rollback Procedures
```bash
# Quick rollback to Astro version
git checkout backup/astro-implementation

# Rollback to specific phase
git checkout phase-1-foundation

# Rollback to last working commit
git reset --hard HEAD~1

# Rollback to specific commit
git reset --hard <commit-hash>
```

### Migration Branch Strategy

#### 1. Branch Structure
```
main (Astro - stable)
├── backup/astro-implementation (Astro backup)
├── migration/react-cross-platform (Active migration)
│   ├── phase-1-foundation (Checkpoint)
│   ├── phase-2-components (Checkpoint)
│   ├── phase-3-web-app (Checkpoint)
│   ├── phase-4-mobile-app (Checkpoint)
│   └── phase-5-cross-platform (Checkpoint)
└── v1.0-astro-backup (Tag)
```

#### 2. Commit Message Convention
```bash
# Use conventional commits
feat(components): migrate NoteCard to shadcn/ui
fix(api): resolve authentication issue
docs(migration): update phase 2 progress
test(components): add NoteCard tests
refactor(utils): extract color utilities
```

#### 3. Merge Strategy
```bash
# When migration is complete and tested
git checkout main
git merge migration/react-cross-platform
git tag -a v2.0-react-migration -m "React cross-platform migration complete"
git push origin main
git push origin v2.0-react-migration
```

### Cursor-Specific Rules

#### 1. Cursor Settings for Migration
```json
{
  "cursor.migrationMode": true,
  "cursor.migrationBranch": "migration/react-cross-platform",
  "cursor.backupBranch": "backup/astro-implementation",
  "cursor.rollbackCommand": "git checkout backup/astro-implementation",
  "cursor.migrationPhases": [
    "foundation",
    "components", 
    "web-app",
    "mobile-app",
    "cross-platform",
    "testing",
    "deployment"
  ],
  "cursor.currentPhase": "foundation"
}
```

#### 2. Cursor AI Rules
```bash
# Add to .cursorrules
## AI Assistant Rules for Migration
- **ALWAYS work on migration branch**: Never suggest changes to main
- **Preserve Astro functionality**: Maintain exact same behavior
- **Test before commit**: Always suggest testing before committing
- **Document changes**: Explain any behavior differences
- **Rollback ready**: Always have rollback plan ready
- **Incremental approach**: One component at a time
- **Backup first**: Always backup before major changes
```

### Safety Measures

#### 1. Automated Backups
```bash
# Create backup script
cat > scripts/backup-migration.sh << 'EOF'
#!/bin/bash
# Backup script for migration safety

echo "Creating migration backup..."

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_BRANCH="backup/migration-${TIMESTAMP}"

# Create backup branch
git checkout -b "${BACKUP_BRANCH}"
git push -u origin "${BACKUP_BRANCH}"

# Return to migration branch
git checkout migration/react-cross-platform

echo "Backup created: ${BACKUP_BRANCH}"
echo "To rollback: git checkout ${BACKUP_BRANCH}"
EOF

chmod +x scripts/backup-migration.sh
```

#### 2. Pre-commit Hooks
```bash
# Install pre-commit hooks
npm install --save-dev husky lint-staged

# Add to package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

#### 3. Migration Status Tracking
```bash
# Create migration status file
cat > MIGRATION_STATUS.md << 'EOF'
# Migration Status

## Current Phase: Foundation Setup
- [x] Git workflow established
- [x] Migration branch created
- [x] Backup branches created
- [ ] Monorepo setup
- [ ] shadcn/ui configuration
- [ ] Shared packages created

## Completed Phases
- None yet

## Next Steps
1. Set up monorepo structure
2. Configure shadcn/ui
3. Create shared component library

## Rollback Information
- **Astro Backup**: backup/astro-implementation
- **Last Working**: v1.0-astro-backup
- **Quick Rollback**: git checkout backup/astro-implementation
EOF
```

This comprehensive Git workflow and Cursor rules setup ensures:
- **Safe migration** with multiple backup points
- **Easy rollback** to working Astro version
- **Incremental progress** with phase checkpoints
- **Clear documentation** of migration status
- **Automated safety measures** with hooks and scripts

## Monorepo Structure

```
harvous-migration/
├── apps/
│   ├── web/                          # Next.js web app
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   ├── components/           # Web-specific components
│   │   │   ├── lib/                  # Web-specific utilities
│   │   │   └── styles/               # Web-specific styles
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── mobile/                       # Expo React Native app
│       ├── src/
│       │   ├── app/                  # Expo Router pages
│       │   ├── components/           # Mobile-specific components
│       │   ├── lib/                  # Mobile-specific utilities
│       │   └── hooks/                # Mobile-specific hooks
│       ├── app.json
│       ├── package.json
│       └── expo-env.d.ts
│
├── packages/
│   ├── ui/                           # shadcn/ui + Harvous components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn/ui base components
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── card.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── textarea.tsx
│   │   │   │   │   ├── sheet.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── select.tsx
│   │   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── badge.tsx
│   │   │   │   │   ├── avatar.tsx
│   │   │   │   │   ├── toast.tsx
│   │   │   │   │   └── form.tsx
│   │   │   │   │
│   │   │   │   └── harvous/          # Harvous-specific components
│   │   │   │       ├── NoteCard.tsx
│   │   │   │       ├── ThreadCard.tsx
│   │   │   │       ├── SpaceCard.tsx
│   │   │   │       ├── NavigationItem.tsx
│   │   │   │       ├── NoteEditor.tsx
│   │   │   │       ├── ThreadEditor.tsx
│   │   │   │       ├── SpaceEditor.tsx
│   │   │   │       ├── SearchInput.tsx
│   │   │   │       ├── ColorPicker.tsx
│   │   │   │       └── XPCounter.tsx
│   │   │   │
│   │   │   └── layout/                # Layout components
│   │   │       ├── AppLayout.tsx
│   │   │       ├── Navigation.tsx
│   │   │       ├── MobileDrawer.tsx
│   │   │       └── ResponsiveLayout.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── utils.ts              # shadcn/ui utils
│   │   │   ├── colors.ts             # Harvous color system
│   │   │   └── cn.ts                 # Class name utility
│   │   │
│   │   └── styles/
│   │       ├── globals.css           # Global styles
│   │       └── components.css        # Component-specific styles
│   │   │
│   │   └── package.json
│   │
│   ├── api/                          # Shared API client
│   │   ├── src/
│   │   │   ├── client/               # API client functions
│   │   │   ├── hooks/                # React Query hooks
│   │   │   ├── stores/               # Zustand stores
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── database/                     # Shared database logic
│   │   ├── src/
│   │   │   ├── schema/               # Database schema
│   │   │   ├── queries/              # Database queries
│   │   │   ├── mutations/            # Database mutations
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── entities/             # Database entities
│   │   │   ├── api/                  # API types
│   │   │   ├── ui/                   # UI component types
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── utils/                        # Shared utilities
│       ├── src/
│       │   ├── colors/               # Color system
│       │   ├── navigation/           # Navigation utilities
│       │   ├── xp/                   # XP system
│       │   ├── auto-tags/            # Auto-tagging
│       │   └── index.ts
│       └── package.json
│
├── tools/                            # Development tools
│   ├── eslint-config/                # Shared ESLint config
│   ├── typescript-config/            # Shared TypeScript config
│   └── tailwind-config/              # Shared Tailwind config
│
├── package.json                      # Root package.json
├── turbo.json                        # Turborepo configuration
├── pnpm-workspace.yaml               # PNPM workspace config
└── README.md
```

## Component Architecture

### 1. shadcn/ui Base Components

#### Button Component
```typescript
// packages/ui/src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

#### Card Component
```typescript
// packages/ui/src/components/ui/card.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

### 2. Harvous-Specific Components

#### NoteCard Component
```typescript
// packages/ui/src/components/harvous/NoteCard.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Note } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NoteCardProps {
  note: Note;
  onPress?: (note: Note) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  className?: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onPress,
  onEdit,
  onDelete,
  className
}) => {
  const handlePress = () => {
    onPress?.(note);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(note);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(note);
  };

  // Strip HTML from content for preview
  const previewContent = note.content.replace(/<[^>]*>/g, '').substring(0, 150);
  const hasMoreContent = note.content.length > 150;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {note.simpleNoteId ? `N${note.simpleNoteId.toString().padStart(3, '0')}` : 'N'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">
                {note.title || 'Untitled Note'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">
          {previewContent}
          {hasMoreContent && '...'}
        </p>
        
        {note.isFeatured && (
          <Badge variant="secondary" className="mt-2">
            Featured
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};
```

#### ThreadCard Component
```typescript
// packages/ui/src/components/harvous/ThreadCard.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, Edit, Trash2, Pin } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Thread } from '@harvous/types';
import { cn } from '../../lib/utils';

interface ThreadCardProps {
  thread: Thread;
  onPress?: (thread: Thread) => void;
  onEdit?: (thread: Thread) => void;
  onDelete?: (thread: Thread) => void;
  onTogglePin?: (thread: Thread) => void;
  className?: string;
}

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  onPress,
  onEdit,
  onDelete,
  onTogglePin,
  className
}) => {
  const handlePress = () => {
    onPress?.(thread);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(thread);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(thread);
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.(thread);
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        thread.isPinned && "ring-2 ring-primary",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: `var(--color-${thread.color || 'blessed-blue'})` }}
            >
              {thread.title.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {thread.title}
                {thread.isPinned && <Pin className="h-4 w-4 text-primary" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {thread.subtitle || `${thread.noteCount} notes`}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleTogglePin}>
                <Pin className="mr-2 h-4 w-4" />
                {thread.isPinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {thread.noteCount} notes
          </Badge>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(thread.updatedAt || thread.createdAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
```

## Database & API Strategy

### Keep Current Turso Setup

#### 1. Database Schema (No Changes)
```typescript
// packages/database/src/schema.ts
// Keep your existing Astro DB schema
export const Spaces = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    title: column.text(),
    description: column.text({ optional: true }),
    color: column.text({ optional: true }),
    // ... rest of your existing schema
  }
});
```

#### 2. API Routes (Next.js)
```typescript
// apps/web/src/app/api/notes/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db, Notes, UserMetadata, eq } from '@harvous/database';
import { generateNoteId } from '@harvous/utils';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content, title, threadId, spaceId } = await request.json();

    // Your existing note creation logic
    const newNote = await db.insert(Notes).values({
      id: generateNoteId(),
      content,
      title,
      threadId: threadId || 'thread_unorganized',
      spaceId: spaceId || null,
      userId,
      createdAt: new Date(),
    }).returning().get();

    return NextResponse.json({ success: true, note: newNote });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### 3. Shared API Client
```typescript
// packages/api/src/client/notes.ts
import { Note, CreateNoteRequest, UpdateNoteRequest } from '@harvous/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const notesApi = {
  // Get all notes for user
  async getAll(userId: string): Promise<Note[]> {
    const response = await fetch(`${API_BASE_URL}/api/notes?userId=${userId}`);
    return response.json();
  },

  // Create new note
  async create(note: CreateNoteRequest): Promise<Note> {
    const response = await fetch(`${API_BASE_URL}/api/notes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    return response.json();
  },

  // Update existing note
  async update(id: string, note: UpdateNoteRequest): Promise<Note> {
    const response = await fetch(`${API_BASE_URL}/api/notes/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...note }),
    });
    return response.json();
  },

  // Delete note
  async delete(id: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notes/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },
};
```

## Authentication

### Clerk Integration

#### 1. Web Authentication
```typescript
// apps/web/src/middleware.ts
import { authMiddleware } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/sign-in', '/sign-up'],
  ignoredRoutes: ['/api/webhooks'],
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

#### 2. Mobile Authentication
```typescript
// apps/mobile/src/hooks/useAuth.ts
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

export const useAuth = () => {
  const { isSignedIn, userId, signOut } = useClerkAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  return {
    isSignedIn,
    userId,
    signOut: handleSignOut,
  };
};
```

## State Management

### Zustand + React Query

#### 1. Global State (Zustand)
```typescript
// packages/api/src/stores/useAppStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // Navigation state
  navigationHistory: NavigationItem[];
  addToNavigation: (item: NavigationItem) => void;
  removeFromNavigation: (id: string) => void;
  
  // UI state
  activePanel: 'none' | 'newNote' | 'newThread' | 'noteDetails';
  setActivePanel: (panel: AppState['activePanel']) => void;
  
  // User preferences
  userColor: string;
  setUserColor: (color: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      navigationHistory: [],
      addToNavigation: (item) => set((state) => ({
        navigationHistory: [item, ...state.navigationHistory.filter(i => i.id !== item.id)].slice(0, 10)
      })),
      removeFromNavigation: (id) => set((state) => ({
        navigationHistory: state.navigationHistory.filter(item => item.id !== id)
      })),
      
      activePanel: 'none',
      setActivePanel: (panel) => set({ activePanel: panel }),
      
      userColor: 'paper',
      setUserColor: (color) => set({ userColor: color }),
    }),
    {
      name: 'harvous-app-store',
      partialize: (state) => ({
        navigationHistory: state.navigationHistory,
        userColor: state.userColor,
      }),
    }
  )
);
```

#### 2. Server State (React Query)
```typescript
// packages/api/src/hooks/useNotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../client/notes';
import { Note, CreateNoteRequest, UpdateNoteRequest } from '@harvous/types';

export const useNotes = (userId: string) => {
  return useQuery({
    queryKey: ['notes', userId],
    queryFn: () => notesApi.getAll(userId),
  });
};

export const useCreateNote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (note: CreateNoteRequest) => notesApi.create(note),
    onSuccess: (newNote) => {
      // Invalidate and refetch notes
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
};

export const useUpdateNote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, ...note }: { id: string } & UpdateNoteRequest) => 
      notesApi.update(id, note),
    onSuccess: (updatedNote) => {
      // Update the specific note in cache
      queryClient.setQueryData(['notes', updatedNote.userId], (oldNotes: Note[]) => 
        oldNotes.map(note => note.id === updatedNote.id ? updatedNote : note)
      );
    },
  });
};

export const useDeleteNote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.setQueryData(['notes'], (oldNotes: Note[]) => 
        oldNotes.filter(note => note.id !== deletedId)
      );
    },
  });
};
```

## Cross-Platform Implementation

### 1. Web Implementation (Next.js)

#### App Layout
```typescript
// apps/web/src/app/layout.tsx
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@harvous/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

#### Dashboard Page
```typescript
// apps/web/src/app/dashboard/page.tsx
import { getServerSession } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';
import { getDashboardData } from '@harvous/database';

export default async function DashboardPage() {
  const { userId } = await getServerSession();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const dashboardData = await getDashboardData(userId);

  return <Dashboard data={dashboardData} />;
}
```

#### Dashboard Component
```typescript
// apps/web/src/components/Dashboard.tsx
'use client';

import { useDashboard } from '@harvous/api';
import { NoteCard, ThreadCard, SpaceCard } from '@harvous/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@harvous/ui';
import { Button } from '@harvous/ui';
import { Plus } from 'lucide-react';

interface DashboardProps {
  data: {
    notes: Note[];
    threads: Thread[];
    spaces: Space[];
  };
}

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  const { notes, threads, spaces } = data;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Note
        </Button>
      </div>

      <Tabs defaultValue="recent" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="threads">Threads</TabsTrigger>
          <TabsTrigger value="spaces">Spaces</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="threads" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {threads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="spaces" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
```

### 2. Mobile Implementation (Expo React Native)

#### Mobile NoteCard
```typescript
// apps/mobile/src/components/MobileNoteCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NoteCard } from '@harvous/ui';
import { useRouter } from 'expo-router';

interface MobileNoteCardProps {
  note: Note;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
}

export const MobileNoteCard: React.FC<MobileNoteCardProps> = ({
  note,
  onEdit,
  onDelete
}) => {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/note/${note.id}`);
  };

  return (
    <NoteCard
      note={note}
      onPress={handlePress}
      onEdit={onEdit}
      onDelete={onDelete}
      className="mx-4 my-2"
    />
  );
};
```

#### Mobile Dashboard
```typescript
// apps/mobile/src/app/(tabs)/dashboard/index.tsx
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useDashboard } from '@harvous/api';
import { MobileNoteCard } from '@/components/MobileNoteCard';
import { Button } from '@harvous/ui';
import { Plus } from 'lucide-react';

export default function DashboardScreen() {
  const { data: dashboardData, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-3xl font-bold">Dashboard</Text>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Note
          </Button>
        </View>

        <View className="space-y-4">
          {dashboardData?.notes.map((note) => (
            <MobileNoteCard key={note.id} note={note} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
```

## Implementation Guide

### Prerequisites & Setup

#### 1. Required Tools
```bash
# Install required tools
npm install -g pnpm
npm install -g @expo/cli
npm install -g turbo

# Verify installations
node --version  # Should be 18+
pnpm --version  # Should be 8+
expo --version  # Should be 50+
turbo --version # Should be 1.10+
```

#### 2. Environment Setup
```bash
# Create environment files
cp .env.example .env.local
cp .env.example .env.development

# Add to .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret
TURSO_DATABASE_URL=your_turso_url
TURSO_AUTH_TOKEN=your_turso_token
```

### Phase 1: Foundation Setup (Week 1)

#### Step 1.1: Create Migration Branch
```bash
# Save current work
git add .
git commit -m "feat: save current Astro implementation before migration"

# Create migration branch
git checkout -b migration/react-cross-platform
git push -u origin migration/react-cross-platform

# Create backup
git tag -a v1.0-astro-backup -m "Backup of working Astro implementation"
git push origin v1.0-astro-backup
```

#### Step 1.2: Set Up Monorepo
```bash
# Create new directory for migration
mkdir harvous-migration
cd harvous-migration

# Initialize monorepo
pnpm init
echo "harvous-migration" > .gitignore

# Install Turborepo
pnpm add -D turbo
pnpm add -D typescript @types/node

# Create turbo.json
cat > turbo.json << 'EOF'
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
EOF

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'
EOF
```

#### Step 1.3: Set Up Shared Packages
```bash
# Create package directories
mkdir -p packages/{ui,api,database,types,utils}
mkdir -p apps/{web,mobile}
mkdir -p tools/{eslint-config,typescript-config,tailwind-config}

# Initialize each package
cd packages/ui && pnpm init && cd ../..
cd packages/api && pnpm init && cd ../..
cd packages/database && pnpm init && cd ../..
cd packages/types && pnpm init && cd ../..
cd packages/utils && pnpm init && cd ../..
```

#### Step 1.4: Configure shadcn/ui
```bash
# Set up UI package
cd packages/ui

# Install dependencies
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom typescript

# Install shadcn/ui
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add lucide-react

# Install Tailwind CSS
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Create tailwind.config.js
cat > tailwind.config.js << 'EOF'
const { fontFamily } = require("tailwindcss/defaultTheme")

module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
EOF

# Create lib/utils.ts
mkdir -p src/lib
cat > src/lib/utils.ts << 'EOF'
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF

# Create globals.css
mkdir -p src/styles
cat > src/styles/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 84% 4.9%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
EOF

cd ../..
```

#### Step 1.5: Create Base shadcn/ui Components
```bash
# Create Button component
cat > packages/ui/src/components/ui/button.tsx << 'EOF'
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
EOF

# Create Card component
cat > packages/ui/src/components/ui/card.tsx << 'EOF'
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
EOF

# Create index.ts
cat > packages/ui/src/index.ts << 'EOF'
export * from './components/ui/button'
export * from './components/ui/card'
EOF
```

### Phase 2: Harvous Components (Week 2)

#### Step 2.1: Set Up Types Package
```bash
cd packages/types

# Install dependencies
pnpm add

# Create types
cat > src/entities.ts << 'EOF'
export interface Note {
  id: string;
  title?: string;
  content: string;
  threadId: string;
  spaceId?: string;
  simpleNoteId?: number;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isFeatured: boolean;
  order: number;
}

export interface Thread {
  id: string;
  title: string;
  subtitle?: string;
  spaceId?: string;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isPinned: boolean;
  color?: string;
  order: number;
  noteCount?: number;
}

export interface Space {
  id: string;
  title: string;
  description?: string;
  color?: string;
  backgroundGradient?: string;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isActive: boolean;
  order: number;
  totalItemCount?: number;
}

export interface NavigationItem {
  id: string;
  title: string;
  type: 'thread' | 'space' | 'note';
  count: number;
  backgroundGradient: string;
  color: string;
  firstAccessed: number;
  lastAccessed: number;
}
EOF

cat > src/api.ts << 'EOF'
export interface CreateNoteRequest {
  content: string;
  title?: string;
  threadId?: string;
  spaceId?: string;
  isPublic?: boolean;
}

export interface UpdateNoteRequest {
  content?: string;
  title?: string;
  threadId?: string;
  spaceId?: string;
  isPublic?: boolean;
}

export interface CreateThreadRequest {
  title: string;
  subtitle?: string;
  spaceId?: string;
  color?: string;
  isPublic?: boolean;
}

export interface CreateSpaceRequest {
  title: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}
EOF

cat > src/index.ts << 'EOF'
export * from './entities'
export * from './api'
EOF

cd ../..
```

#### Step 2.2: Create NoteCard Component
```bash
# Create NoteCard component
cat > packages/ui/src/components/harvous/NoteCard.tsx << 'EOF'
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Note } from '@harvous/types';
import { cn } from '../../lib/utils';

interface NoteCardProps {
  note: Note;
  onPress?: (note: Note) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  className?: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onPress,
  onEdit,
  onDelete,
  className
}) => {
  const handlePress = () => {
    onPress?.(note);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(note);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(note);
  };

  // Strip HTML from content for preview
  const previewContent = note.content.replace(/<[^>]*>/g, '').substring(0, 150);
  const hasMoreContent = note.content.length > 150;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        className
      )}
      onClick={handlePress}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {note.simpleNoteId ? `N${note.simpleNoteId.toString().padStart(3, '0')}` : 'N'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">
                {note.title || 'Untitled Note'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">
          {previewContent}
          {hasMoreContent && '...'}
        </p>
        
        {note.isFeatured && (
          <Badge variant="secondary" className="mt-2">
            Featured
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};
EOF
```

### Phase 3: Web App (Week 3)

#### Step 3.1: Set Up Next.js App
```bash
cd apps/web

# Create Next.js app
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Install additional dependencies
pnpm add @clerk/nextjs
pnpm add @tanstack/react-query
pnpm add zustand
pnpm add react-hook-form @hookform/resolvers zod
pnpm add lucide-react

# Install workspace dependencies
pnpm add @harvous/ui @harvous/api @harvous/types @harvous/utils

# Create next.config.js
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  transpilePackages: ['@harvous/ui', '@harvous/api', '@harvous/types', '@harvous/utils'],
}

module.exports = nextConfig
EOF
```

#### Step 3.2: Set Up Authentication
```bash
# Create middleware.ts
cat > src/middleware.ts << 'EOF'
import { authMiddleware } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/sign-in', '/sign-up'],
  ignoredRoutes: ['/api/webhooks'],
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
EOF

# Create app/layout.tsx
cat > src/app/layout.tsx << 'EOF'
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@harvous/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
EOF
```

#### Step 3.3: Create Layout Foundation System
```bash
# Create layout components directory
mkdir -p src/components/layout

# Create main layout component
cat > src/components/layout/MainLayout.tsx << 'EOF'
import React from 'react';
import { cn } from '@/lib/utils';
import { NavigationColumn } from './NavigationColumn';
import { ContentColumn } from './ContentColumn';
import { AdditionalColumn } from './AdditionalColumn';
import { MobileDrawer } from './MobileDrawer';
import { useAppStore } from '@harvous/api';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, className }) => {
  const { activePanel } = useAppStore();

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {/* Desktop Layout - 3 Column Grid */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-4 lg:h-screen">
        {/* Navigation Column - Fixed Width */}
        <div className="lg:col-span-3 xl:col-span-2">
          <NavigationColumn />
        </div>
        
        {/* Content Column - Flexible */}
        <div className="lg:col-span-6 xl:col-span-7">
          <ContentColumn>
            {children}
          </ContentColumn>
        </div>
        
        {/* Additional Column - Fixed Width */}
        <div className="lg:col-span-3 xl:col-span-3">
          <AdditionalColumn />
        </div>
      </div>

      {/* Mobile Layout - Stacked Rows */}
      <div className="lg:hidden flex flex-col h-screen">
        {/* Navigation Row - Top */}
        <div className="flex-shrink-0">
          <NavigationColumn />
        </div>
        
        {/* Content Row - Flexible */}
        <div className="flex-1 overflow-hidden">
          <ContentColumn>
            {children}
          </ContentColumn>
        </div>
        
        {/* Additional Row - Bottom Sheet */}
        <MobileDrawer />
      </div>
    </div>
  );
};
EOF

# Create NavigationColumn component
cat > src/components/layout/NavigationColumn.tsx << 'EOF'
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@harvous/ui';
import { Plus, Search, Settings, User } from 'lucide-react';
import { useAppStore } from '@harvous/api';

interface NavigationColumnProps {
  className?: string;
}

export const NavigationColumn: React.FC<NavigationColumnProps> = ({ className }) => {
  const { setActivePanel } = useAppStore();

  return (
    <div className={cn(
      "bg-card border-r border-border",
      "lg:flex lg:flex-col lg:h-full",
      "flex flex-row lg:flex-col items-center lg:items-stretch",
      "p-4 lg:p-6",
      className
    )}>
      {/* Desktop: Vertical Navigation */}
      <div className="hidden lg:flex lg:flex-col lg:space-y-4">
        {/* User Profile Section */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Harvous</h2>
            <p className="text-xs text-muted-foreground">Your Notes</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-2">
          <Button 
            variant="ghost" 
            className="w-full justify-start"
            onClick={() => setActivePanel('newNote')}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Note
          </Button>
          
          <Button 
            variant="ghost" 
            className="w-full justify-start"
            onClick={() => setActivePanel('newThread')}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Thread
          </Button>
          
          <Button variant="ghost" className="w-full justify-start">
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </nav>

        {/* Settings */}
        <Button variant="ghost" className="w-full justify-start">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Mobile: Horizontal Navigation */}
      <div className="lg:hidden flex flex-row space-x-2 w-full">
        <Button 
          size="sm" 
          variant="ghost" 
          className="flex-1"
          onClick={() => setActivePanel('newNote')}
        >
          <Plus className="w-4 h-4 mr-1" />
          Note
        </Button>
        
        <Button 
          size="sm" 
          variant="ghost" 
          className="flex-1"
          onClick={() => setActivePanel('newThread')}
        >
          <Plus className="w-4 h-4 mr-1" />
          Thread
        </Button>
        
        <Button size="sm" variant="ghost" className="flex-1">
          <Search className="w-4 h-4 mr-1" />
          Search
        </Button>
        
        <Button size="sm" variant="ghost">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
EOF

# Create ContentColumn component
cat > src/components/layout/ContentColumn.tsx << 'EOF'
import React from 'react';
import { cn } from '@/lib/utils';

interface ContentColumnProps {
  children: React.ReactNode;
  className?: string;
}

export const ContentColumn: React.FC<ContentColumnProps> = ({ children, className }) => {
  return (
    <div className={cn(
      "bg-background",
      "lg:overflow-y-auto lg:max-h-screen",
      "flex-1 overflow-hidden",
      className
    )}>
      <div className="h-full p-4 lg:p-6">
        {children}
      </div>
    </div>
  );
};
EOF

# Create AdditionalColumn component
cat > src/components/layout/AdditionalColumn.tsx << 'EOF'
import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@harvous/ui';
import { useAppStore } from '@harvous/api';

interface AdditionalColumnProps {
  className?: string;
}

export const AdditionalColumn: React.FC<AdditionalColumnProps> = ({ className }) => {
  const { activePanel } = useAppStore();

  return (
    <div className={cn(
      "bg-card border-l border-border",
      "lg:flex lg:flex-col lg:h-full",
      "hidden lg:block",
      className
    )}>
      <div className="p-4 lg:p-6">
        {activePanel === 'newNote' && (
          <Card>
            <CardHeader>
              <CardTitle>New Note</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create a new note to capture your thoughts and ideas.
              </p>
            </CardContent>
          </Card>
        )}
        
        {activePanel === 'newThread' && (
          <Card>
            <CardHeader>
              <CardTitle>New Thread</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Organize your notes into meaningful threads.
              </p>
            </CardContent>
          </Card>
        )}
        
        {activePanel === 'noteDetails' && (
          <Card>
            <CardHeader>
              <CardTitle>Note Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View and edit note details, tags, and metadata.
              </p>
            </CardContent>
          </Card>
        )}
        
        {activePanel === 'none' && (
          <Card>
            <CardHeader>
              <CardTitle>Additional Panel</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This panel shows additional information and controls.
                On mobile, this content appears in a bottom sheet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
EOF

# Create MobileDrawer component
cat > src/components/layout/MobileDrawer.tsx << 'EOF'
import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@harvous/ui';
import { useAppStore } from '@harvous/api';
import { Sheet, SheetContent, SheetTrigger } from '@harvous/ui';

interface MobileDrawerProps {
  className?: string;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ className }) => {
  const { activePanel, setActivePanel } = useAppStore();

  return (
    <div className={cn("lg:hidden", className)}>
      <Sheet open={activePanel !== 'none'} onOpenChange={(open) => !open && setActivePanel('none')}>
        <SheetContent side="bottom" className="h-[50vh] rounded-t-lg">
          <div className="h-full overflow-y-auto">
            {activePanel === 'newNote' && (
              <Card>
                <CardHeader>
                  <CardTitle>New Note</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Create a new note to capture your thoughts and ideas.
                  </p>
                </CardContent>
              </Card>
            )}
            
            {activePanel === 'newThread' && (
              <Card>
                <CardHeader>
                  <CardTitle>New Thread</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Organize your notes into meaningful threads.
                  </p>
                </CardContent>
              </Card>
            )}
            
            {activePanel === 'noteDetails' && (
              <Card>
                <CardHeader>
                  <CardTitle>Note Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View and edit note details, tags, and metadata.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
EOF
```

#### Step 3.4: Create Responsive Layout System
```bash
# Create layout utilities
cat > src/lib/layout.ts << 'EOF'
import { cn } from './utils';

// Layout breakpoints matching your current design
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Layout configuration
export const layoutConfig = {
  // Desktop: 3-column grid
  desktop: {
    navigation: 'lg:col-span-3 xl:col-span-2',
    content: 'lg:col-span-6 xl:col-span-7',
    additional: 'lg:col-span-3 xl:col-span-3',
  },
  // Mobile: Stacked rows
  mobile: {
    navigation: 'flex-shrink-0',
    content: 'flex-1 overflow-hidden',
    additional: 'lg:hidden', // Hidden on desktop, shown as bottom sheet on mobile
  },
} as const;

// Layout utilities
export const getLayoutClasses = (variant: 'desktop' | 'mobile', section: 'navigation' | 'content' | 'additional') => {
  const config = layoutConfig[variant];
  return config[section];
};

// Responsive layout hook
export const useLayout = () => {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return { isMobile };
};
EOF

# Create layout context
cat > src/contexts/LayoutContext.tsx << 'EOF'
import React, { createContext, useContext, useState, useEffect } from 'react';

interface LayoutContextType {
  activePanel: 'none' | 'newNote' | 'newThread' | 'noteDetails';
  setActivePanel: (panel: 'none' | 'newNote' | 'newThread' | 'noteDetails') => void;
  isMobile: boolean;
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePanel, setActivePanel] = useState<'none' | 'newNote' | 'newThread' | 'noteDetails'>('none');
  const [isMobile, setIsMobile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Auto-open drawer on mobile when panel is active
    if (isMobile && activePanel !== 'none') {
      setIsDrawerOpen(true);
    } else if (!isMobile) {
      setIsDrawerOpen(false);
    }
  }, [activePanel, isMobile]);

  const setActivePanelWithDrawer = (panel: 'none' | 'newNote' | 'newThread' | 'noteDetails') => {
    setActivePanel(panel);
    if (isMobile && panel !== 'none') {
      setIsDrawerOpen(true);
    }
  };

  return (
    <LayoutContext.Provider
      value={{
        activePanel,
        setActivePanel: setActivePanelWithDrawer,
        isMobile,
        isDrawerOpen,
        setDrawerOpen: setIsDrawerOpen,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};
EOF
```

#### Step 3.5: Create Layout Components for shadcn/ui
```bash
# Create Sheet component for mobile drawer
cat > packages/ui/src/components/ui/sheet.tsx << 'EOF'
import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
EOF

# Update UI package index
cat > packages/ui/src/index.ts << 'EOF'
export * from './components/ui/button'
export * from './components/ui/card'
export * from './components/ui/sheet'
EOF
```

#### Step 3.6: Create Layout Demo Page
```bash
# Create layout demo page
cat > src/app/layout-demo/page.tsx << 'EOF'
import { MainLayout } from '@/components/layout/MainLayout';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { Card, CardContent, CardHeader, CardTitle } from '@harvous/ui';

export default function LayoutDemoPage() {
  return (
    <LayoutProvider>
      <MainLayout>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Layout Demo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This demonstrates the 3-column layout system:
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• <strong>Left Column:</strong> Navigation and controls</li>
                <li>• <strong>Center Column:</strong> Main content area</li>
                <li>• <strong>Right Column:</strong> Additional panels and details</li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                On mobile, the layout becomes stacked rows with the additional column
                appearing as a bottom sheet when activated.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Responsive Behavior</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Desktop (lg+)</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 3-column grid layout</li>
                    <li>• Fixed navigation column</li>
                    <li>• Flexible content column</li>
                    <li>• Fixed additional column</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Mobile (&lt;lg)</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Stacked row layout</li>
                    <li>• Horizontal navigation bar</li>
                    <li>• Full-width content area</li>
                    <li>• Bottom sheet for additional content</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </LayoutProvider>
  );
}
EOF
```

### Phase 4: Mobile App (Week 4)

#### Step 4.1: Set Up Expo App
```bash
cd apps/mobile

# Create Expo app
npx create-expo-app@latest . --template blank-typescript

# Install dependencies
pnpm add @clerk/clerk-expo
pnpm add @tanstack/react-query
pnpm add zustand
pnpm add react-hook-form @hookform/resolvers zod
pnpm add nativewind
pnpm add lucide-react-native

# Install workspace dependencies
pnpm add @harvous/ui @harvous/api @harvous/types @harvous/utils

# Configure NativeWind
cat > tailwind.config.js << 'EOF'
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# Create metro.config.js
cat > metro.config.js << 'EOF'
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/styles/globals.css' });
EOF
```

### Phase 5: Cross-Platform Features (Week 5)

#### Step 5.1: Set Up Shared State Management
```bash
# Create Zustand store
cat > packages/api/src/stores/useAppStore.ts << 'EOF'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  navigationHistory: NavigationItem[];
  addToNavigation: (item: NavigationItem) => void;
  removeFromNavigation: (id: string) => void;
  
  activePanel: 'none' | 'newNote' | 'newThread' | 'noteDetails';
  setActivePanel: (panel: AppState['activePanel']) => void;
  
  userColor: string;
  setUserColor: (color: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      navigationHistory: [],
      addToNavigation: (item) => set((state) => ({
        navigationHistory: [item, ...state.navigationHistory.filter(i => i.id !== item.id)].slice(0, 10)
      })),
      removeFromNavigation: (id) => set((state) => ({
        navigationHistory: state.navigationHistory.filter(item => item.id !== id)
      })),
      
      activePanel: 'none',
      setActivePanel: (panel) => set({ activePanel: panel }),
      
      userColor: 'paper',
      setUserColor: (color) => set({ userColor: color }),
    }),
    {
      name: 'harvous-app-store',
      partialize: (state) => ({
        navigationHistory: state.navigationHistory,
        userColor: state.userColor,
      }),
    }
  )
);
EOF
```

### Phase 6: Testing & Polish (Week 6)

#### Step 6.1: Set Up Testing
```bash
# Install testing dependencies
pnpm add -D @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom

# Create jest.config.js
cat > jest.config.js << 'EOF'
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'jest-environment-jsdom',
}

module.exports = createJestConfig(customJestConfig)
EOF

# Create jest.setup.js
cat > jest.setup.js << 'EOF'
import '@testing-library/jest-dom'
EOF
```

### Phase 7: Deployment (Week 7)

#### Step 7.1: Set Up CI/CD
```bash
# Create .github/workflows/ci.yml
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [main, migration/react-cross-platform]
  pull_request:
    branches: [main, migration/react-cross-platform]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build
EOF
```

## Migration Phases

### Phase 1: Foundation Setup (Weeks 1-2)
- [ ] Set up monorepo with Turborepo
- [ ] Install and configure shadcn/ui
- [ ] Set up shared component library
- [ ] Configure Tailwind CSS with custom theme
- [ ] Create base shadcn/ui components
- [ ] Set up shared packages (types, utils, database)

### Phase 2: Harvous Components (Weeks 3-4)
- [ ] Create NoteCard, ThreadCard, SpaceCard components
- [ ] Build NoteEditor, ThreadEditor, SpaceEditor
- [ ] Implement Navigation components
- [ ] Create SearchInput and ColorPicker
- [ ] Build XPCounter and other Harvous-specific components
- [ ] Set up shared API client with React Query hooks

### Phase 3: Web App (Weeks 5-6)
- [ ] Set up Next.js 14+ with App Router
- [ ] Implement responsive layout
- [ ] Create dashboard and content pages
- [ ] Set up authentication with Clerk
- [ ] Implement form handling with react-hook-form
- [ ] Add PWA features

### Phase 4: Mobile App (Weeks 7-8)
- [ ] Set up Expo React Native app
- [ ] Configure NativeWind for Tailwind CSS
- [ ] Implement mobile-specific components
- [ ] Set up Expo Router navigation
- [ ] Add mobile-specific features
- [ ] Implement offline support

### Phase 5: Cross-Platform Features (Weeks 9-10)
- [ ] Implement shared state management
- [ ] Set up real-time sync
- [ ] Add push notifications
- [ ] Implement cross-platform navigation
- [ ] Add mobile-specific optimizations

### Phase 6: Testing & Polish (Weeks 11-12)
- [ ] Write unit tests for components
- [ ] Implement E2E tests
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Cross-platform testing

### Phase 7: Deployment (Weeks 13-14)
- [ ] Set up CI/CD pipeline
- [ ] Configure production databases
- [ ] Set up monitoring and analytics
- [ ] Deploy web app to Vercel/Netlify
- [ ] Deploy mobile app to app stores
- [ ] Data migration from Astro version

## Key Benefits

1. **Accessible by Default**: Built on Radix UI primitives
2. **Fully Customizable**: CSS variables and Tailwind classes
3. **No Runtime Dependencies**: Copy-paste components
4. **Cross-Platform Ready**: Works with React Native via NativeWind
5. **70-80% Code Sharing**: Between web and mobile
6. **Consistent UX**: Same navigation and data flow
7. **Single Database**: Same Turso database for all platforms
8. **Unified Authentication**: Clerk works across platforms
9. **Real-time Sync**: Changes sync instantly between platforms
10. **Easier Maintenance**: One codebase for business logic

This comprehensive migration approach gives you a solid foundation with shadcn/ui components that you can fully customize later while maintaining accessibility and consistency across platforms!

## Troubleshooting Guide

### Common Build Issues

#### TypeScript Errors
```bash
# Error: Cannot find module '@harvous/ui'
# Solution: Check workspace dependencies
pnpm install
pnpm run build

# Error: Type 'X' is not assignable to type 'Y'
# Solution: Check shared types package
cd packages/types
pnpm run build
cd ../..
```

#### Tailwind CSS Issues
```bash
# Error: Tailwind classes not working
# Solution: Check Tailwind configuration
# 1. Verify tailwind.config.js includes all packages
# 2. Check if globals.css is imported
# 3. Restart development server

# Error: shadcn/ui components not styled
# Solution: Ensure CSS variables are defined
# Check packages/ui/src/styles/globals.css
```

#### Next.js Build Issues
```bash
# Error: Module not found
# Solution: Check transpilePackages in next.config.js
transpilePackages: ['@harvous/ui', '@harvous/api', '@harvous/types', '@harvous/utils']

# Error: Build fails with "Cannot resolve module"
# Solution: Verify package.json dependencies
pnpm install --frozen-lockfile
```

### Development Server Issues

#### Port Conflicts
```bash
# Error: Port 3000 already in use
# Solution: Kill existing process
lsof -ti:3000 | xargs kill -9
npm run dev

# Error: Port 4321 already in use (Astro)
# Solution: Kill Astro process
lsof -ti:4321 | xargs kill -9
```

#### Hot Reload Not Working
```bash
# Solution: Clear cache and restart
rm -rf .next
rm -rf node_modules/.cache
pnpm run dev
```

### Database Connection Issues

#### Turso Connection Problems
```bash
# Error: Database connection failed
# Solution: Check environment variables
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN

# Error: Migration failed
# Solution: Check database schema
cd packages/database
pnpm run db:push
```

#### Clerk Authentication Issues
```bash
# Error: Authentication not working
# Solution: Check Clerk configuration
# 1. Verify NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# 2. Check CLERK_SECRET_KEY
# 3. Ensure middleware.ts is configured correctly
```

### Component Issues

#### shadcn/ui Components Not Rendering
```bash
# Error: Component not found
# Solution: Check component exports
# Verify packages/ui/src/index.ts includes the component

# Error: Styling not applied
# Solution: Check CSS imports
# Ensure globals.css is imported in layout.tsx
```

#### Layout Issues
```bash
# Error: 3-column layout not working
# Solution: Check responsive classes
# Verify lg:grid-cols-12 is applied correctly

# Error: Mobile drawer not opening
# Solution: Check Sheet component
# Verify @radix-ui/react-dialog is installed
```

### Performance Issues

#### Slow Build Times
```bash
# Solution: Use Turborepo caching
turbo build --cache-dir=.turbo

# Solution: Check for duplicate dependencies
pnpm list --depth=0
```

#### Large Bundle Size
```bash
# Solution: Analyze bundle
pnpm add -D @next/bundle-analyzer
ANALYZE=true pnpm run build
```

### Migration-Specific Issues

#### Astro to React Migration
```bash
# Error: Alpine.js not working
# Solution: Replace with React state management
# Use Zustand instead of Alpine.js

# Error: View Transitions not working
# Solution: Use Next.js App Router
# Implement client-side navigation with useRouter
```

#### Data Migration Issues
```bash
# Error: Data not syncing
# Solution: Check API endpoints
# Verify API routes match existing Astro endpoints

# Error: User data missing
# Solution: Check authentication
# Ensure Clerk user IDs match between versions
```

### PWA Issues

#### Service Worker Problems
```bash
# Error: PWA not installing
# Solution: Check manifest.json
# Verify all required fields are present

# Error: Offline not working
# Solution: Check service worker registration
# Ensure sw.js is properly configured
```

#### Mobile PWA Issues
```bash
# Error: Touch events not working
# Solution: Check mobile-specific CSS
# Ensure touch-action is properly set

# Error: Viewport issues
# Solution: Check meta viewport tag
# Verify responsive design breakpoints
```

### Debugging Tools

#### Development Debugging
```bash
# Enable React DevTools
# Install browser extension for React debugging

# Enable Next.js debugging
NODE_OPTIONS='--inspect' pnpm run dev

# Check console for errors
# Open browser DevTools and check Console tab
```

#### Database Debugging
```bash
# Check database queries
# Use Turso CLI to inspect database
turso db shell <database-name>

# Check API responses
# Use browser DevTools Network tab
```

### Quick Fixes

#### Reset Everything
```bash
# Nuclear option: Reset entire migration
git checkout backup/astro-implementation
git checkout -b migration/react-cross-platform-v2
# Start over with clean slate
```

#### Partial Reset
```bash
# Reset specific package
cd packages/ui
rm -rf node_modules
pnpm install
cd ../..
```

#### Cache Clearing
```bash
# Clear all caches
rm -rf node_modules
rm -rf .next
rm -rf .turbo
pnpm install
pnpm run build
```

### Getting Help

#### Check Logs
```bash
# Check build logs
pnpm run build 2>&1 | tee build.log

# Check development logs
pnpm run dev 2>&1 | tee dev.log
```

#### Common Solutions
1. **Always check environment variables first**
2. **Clear caches when in doubt**
3. **Verify all dependencies are installed**
4. **Check TypeScript types are correct**
5. **Ensure all imports are properly resolved**

#### When to Rollback
- Build consistently fails after 3+ attempts
- Critical functionality is broken
- Data integrity is compromised
- User experience is severely degraded

```bash
# Quick rollback command
git checkout backup/astro-implementation
npm run build
npm run deploy
```
