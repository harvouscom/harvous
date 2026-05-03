# Harvous Design Parity Spec

This document defines how Harvous ships a native-first product while keeping the web experience visually familiar and functionally reliable.

## 1) Product Positioning

- Apple native (`iOS` + `macOS`) is the flagship experience.
- Web is secondary and must preserve access to core workflows.
- Harvous maintains high visual consistency across platforms.
- Harvous does not promise strict behavior parity when platform norms differ.

## 2) Parity Principles

### Principle A: Visual Familiarity First

Users should immediately recognize Harvous regardless of platform.

- Use a shared design language for color, type, spacing, shape, and icon style.
- Preserve information hierarchy and content layout patterns.
- Keep core component identity stable (cards, pills, lists, editor chrome, settings structure).

### Principle B: Native Behavior Preferred

Interaction details should follow platform expectations.

- Native apps use Apple interaction patterns where available.
- Web uses browser-appropriate equivalents for discoverability and accessibility.
- Equivalent outcomes are required even if the motion/gesture mechanics differ.

### Principle C: Core Flow Reliability Everywhere

Critical user jobs must work on all supported platforms.

- Read, create, and edit notes
- Navigate spaces and threads
- Sync and load content
- Sharing, join, and invite flows
- Account/profile and basic settings

### Principle D: No Forced Lowest Common Denominator

Web compatibility should not block native innovation.

- Apple-native features can ship first.
- Web receives a compatible adaptation when practical.
- Apple-only features are acceptable when they depend on OS-specific capabilities.

## 3) Support Tiers

Use this matrix for every new feature.

### Tier A: Must Match Everywhere (Outcome + UI Intent)

Required on native and web.

- Authentication and account access
- Space/thread/note navigation
- Core note authoring and viewing
- Primary actions (create, update, archive/delete where applicable)
- Essential search and retrieval
- Sharing and membership basics

### Tier B: Apple-First, Web-Follow (Outcome Required)

Ships to native first, then web adaptation as needed.

- Advanced editor affordances
- Dense productivity interactions
- Rich gestures/transitions
- Advanced settings and power-user controls

### Tier C: Apple-Only (OS-Native)

No required web equivalent if the capability is platform-specific.

- Deep OS surfaces and integrations that do not map well to browser APIs
- High-context native system experiences

## 4) Shared Design Foundations

Maintain these as single-source design tokens and usage rules.

### 4.1 Tokens

- Color roles (background, surface, accent, text, semantic states)
- Typography scale (display/title/body/caption)
- Spacing scale
- Radius and border thickness
- Elevation/shadow levels
- Motion durations and easing families

### 4.2 Core Components

Every native component should define a web counterpart.

- `Card`
- `Pill`
- `ListRow`
- `SectionHeader`
- `ActionBar` / `Toolbar`
- `Sheet` / `Modal`
- `Banner` / `Callout`
- `EmptyState`
- `SearchField`

### 4.3 Interaction Patterns

- Navigation model
- Create/edit/save patterns
- Empty/loading/error states
- Confirmation/destructive actions
- Keyboard and accessibility behavior

## 5) Allowed Cross-Platform Differences

Differences are allowed when they preserve intent and reduce platform friction.

- Gestures vs click/keyboard equivalents
- Sheet style and presentation model
- Context menu invocation model
- Keyboard shortcut mappings
- Animation detail (timing and choreography can vary per platform)

Not allowed:

- Breaking core flow parity in Tier A features
- Unexplained terminology drift for the same concept
- Significant visual identity drift from Harvous tokens

## 6) Feature Spec Template (Required)

Use this section for each new feature before implementation.

### Feature Name

`<name>`

### User Outcome

`<what user can accomplish>`

### Tier

`A | B | C`

### Native (Apple) Experience

- UI entry point:
- Interaction model:
- Success/error states:
- Accessibility considerations:

### Web Experience

- UI entry point:
- Adapted interaction model:
- Success/error states:
- Accessibility considerations:

### Parity Contract

- Must be visually identical in:
- Must be functionally equivalent in:
- Allowed differences:
- Explicit non-goals:

### Rollout Plan

- Native ship target:
- Web ship target:
- If web-delayed, user-facing fallback:

### QA Checklist

- Core flow completed end-to-end on iOS
- Core flow completed end-to-end on macOS
- Core flow completed end-to-end on web desktop
- Keyboard-only traversal validated (web + macOS)
- Screen reader sanity check (native + web)
- Error states tested (offline, API failure, permission edge cases)

## 7) Decision Rules for PM and Design

Apply these rules during scoping:

1. If a feature is core workflow, start at Tier A by default.
2. If a feature depends on OS primitives, consider Tier C.
3. If a feature is productivity/polish, use Tier B unless evidence demands Tier A.
4. If web users are active in a workflow, do not remove baseline access.
5. Prefer visual consistency over interaction sameness when tradeoffs are required.

## 8) Metrics to Track

Measure whether the strategy is working:

- Adoption by platform (iOS, macOS, web)
- Retention by platform and cohort
- Feature completion rates by platform
- Support tickets caused by parity gaps
- Time lag between native and web for Tier B features

## 9) Governance

- This spec is the source of truth for parity decisions.
- Any exception must be documented in the relevant feature spec.
- Revisit tiers quarterly using product usage and support data.
