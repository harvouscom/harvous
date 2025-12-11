# Note Types Design - Pending Design Review

## Status: PARTIALLY COMPLETE

**Date**: January 26, 2025 (Updated: Resource notes enabled)  
**Priority**: MEDIUM - Scripture notes pending design review

## Current Implementation

The Note Types Foundation has been implemented with basic functionality:

### ✅ Completed
- **Database Schema**: `noteType` column exists with default value 'default'
- **API Integration**: Note creation API handles noteType validation and storage
- **Type-Specific Validation**: Different validation rules for each note type
- **Form Submission**: Type-specific form data handling
- **Resource Notes**: Fully implemented and enabled ✅ **PRODUCTION READY**

### 🚧 Current Layout
- **Default Notes**: Title input + content editor ✅ **ACTIVE**
- **Resource Notes**: URL input with metadata preview ✅ **ACTIVE** - Users can create resource notes via the resource panel
- **Scripture Notes**: Reference input + content editor - **DISABLED** (pending design review)

### 🔒 Current Status (Updated)
- **Resource Notes**: **ENABLED** - Fully functional, production-ready
- **Default Notes**: **ENABLED** - Working as expected
- **Scripture Notes**: **DISABLED** - Waiting for design specifications
- **Note Type Switching**: Resource notes accessible via dedicated resource panel; scripture notes disabled until designs are ready

## Design Decision Needed

**Issue**: Scripture note layouts are basic and don't provide the distinct, specialized experience needed for scripture study workflow.

**User Feedback**: "hmmm ill come back to this later with designs for each note type for the new note panel of each type"

## Required Design Work

### 1. Scripture Note Design (PENDING)
- **Current**: Simple reference input + content editor
- **Status**: **DISABLED** - Waiting for design specifications
- **Needed**: Specialized layout for scripture study workflow
- **Considerations**:
  - Scripture reference formatting
  - Bible verse display
  - Study notes organization
  - Cross-reference capabilities

### 2. Resource Note Design ✅ **COMPLETE**
- **Current**: URL input with automatic metadata fetching and preview
- **Status**: **ENABLED** - Production-ready, fully functional
- **Features**:
  - ✅ URL preview/validation
  - ✅ Resource metadata capture (Open Graph)
  - ✅ Article content extraction
  - ✅ Source attribution
  - ✅ Image preview support

### 3. Default Note Design ✅ **COMPLETE**
- **Current**: Title + content editor
- **Status**: Working well, no changes needed

## Impact on V1 Timeline

### Week 2: Note Types Foundation
- **Status**: ✅ **PARTIALLY COMPLETE** - Resource notes enabled, scripture notes pending
- **Resource Notes**: Production-ready, no further work needed
- **Scripture Notes**: Waiting for design specifications
- **Next Steps**: 
  1. Design review session for scripture notes
  2. Implement specialized scripture layouts
  3. Test scripture note workflow

### Week 3: Selected Text Feature
- **Status**: Can proceed in parallel with scripture note design
- **Dependency**: None (separate feature)

### Week 4: Polish & Launch
- **Status**: Resource notes ready for launch; scripture notes can be added later if needed

## Technical Foundation Ready

The technical foundation is complete and ready for design implementation:

- ✅ Database schema supports note types
- ✅ API handles type-specific data
- ✅ React component structure supports distinct layouts
- ✅ Icon system and type switching works
- ✅ Form validation is type-specific

## Next Steps (Scripture Notes Only)

1. **Design Review**: User to provide designs for scripture note type
2. **Re-enable Functionality**: Change `{false && noteType === 'scripture' && (` back to `{noteType === 'scripture' && (`
3. **Layout Implementation**: Implement specialized scripture layouts based on designs
4. **Testing**: Test scripture note workflow
5. **Integration**: Ensure seamless switching between types

## Files to Update (When Scripture Designs Ready)

- `src/components/react/NewNotePanel.tsx` - Main component with type-specific layouts
- Potentially new components for specialized scripture layouts
- Type-specific styling and interactions

---

**Note**: Resource notes are production-ready and fully functional. Only scripture notes remain pending design review. The technical implementation is complete for both note types.
