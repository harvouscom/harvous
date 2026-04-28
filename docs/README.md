# Harvous Documentation

Complete documentation index for the Harvous Bible study notes application.

## Quick Navigation

### Getting Started
- **[README.md](../README.md)** - Project overview
- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Setup, development, and quick start guide
- **[USER_GUIDE.md](./USER_GUIDE.md)** - Complete user guide
- **[FEATURES.md](./FEATURES.md)** - Feature overview and examples

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Core functionality, data structures, and implementation details
- **[DATABASE.md](./DATABASE.md)** - Complete database schema, ERD, and special patterns
- **[COMPONENTS.md](./COMPONENTS.md)** - Component system, hierarchy, and communication patterns
- **[DATA_FLOW.md](./DATA_FLOW.md)** - Data flow diagrams and sequence diagrams
- **[TECH_STACK.md](./TECH_STACK.md)** - Technology stack, versions, and dependencies
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - Project organization and directory structure

### API & Development
- **[API.md](./API.md)** - Complete API reference with endpoints and examples
- **[REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md)** - Legacy React Islands notes (historical; production is SPA-only)
- **[REFACTORING_PLAN.md](./REFACTORING_PLAN.md)** - Refactoring guidelines and best practices

### Feature Documentation
- **[SHARED_SPACES_DEV_NOTES.md](./SHARED_SPACES_DEV_NOTES.md)** - Shared spaces: design decisions, visibility rules, permissions (v1 complete)
- **[LOCKED_NOTES_ENCRYPTION.md](./LOCKED_NOTES_ENCRYPTION.md)** - Locked notes: AES-GCM 256-bit, PBKDF2-SHA256 310k iterations (transparency)
- **[REFERRAL_BONUS_IMPLEMENTATION.md](./REFERRAL_BONUS_IMPLEMENTATION.md)** - Referral bonus (100 notes per friend), ReferralPanel, billing limit
- **[SCRIPTURE_PILL_IMPLEMENTATION.md](./SCRIPTURE_PILL_IMPLEMENTATION.md)** - Scripture detection and pill system
- **[SCRIPTURE_FLOW.md](./SCRIPTURE_FLOW.md)** - End-to-end scripture flow: create (deferred), verse cache, reprocess on view, update
- **[NOTE_TYPES_SYSTEM.md](./NOTE_TYPES_SYSTEM.md)** - Note types (default, scripture, resource)
- **[AUTO_TAG_DEBUGGING_GUIDE.md](./AUTO_TAG_DEBUGGING_GUIDE.md)** - Auto-tagging system details
- **[CAPTURE_SYSTEM_DESIGN.md](./CAPTURE_SYSTEM_DESIGN.md)** - Capture flow design

### Component Documentation
- **[MENU_COMPONENT_DOCUMENTATION.md](./MENU_COMPONENT_DOCUMENTATION.md)** - Menu system
- **[THREAD_COMBOBOX_REDESIGN.md](./THREAD_COMBOBOX_REDESIGN.md)** - Combobox design
- **[FONT_AWESOME_REACT_GUIDE.md](./FONT_AWESOME_REACT_GUIDE.md)** - FontAwesome integration patterns
- **[VANILLA_CSS_CLASS_SYSTEM.md](./VANILLA_CSS_CLASS_SYSTEM.md)** - CSS class system and migration guide

### Design & Styling
- **[COLOR_SYSTEM_DOCUMENTATION.md](./COLOR_SYSTEM_DOCUMENTATION.md)** - Color system design
- **[ANIMATION_GUIDELINES.md](./ANIMATION_GUIDELINES.md)** - Animation patterns and guidelines

### Development Plans
- **[ALPINE_TO_REACT_MIGRATION_PLAN.md](./ALPINE_TO_REACT_MIGRATION_PLAN.md)** - Migration strategy from Alpine.js to React

### Native prototype
- **[native-prototype/SPA_RETIREMENT_AND_PUBLIC_WEB.md](./native-prototype/SPA_RETIREMENT_AND_PUBLIC_WEB.md)** - Retiring the full SPA while retaining HTTPS surfaces for share links, space joins, invitations, and related API contracts (branch: `native-prototype`)
- **[native/PROFILE_PREFERENCES_IA.md](./native/PROFILE_PREFERENCES_IA.md)** - Native macOS/iOS profile & settings information architecture, deep links, and web panel inventory

### Issue Tracking & Lessons
- **[ALPINE_JS_LESSONS.md](./ALPINE_JS_LESSONS.md)** - Alpine.js lessons learned
- **[NAVIGATION_HISTORY_PERSISTENCE_LESSONS.md](./NAVIGATION_HISTORY_PERSISTENCE_LESSONS.md)** - Navigation persistence patterns
- **[REACT_PORTAL_CLICK_OUTSIDE_LESSONS.md](./REACT_PORTAL_CLICK_OUTSIDE_LESSONS.md)** - Portal patterns and lessons

### Specialized Guides
- **[TYPESCRIPT_INLINE_SCRIPTS.md](./TYPESCRIPT_INLINE_SCRIPTS.md)** - TypeScript syntax in inline scripts
- **[TYPESCRIPT_JSX_CONFIGURATION.md](./TYPESCRIPT_JSX_CONFIGURATION.md)** - Legacy: JSX/TypeScript config for Astro + React (Astro removed; kept for reference)
- **[KEYBOARD_SHORTCUTS.md](./KEYBOARD_SHORTCUTS.md)** - Keyboard shortcuts reference
- **[PWA_INITIAL_LOAD_OPTIMIZATIONS.md](./PWA_INITIAL_LOAD_OPTIMIZATIONS.md)** - PWA optimization strategies

## Documentation Categories

### For Users
- User guides and feature documentation
- How-to guides and examples
- Feature overviews

### For Developers
- Architecture and design documentation
- API references
- Component documentation
- Development guides and best practices

### For Contributors
- Contributing guidelines
- Development setup
- Code style and patterns
- Migration guides

## Finding What You Need

**Want to understand the system?**
→ Start with [ARCHITECTURE.md](./ARCHITECTURE.md), then explore [DATABASE.md](./DATABASE.md) and [COMPONENTS.md](./COMPONENTS.md)

**Want to know what runs in production?**
→ [TECH_STACK.md](./TECH_STACK.md) and [GETTING_STARTED.md](./GETTING_STARTED.md) — production is **React SPA + Hono API**; Astro is used for build tooling and optional dev only, not served in production.

**Working on a feature?**
→ Check [FEATURES.md](./FEATURES.md) and related feature documentation

**Building a component?**
→ See [COMPONENTS.md](./COMPONENTS.md) and [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md)

**Integrating with the API?**
→ Reference [API.md](./API.md) for complete endpoint documentation

**Setting up development?**
→ See the main [README.md](../README.md) for setup instructions

## Documentation Standards

- All documentation uses Markdown format
- Code examples include syntax highlighting
- Diagrams use Mermaid syntax
- Cross-references use relative paths
- Keep documentation up-to-date with code changes

## Contributing to Documentation

When adding or updating documentation:

1. **Place files in appropriate location**
   - Architecture docs → `docs/`
   - User guides → `docs/` (or root if primary)
   - Component docs → `docs/`

2. **Update this index** when adding new documentation files

3. **Use clear, descriptive titles** and organize with headers

4. **Include code examples** where helpful

5. **Cross-reference related docs** for easy navigation

