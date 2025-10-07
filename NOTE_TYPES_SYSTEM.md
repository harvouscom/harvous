# Note Types System

## Overview

A comprehensive note type system that enhances the Harvous note-taking experience by providing specialized note types for different content categories. This system builds upon the existing note creation infrastructure while adding powerful categorization and formatting capabilities.

## Note Types

### 1. Default Notes (Current)
**Type**: `default`  
**Description**: Standard notes with rich text content  
**Use Case**: General note-taking, thoughts, insights, study notes  
**Features**: Full rich text editing, thread assignment, search functionality  

### 2. Scripture Notes
**Type**: `scripture`  
**Description**: Specialized notes for Bible verses and scripture references  
**Use Case**: Capturing verses, cross-references, scripture study  
**Features**: 
- Automatic scripture detection and formatting
- Bible reference linking
- Translation support
- Cross-reference suggestions
- Specialized scripture display formatting

### 3. Resource Notes
**Type**: `resource`  
**Description**: Notes for external resources, articles, and media  
**Use Case**: Capturing web content, PDFs, images, videos, articles  
**Features**:
- Source URL tracking
- Media attachment support
- Source attribution
- Capture metadata
- Integration with future capture system

## Database Schema Updates

### Notes Table Enhancement
```sql
-- Add noteType column to existing Notes table
ALTER TABLE Notes ADD COLUMN noteType TEXT DEFAULT 'default';
-- Values: 'default', 'scripture', 'resource'
```

### New Metadata Tables

#### ScriptureMetadata Table
```sql
CREATE TABLE ScriptureMetadata (
  id TEXT PRIMARY KEY,
  noteId TEXT NOT NULL,
  reference TEXT NOT NULL, -- "John 3:16"
  book TEXT NOT NULL, -- "John"
  chapter INTEGER NOT NULL, -- 3
  verse INTEGER NOT NULL, -- 16
  translation TEXT, -- "ESV", "NIV", "KJV", etc.
  originalText TEXT, -- Full verse text
  context TEXT, -- Surrounding verses for context
  crossReferences TEXT, -- JSON array of related verses
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (noteId) REFERENCES Notes(id) ON DELETE CASCADE
);
```

#### ResourceMetadata Table
```sql
CREATE TABLE ResourceMetadata (
  id TEXT PRIMARY KEY,
  noteId TEXT NOT NULL,
  sourceUrl TEXT NOT NULL,
  sourceTitle TEXT,
  sourceType TEXT, -- 'website', 'pdf', 'image', 'video', 'article'
  capturedAt DATETIME,
  mediaUrls TEXT, -- JSON array of media URLs
  metadata JSON, -- Additional source data (author, date, etc.)
  isArchived BOOLEAN DEFAULT FALSE, -- For offline content
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (noteId) REFERENCES Notes(id) ON DELETE CASCADE
);
```

## User Experience Flow

### Scripture Note Creation
1. **User selects scripture text** in TiptapEditor
2. **Scripture detection** automatically identifies Bible reference
3. **"Create Scripture Note" button** appears with scripture icon
4. **Pre-populated form** with:
   - Scripture reference (e.g., "John 3:16")
   - Full verse text
   - Translation information
   - Context (surrounding verses)
5. **User adds personal notes** and chooses thread
6. **Note saved** with scripture formatting and metadata

### Resource Note Creation
1. **User captures content** from external source
2. **Resource detection** identifies source type and metadata
3. **"Create Resource Note" button** appears with resource icon
4. **Pre-populated form** with:
   - Source URL and title
   - Captured content
   - Media attachments
   - Source attribution
5. **User adds personal notes** and chooses thread
6. **Note saved** with resource formatting and metadata

## Technical Implementation

### Enhanced TiptapEditor with Type Detection
```typescript
// In TiptapEditor.tsx
interface NoteTypeDetection {
  type: 'default' | 'scripture' | 'resource';
  confidence: number;
  metadata?: any;
}

const detectNoteType = (selectedText: string): NoteTypeDetection => {
  // Scripture detection
  const scripturePattern = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+/gi;
  
  if (scripturePattern.test(selectedText)) {
    return {
      type: 'scripture',
      confidence: 0.9,
      metadata: {
        reference: selectedText.match(scripturePattern)?.[0],
        book: extractBook(selectedText),
        chapter: extractChapter(selectedText),
        verse: extractVerse(selectedText)
      }
    };
  }
  
  // Resource detection (URLs, media references)
  const urlPattern = /https?:\/\/[^\s]+/gi;
  if (urlPattern.test(selectedText)) {
    return {
      type: 'resource',
      confidence: 0.8,
      metadata: {
        sourceUrl: selectedText.match(urlPattern)?.[0]
      }
    };
  }
  
  return { type: 'default', confidence: 1.0 };
};
```

### Enhanced NewNotePanel with Type Selection
```tsx
// In NewNotePanel.tsx
interface NewNotePanelProps {
  prePopulatedContent?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  typeMetadata?: any;
}

export default function NewNotePanel({ 
  prePopulatedContent, 
  noteType = 'default',
  typeMetadata 
}: NewNotePanelProps) {
  const [selectedNoteType, setSelectedNoteType] = useState(noteType);
  const [scriptureData, setScriptureData] = useState<ScriptureMetadata | null>(null);
  const [resourceData, setResourceData] = useState<ResourceMetadata | null>(null);

  // Note type selector
  const renderNoteTypeSelector = () => (
    <div className="note-type-selector">
      <label>Note Type:</label>
      <div className="type-options">
        <button 
          className={`type-option ${selectedNoteType === 'default' ? 'active' : ''}`}
          onClick={() => setSelectedNoteType('default')}
        >
          <FaStickyNoteIcon />
          Default Note
        </button>
        <button 
          className={`type-option ${selectedNoteType === 'scripture' ? 'active' : ''}`}
          onClick={() => setSelectedNoteType('scripture')}
        >
          <FaBibleIcon />
          Scripture
        </button>
        <button 
          className={`type-option ${selectedNoteType === 'resource' ? 'active' : ''}`}
          onClick={() => setSelectedNoteType('resource')}
        >
          <FaLinkIcon />
          Resource
        </button>
      </div>
    </div>
  );

  // Scripture-specific fields
  const renderScriptureFields = () => (
    <div className="scripture-fields">
      <div className="scripture-reference">
        <label>Scripture Reference:</label>
        <input 
          type="text" 
          value={scriptureData?.reference || ''}
          onChange={(e) => setScriptureData({...scriptureData, reference: e.target.value})}
          placeholder="John 3:16"
        />
      </div>
      <div className="scripture-translation">
        <label>Translation:</label>
        <select 
          value={scriptureData?.translation || 'ESV'}
          onChange={(e) => setScriptureData({...scriptureData, translation: e.target.value})}
        >
          <option value="ESV">ESV</option>
          <option value="NIV">NIV</option>
          <option value="KJV">KJV</option>
          <option value="NASB">NASB</option>
        </select>
      </div>
    </div>
  );

  // Resource-specific fields
  const renderResourceFields = () => (
    <div className="resource-fields">
      <div className="resource-source">
        <label>Source URL:</label>
        <input 
          type="url" 
          value={resourceData?.sourceUrl || ''}
          onChange={(e) => setResourceData({...resourceData, sourceUrl: e.target.value})}
          placeholder="https://example.com"
        />
      </div>
      <div className="resource-title">
        <label>Source Title:</label>
        <input 
          type="text" 
          value={resourceData?.sourceTitle || ''}
          onChange={(e) => setResourceData({...resourceData, sourceTitle: e.target.value})}
          placeholder="Article or resource title"
        />
      </div>
    </div>
  );
};
```

### Note Type-Specific Display Components

#### CardScriptureNote Component
```tsx
// CardScriptureNote.tsx
interface CardScriptureNoteProps {
  note: Note;
  scriptureData: ScriptureMetadata;
}

export default function CardScriptureNote({ note, scriptureData }: CardScriptureNoteProps) {
  return (
    <div className="scripture-note">
      <div className="scripture-header">
        <div className="scripture-reference">
          <FaBibleIcon />
          <span>{scriptureData.reference}</span>
          <span className="translation">({scriptureData.translation})</span>
        </div>
      </div>
      
      <div className="scripture-text">
        <blockquote>
          {scriptureData.originalText}
        </blockquote>
      </div>
      
      <div className="note-content">
        <div className="content" dangerouslySetInnerHTML={{ __html: note.content }} />
      </div>
      
      <div className="scripture-metadata">
        <span className="book">{scriptureData.book}</span>
        <span className="chapter-verse">Chapter {scriptureData.chapter}, Verse {scriptureData.verse}</span>
      </div>
    </div>
  );
}
```

#### CardResourceNote Component
```tsx
// CardResourceNote.tsx
interface CardResourceNoteProps {
  note: Note;
  resourceData: ResourceMetadata;
}

export default function CardResourceNote({ note, resourceData }: CardResourceNoteProps) {
  return (
    <div className="resource-note">
      <div className="resource-header">
        <div className="resource-source">
          <FaLinkIcon />
          <a href={resourceData.sourceUrl} target="_blank" rel="noopener noreferrer">
            {resourceData.sourceTitle || resourceData.sourceUrl}
          </a>
        </div>
        <div className="resource-type">
          <span className="type-badge">{resourceData.sourceType}</span>
        </div>
      </div>
      
      <div className="note-content">
        <div className="content" dangerouslySetInnerHTML={{ __html: note.content }} />
      </div>
      
      <div className="resource-metadata">
        <span className="captured-at">Captured {formatDate(resourceData.capturedAt)}</span>
        {resourceData.mediaUrls && (
          <div className="media-attachments">
            {/* Display media attachments */}
          </div>
        )}
      </div>
    </div>
  );
}
```

## API Updates

### Enhanced Note Creation API
```typescript
// In /api/notes/create.ts
export const POST: APIRoute = async ({ request, locals }) => {
  const formData = await request.formData();
  const noteType = formData.get('noteType') as string;
  const scriptureData = formData.get('scriptureData') ? JSON.parse(formData.get('scriptureData')) : null;
  const resourceData = formData.get('resourceData') ? JSON.parse(formData.get('resourceData')) : null;

  // Create note with type
  const newNote = await db.insert(Notes).values({
    id: generateNoteId(),
    content: capitalizedContent,
    title: capitalizedTitle,
    threadId: finalThreadId,
    spaceId: spaceId || null,
    simpleNoteId: nextSimpleNoteId,
    userId,
    isPublic,
    noteType: noteType || 'default',
    createdAt: new Date()
  });

  // Create type-specific metadata
  if (noteType === 'scripture' && scriptureData) {
    await db.insert(ScriptureMetadata).values({
      id: generateId(),
      noteId: newNote.id,
      reference: scriptureData.reference,
      book: scriptureData.book,
      chapter: scriptureData.chapter,
      verse: scriptureData.verse,
      translation: scriptureData.translation,
      originalText: scriptureData.originalText,
      context: scriptureData.context
    });
  }

  if (noteType === 'resource' && resourceData) {
    await db.insert(ResourceMetadata).values({
      id: generateId(),
      noteId: newNote.id,
      sourceUrl: resourceData.sourceUrl,
      sourceTitle: resourceData.sourceTitle,
      sourceType: resourceData.sourceType,
      capturedAt: resourceData.capturedAt,
      mediaUrls: JSON.stringify(resourceData.mediaUrls || []),
      metadata: JSON.stringify(resourceData.metadata || {})
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    note: newNote,
    message: `${noteType} note created successfully!`
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### Scripture Detection API
```typescript
// In /api/scripture/detect.ts
export const POST: APIRoute = async ({ request }) => {
  const { text } = await request.json();
  
  const scripturePattern = /\b(?:Genesis|Exodus|...|Revelation)\s+\d+:\d+/gi;
  const matches = text.match(scripturePattern);
  
  if (matches) {
    const reference = matches[0];
    const [book, chapterVerse] = reference.split(' ');
    const [chapter, verse] = chapterVerse.split(':');
    
    return new Response(JSON.stringify({
      isScripture: true,
      reference,
      book,
      chapter: parseInt(chapter),
      verse: parseInt(verse),
      confidence: 0.9
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    isScripture: false,
    confidence: 0
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## Integration with Selected Text Feature

### Enhanced Selection Detection
```typescript
// In TiptapEditor.tsx - Enhanced selection with type detection
const handleSelection = (selectedText: string) => {
  const noteType = detectNoteType(selectedText);
  
  if (noteType.type === 'scripture') {
    // Show "Create Scripture Note" button with Bible icon
    setShowCreateNoteButton(true);
    setButtonText('Create Scripture Note');
    setButtonIcon('bible');
    setNoteType('scripture');
    setTypeMetadata(noteType.metadata);
  } else if (noteType.type === 'resource') {
    // Show "Create Resource Note" button with link icon
    setShowCreateNoteButton(true);
    setButtonText('Create Resource Note');
    setButtonIcon('link');
    setNoteType('resource');
    setTypeMetadata(noteType.metadata);
  } else {
    // Show regular "Create Note" button
    setShowCreateNoteButton(true);
    setButtonText('Create Note');
    setButtonIcon('plus');
    setNoteType('default');
  }
};
```

## Benefits

### For Users
- **Specialized Note Types**: Each note type optimized for its content category
- **Automatic Detection**: Smart detection of scripture and resource content
- **Enhanced Organization**: Better categorization and search capabilities
- **Rich Metadata**: Additional context and information for each note type

### For the Platform
- **Better Content Structure**: Organized content by type and purpose
- **Enhanced Search**: Type-specific search and filtering capabilities
- **Future Integration**: Foundation for advanced features like cross-references
- **User Engagement**: More specialized and useful note-taking experience

## Implementation Phases

### Phase 1: Database & Basic Types (2-3 weeks)
- [ ] Add noteType column to Notes table
- [ ] Create ScriptureMetadata and ResourceMetadata tables
- [ ] Update note creation API for note types
- [ ] Basic note type selection in NewNotePanel

### Phase 2: Scripture Notes (2-3 weeks)
- [ ] Scripture detection in selected text feature
- [ ] Scripture formatting and display components
- [ ] Bible reference linking and cross-references
- [ ] Translation support and metadata

### Phase 3: Resource Notes (2-3 weeks)
- [ ] Resource metadata capture and display
- [ ] Media attachment support
- [ ] Source attribution and linking
- [ ] Integration with future capture system

### Phase 4: Advanced Features (3-4 weeks)
- [ ] Smart type suggestions based on content
- [ ] Advanced search and filtering by note type
- [ ] Note type conversion and migration
- [ ] Analytics and usage tracking

## Future Enhancements

### Advanced Scripture Features
- **Cross-reference linking**: Automatic linking between related verses
- **Commentary integration**: Integration with Bible commentaries
- **Study tools**: Greek/Hebrew word studies, concordance integration
- **Reading plans**: Integration with Bible reading plans

### Advanced Resource Features
- **Web capture**: Browser extension for content capture
- **PDF processing**: Automatic text extraction from PDFs
- **Media processing**: Image and video content analysis
- **Source verification**: Automatic source validation and archiving

### Note Type Analytics
- **Usage tracking**: Track which note types are most popular
- **Content analysis**: Analyze content patterns by note type
- **User behavior**: Understand how users organize different content types
- **Feature optimization**: Optimize features based on usage patterns

## Conclusion

The Note Types System would create a powerful, organized note-taking experience that leverages the selected text feature while providing specialized functionality for different content categories. This system builds upon existing infrastructure while adding significant value through better organization, search capabilities, and specialized features for scripture and resource content.

The implementation can be done incrementally, starting with basic note types and gradually adding advanced features. This approach ensures a solid foundation while providing immediate value to users.
