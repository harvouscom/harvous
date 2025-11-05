# "Added By" Field Design Document

## Overview

The "added by" field is a metadata field on all notes that tracks the source or creator of a note. This enables distinguishing between user-created notes and notes created by automated systems (built-in scripts, MCP integrations, etc.).

## Use Cases

### 1. User-Created Notes (Default)
- **Value**: `"user"`
- **Description**: Notes manually created by the user through the standard note creation flow
- **Examples**: 
  - Sermon notes typed by the user
  - Personal study notes
  - Default note type entries

### 2. Harvous Built-in Scripts
- **Value**: `"harvous"`
- **Description**: Notes automatically created by Harvous's built-in automation features
- **Examples**:
  - Script detection system that auto-creates scripture notes
  - Future auto-tagging features that create summary notes
  - System-generated content from user actions

### 3. MCP Integrations (Future)
- **Value**: `"mcp-{source}"`
- **Description**: Notes created via Model Context Protocol (MCP) integrations
- **Examples**:
  - `"mcp-bible-api"` - Notes from Bible API integrations
  - `"mcp-research-tool"` - Notes from research automation tools
  - `"mcp-commentary"` - Notes from commentary sources
  - Custom MCP server identifiers

## Database Schema

### Notes Table Addition

```typescript
const Notes = defineTable({
  columns: {
    // ... existing fields ...
    addedBy: column.text({ default: 'user' }), // 'user', 'harvous', 'mcp-{source}', etc.
    // ... rest of fields ...
  }
})
```

### Field Specifications

- **Type**: `text` (string)
- **Default**: `"user"` (ensures backward compatibility)
- **Nullable**: No (always has a value)
- **Values**: 
  - `"user"` - Default for all user-created notes
  - `"harvous"` - Built-in Harvous automation
  - `"mcp-{identifier}"` - MCP source-specific identifiers

## Implementation Plan

### Phase 1: Database Schema
- [ ] Add `addedBy` column to `Notes` table in `db/config.ts`
- [ ] Set default value to `"user"`
- [ ] Run database migration (`npm run db:push`)

### Phase 2: Note Creation Endpoints
- [ ] Update `src/pages/api/notes/create.ts`
  - Accept `addedBy` from form data (optional, defaults to `"user"`)
  - Store `addedBy` value when creating note
- [ ] Update `src/actions/notes.ts`
  - Add `addedBy` to input schema (optional)
  - Default to `"user"` if not provided

### Phase 3: Script Detection Integration
- [ ] Determine if script detection should auto-create notes or only pre-fill
  - **Current behavior**: Script detection pre-fills form, user still submits
  - **Question**: Should auto-detection create notes without user interaction?
- [ ] If auto-creation is implemented:
  - Set `addedBy: "harvous"` when script detection auto-creates notes
- [ ] If only pre-fill (current behavior):
  - Keep `addedBy: "user"` (user still submits the form)

### Phase 4: UI Display (Optional)
- [ ] Decide if `addedBy` should be visible to users
- [ ] If yes, add display component showing source:
  - "Added by you" for `"user"`
  - "Added by Harvous" for `"harvous"`
  - "Added by {source}" for MCP sources
- [ ] Consider filtering/searching by source

### Phase 5: MCP Integration (Future)
- [ ] When MCP servers create notes:
  - Pass source identifier in format: `"mcp-{server-name}"` or `"mcp-{server-id}"`
  - Store in `addedBy` field
  - Enable source-specific attribution

## Open Questions

### 1. Script Detection Behavior
**Question**: Should script detection auto-create notes or only pre-fill forms?

**Current**: Script detection in `NewNotePanel.tsx` detects scripture references and pre-fills the form, but the user still needs to submit.

**Options**:
- **Option A**: Keep current behavior (pre-fill only) → `addedBy: "user"`
- **Option B**: Auto-create notes when high-confidence detection → `addedBy: "harvous"`
- **Option C**: Both - auto-create with option to edit → `addedBy: "harvous"` with edit capability

**Recommendation**: Start with Option A (current behavior), add auto-creation as separate feature later.

### 2. UI Visibility
**Question**: Should users see the "added by" information in the UI?

**Options**:
- **Option A**: Display prominently (e.g., in note header)
- **Option B**: Display in metadata/details section
- **Option C**: Hidden from users, only for backend/analytics

**Recommendation**: Option B (metadata section) - useful for transparency but not cluttering main UI.

### 3. Filtering & Search
**Question**: Should users be able to filter/search notes by source?

**Use Cases**:
- "Show me all notes I created vs. notes created by Harvous"
- "Show me all MCP-sourced notes"
- Analytics: "How many notes were auto-created vs. user-created?"

**Recommendation**: Yes, add filtering capability in search/filter UI.

### 4. Migration Strategy
**Question**: How should existing notes be handled?

**Options**:
- **Option A**: All existing notes default to `"user"` (via database default)
- **Option B**: Run migration script to explicitly set all existing notes to `"user"`

**Recommendation**: Option A (database default handles it automatically).

### 5. MCP Source Naming
**Question**: What format should MCP source identifiers use?

**Options**:
- `"mcp-{server-name}"` - Human-readable (e.g., `"mcp-bible-api"`)
- `"mcp-{server-id}"` - Unique identifier (e.g., `"mcp-abc123"`)
- `"mcp-{server-name}-{function}"` - More specific (e.g., `"mcp-bible-api-verse-lookup"`)

**Recommendation**: `"mcp-{server-name}"` for readability, with option to add function suffix if needed.

## Technical Considerations

### Backward Compatibility
- Default value of `"user"` ensures all existing notes and new notes without explicit `addedBy` are treated as user-created
- No breaking changes to existing note creation flows

### Performance
- Single text field addition - minimal performance impact
- No additional indexes needed (unless filtering becomes common)

### Data Integrity
- Field is required (not nullable) with default value
- Values should be validated in API endpoints to prevent invalid sources

### Future Extensibility
- Design supports any string value, allowing for future source types
- MCP integration can use structured naming convention
- Can add enum/constraints later if needed

## Example Usage

### User Creates Note
```typescript
// User submits form via NewNotePanel
// addedBy defaults to "user" (not specified in form)
const newNote = await db.insert(Notes).values({
  // ... other fields ...
  addedBy: 'user' // default
});
```

### Script Detection Auto-Creates Note
```typescript
// Script detection automatically creates note
const newNote = await db.insert(Notes).values({
  // ... other fields ...
  addedBy: 'harvous' // explicitly set
});
```

### MCP Integration Creates Note
```typescript
// MCP server creates note
const newNote = await db.insert(Notes).values({
  // ... other fields ...
  addedBy: 'mcp-bible-api' // MCP source identifier
});
```

## Related Files

- `db/config.ts` - Database schema definition
- `src/pages/api/notes/create.ts` - Note creation API endpoint
- `src/actions/notes.ts` - Note creation action
- `src/components/react/NewNotePanel.tsx` - Note creation UI
- `src/utils/scripture-detector.ts` - Script detection utility

## Status

**Current Status**: Design phase - not yet implemented

**Next Steps**:
1. Resolve open questions
2. Implement database schema change
3. Update note creation endpoints
4. Test with existing note creation flows
5. Add UI display (if needed)

## Notes

- This feature is designed to be additive and non-breaking
- Default value ensures backward compatibility
- Future MCP integration can leverage this field for source attribution
- Can be extended to support more granular source tracking if needed

