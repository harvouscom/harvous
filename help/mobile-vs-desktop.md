# Mobile vs Desktop

Learn about the differences between mobile and desktop experiences in Harvous, and how to make the most of each platform.

## Overview

Harvous works great on both mobile and desktop, but each platform offers a slightly different experience optimized for its form factor. The same codebase powers both experiences, so your content and settings sync seamlessly.

## Mobile Experience

### Key Features

- **Bottom Sheet System**: Modern mobile bottom sheet with smooth slide-up animations
- **Touch-Optimized**: Larger touch targets, swipe gestures
- **Simplified Navigation**: Mobile dropdown instead of sidebar
- **Optimized Forms**: Full-width inputs, larger buttons
- **Responsive Design**: Adapts to different screen sizes

### Bottom Sheet System

**What is a Bottom Sheet?**
- A panel that slides up from the bottom of the screen
- Modern mobile pattern used by iOS and Android apps
- Keeps context visible while showing additional content

**When You'll See It:**
- Creating new notes
- Creating new threads
- Editing notes
- Viewing note details
- Opening panels and modals

**How to Use It:**
- **Open**: Tap buttons or options that trigger panels
- **Close**: Tap outside the sheet, swipe down, or tap close button
- **Smooth animations**: Professional slide-up and slide-down transitions

### Mobile Navigation

- **Dropdown Menu**: Mobile navigation uses a dropdown instead of sidebar
- **Quick Access**: Recently accessed items in the dropdown
- **Touch-Friendly**: Larger touch targets for easy tapping
- **Simplified Interface**: Clean, focused design for smaller screens

### Mobile Optimizations

- **Fast Interactions**: 100ms redirects, immediate feedback with toast notifications
- **Professional UX**: Smooth animations, proper easing, and overlay dismiss functionality
- **Mobile-Only Rendering**: Bottom sheet only shows on mobile (< 1160px width)
- **Touch Gestures**: Swipe to dismiss, tap to interact

## Desktop Experience

### Key Features

- **Sidebar Navigation**: Persistent navigation column
- **Additional Column**: Extra space for panels and details
- **Hover States**: Rich hover interactions (close icons, tooltips)
- **Keyboard Shortcuts**: Power user features
- **Multi-Column Layouts**: More screen space for content

### Sidebar Navigation

**What is the Sidebar?**
- A persistent navigation column on the left side
- Shows recently accessed spaces and threads
- Quick access to frequently used content

**Features:**
- **Color-coded**: Spaces and threads display with their colors
- **Item counts**: See how many notes are in each thread
- **Close items**: Hover to see close buttons
- **Active state**: Currently viewed items are highlighted

### Additional Column

**What is the Additional Column?**
- Extra space on the right side of the screen
- Used for panels, details, and additional content
- Only appears on desktop (wider screens)

**When You'll See It:**
- Note details panel
- Thread edit panel
- Space information
- Additional context and tools

### Desktop Optimizations

- **Hover Interactions**: Rich hover states for better UX
- **Keyboard Shortcuts**: Power user shortcuts for faster workflow
- **More Screen Space**: Multi-column layouts for better organization
- **Precise Controls**: Mouse and keyboard for precise interactions

## Platform Differences

### Screen Size Breakpoint

**1160px Width** is the breakpoint:
- **Above 1160px**: Desktop layout (sidebar, additional column)
- **Below 1160px**: Mobile layout (bottom sheet, dropdown)

### Layout Differences

**Desktop (Above 1160px):**
- 3-column layout: Navigation | Main Content | Additional Column
- Sidebar navigation
- Panels in additional column
- Hover interactions

**Mobile (Below 1160px):**
- Single-column layout
- Dropdown navigation
- Bottom sheet panels
- Touch interactions

## Unified Experience

### Same Content Everywhere

- **Content syncs**: All your notes, threads, and spaces sync across devices
- **Same features**: Core functionality works the same on all platforms
- **Consistent design**: Same visual design and branding
- **Unified codebase**: One codebase powers all platforms

### Cross-Device Workflow

- **Start on desktop**: Create content with full keyboard and mouse
- **Continue on mobile**: Review and edit on the go
- **Sync automatically**: Changes appear on all devices
- **Seamless experience**: Pick up where you left off

## Tips for Each Platform

### Mobile Tips

1. **Use bottom sheets**: Get comfortable with the slide-up panels
2. **Touch gestures**: Swipe to dismiss, tap to interact
3. **Quick capture**: Great for quick note-taking on the go
4. **Portrait mode**: Optimized for portrait orientation
5. **Offline capable**: Works offline with PWA features

### Desktop Tips

1. **Use keyboard shortcuts**: Work faster with **Cmd/Ctrl + '** (new note), **Cmd/Ctrl + ;** (new thread), etc.
2. **Sidebar navigation**: Keep frequently used items in navigation
3. **Multi-column view**: Take advantage of the additional column
4. **Hover interactions**: Discover features by hovering
5. **Full keyboard**: Use keyboard for faster text entry

## Responsive Design Features

### Adaptive Layouts

- **Flexible grids**: Content adapts to screen size
- **Responsive images**: Images scale appropriately
- **Touch targets**: Larger on mobile, precise on desktop
- **Font sizes**: Optimized for readability on each platform

### Performance

- **Fast loading**: Optimized for both platforms
- **Smooth animations**: 60fps animations on all devices
- **Efficient rendering**: React Islands architecture for performance
- **Progressive enhancement**: Works on all modern browsers

## PWA Features

### Installable App

- **Install on mobile**: Add to home screen for app-like experience
- **Install on desktop**: Install as a desktop app
- **Offline support**: Works offline with service workers
- **App-like experience**: Full-screen, no browser chrome

### How to Install

**Mobile:**
1. Visit Harvous in your browser
2. Look for "Add to Home Screen" prompt
3. Tap to install
4. Open from home screen like a native app

**Desktop:**
1. Visit Harvous in your browser
2. Look for install icon in address bar
3. Click to install
4. Open from applications folder

## Choosing the Right Platform

### Use Mobile When:

- **On the go**: Quick note-taking during commutes or breaks
- **Quick capture**: Fast idea capture without full setup
- **Review content**: Reading and reviewing notes
- **Touch preference**: Prefer touch interactions

### Use Desktop When:

- **Deep study**: Extended study sessions with full keyboard
- **Organization**: Complex organization and management
- **Power user features**: Using keyboard shortcuts and advanced features
- **Multi-tasking**: Working with multiple windows and tools

## Related Guides

- **[Getting Started](getting-started.md)** - Learn the basics
- **[Keyboard Shortcuts](keyboard-shortcuts.md)** - Desktop power user features
- **[Profile and Settings](profile-and-settings.md)** - Sync across devices
- **[Tips and Best Practices](tips-and-best-practices.md)** - Platform-specific tips

---

**Need help?** Check out the [FAQs](faqs.md) or [Troubleshooting](troubleshooting.md) guide.

