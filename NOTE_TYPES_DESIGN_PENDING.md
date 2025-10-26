# Note Types Design - Pending Design Review

## Status: PENDING DESIGN REVIEW

**Date**: January 26, 2025  
**Priority**: HIGH - Blocking V1 Note Types Foundation completion

## Current Implementation

The Note Types Foundation has been implemented with basic functionality:

### ✅ Completed
- **Database Schema**: `noteType` column exists with default value 'default'
- **API Integration**: Note creation API handles noteType validation and storage
- **Icon Cycling**: Clickable icons to switch between note types (bookmark/scroll/file-image)
- **Type-Specific Validation**: Different validation rules for each note type
- **Form Submission**: Type-specific form data handling

### 🚧 Current Layout (Temporary)
- **Default Notes**: Title input + content editor
- **Scripture Notes**: Reference input + content editor  
- **Resource Notes**: URL input + content editor

## Design Decision Needed

**Issue**: The current layouts are basic and don't provide the distinct, specialized experience needed for each note type.

**User Feedback**: "hmmm ill come back to this later with designs for each note type for the new note panel of each type"

## Required Design Work

### 1. Scripture Note Design
- **Current**: Simple reference input + content editor
- **Needed**: Specialized layout for scripture study workflow
- **Considerations**:
  - Scripture reference formatting
  - Bible verse display
  - Study notes organization
  - Cross-reference capabilities

### 2. Resource Note Design  
- **Current**: Simple URL input + content editor
- **Needed**: Specialized layout for resource capture and organization
- **Considerations**:
  - URL preview/validation
  - Resource metadata capture
  - Media attachment support
  - Source attribution

### 3. Default Note Design
- **Current**: Title + content editor (working well)
- **Status**: May need minor refinements based on other types

## Impact on V1 Timeline

### Week 2: Note Types Foundation (CURRENT)
- **Status**: ⚠️ **BLOCKED** - Waiting for design specifications
- **Dependency**: Design review and specifications needed
- **Next Steps**: 
  1. Design review session
  2. Implement specialized layouts
  3. Test type-specific workflows

### Week 3: Selected Text Feature
- **Status**: Can proceed in parallel with note types design
- **Dependency**: None (separate feature)

### Week 4: Polish & Launch
- **Status**: May be affected if note types design takes longer

## Technical Foundation Ready

The technical foundation is complete and ready for design implementation:

- ✅ Database schema supports note types
- ✅ API handles type-specific data
- ✅ React component structure supports distinct layouts
- ✅ Icon system and type switching works
- ✅ Form validation is type-specific

## Next Steps

1. **Design Review**: User to provide designs for each note type
2. **Layout Implementation**: Implement specialized layouts based on designs
3. **Testing**: Test each note type workflow
4. **Integration**: Ensure seamless switching between types

## Files to Update (When Designs Ready)

- `src/components/react/NewNotePanel.tsx` - Main component with type-specific layouts
- Potentially new components for specialized layouts
- Type-specific styling and interactions

---

**Note**: This is a critical dependency for V1 Note Types Foundation completion. The technical implementation is ready, but the user experience design needs to be finalized before proceeding.
