# Harvous Capture System Design

## Overview

This document outlines a comprehensive capture system for Harvous that enables users to save content from various sources, with special focus on Bible study and scripture capture. The system is designed as a web-only solution using browser extensions to avoid the complexity of mobile app development.

## Current System Analysis

### Existing Harvous Foundation
- **Rich note system** with sequential IDs (N001, N002, etc.)
- **Hierarchical organization** (Spaces → Threads → Notes)
- **Real database** with Turso and Clerk authentication
- **XP gamification** system
- **Alpine.js integration** for interactive components
- **Quill.js rich text editor** with HTML content processing

### Database Schema
```sql
-- Current tables
Spaces: id, title, description, color, userId, isPublic, isActive
Threads: id, title, subtitle, spaceId, userId, isPublic, isPinned, color
Notes: id, title, content, threadId, spaceId, simpleNoteId, userId, isPublic, isFeatured
UserMetadata: id, userId, highestSimpleNoteId, createdAt, updatedAt
```

## Web-Only Capture System Architecture

### 1. Browser Extension (Chrome, Firefox, Safari, Edge)

#### Core Functionality
- **One-click capture** from any website
- **Text selection** and highlight capture
- **Image capture** with context
- **Full page capture** with metadata
- **Scripture detection** and auto-formatting

#### Technical Implementation
```javascript
// Manifest V3 for Chrome/Firefox
{
  "manifest_version": 3,
  "name": "Harvous Capture",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }],
  "action": {
    "default_popup": "popup.html"
  }
}
```

#### Content Script Features
- **Text selection detection** for scripture references
- **Bible website integration** (YouVersion, Bible Gateway, etc.)
- **Auto-formatting** for captured scripture
- **Context preservation** (URL, timestamp, source)

### 2. Bible Website Integration

#### Supported Bible Websites
- **YouVersion.com** - Popular Bible app website
- **BibleGateway.com** - Multiple translations
- **BlueLetterBible.org** - Study tools and commentaries
- **Bible.com** - Cross-references and study notes
- **ESV.org** - English Standard Version

#### Scripture Detection & Formatting
```typescript
interface ScriptureCapture {
  reference: string;        // "John 3:16"
  text: string;            // Full verse text
  translation: string;     // "ESV", "NIV", "KJV"
  context: {
    website: string;       // "biblegateway.com"
    url: string;          // Full URL
    timestamp: Date;
  };
  formatting: {
    isScripture: true;
    highlightColor: string;
    fontStyle: 'scripture';
  };
}
```

### 3. Web-Based Bible Reader Integration

#### Built-in Bible Reader Features
- **Multiple translations** (ESV, NIV, KJV, NASB, etc.)
- **Verse highlighting** and note-taking
- **Cross-reference linking**
- **Commentary integration**
- **Reading plans** and study guides

#### API Integration
```typescript
// Bible API integration
interface BibleAPI {
  youVersion: {
    apiKey: string;
    baseUrl: 'https://api.youversion.com/v1';
    endpoints: {
      getVerse: '/bible/verses';
      getChapter: '/bible/chapters';
      getBook: '/bible/books';
    };
  };
  bibleGateway: {
    baseUrl: 'https://www.biblegateway.com';
    translations: string[];
  };
}
```

### 4. Enhanced Capture Features

#### Smart Content Processing
- **AI-powered categorization** of captured content
- **Automatic tagging** based on content analysis
- **Scripture reference detection** and linking
- **Duplicate detection** and merging
- **Source attribution** and metadata preservation

#### Content Types Supported
- **Text selections** from any website
- **Images** with automatic OCR for text extraction
- **PDFs** with text extraction
- **Audio recordings** (via browser microphone)
- **Screenshots** with annotation tools

### 5. Browser Extension UI Components

#### Popup Interface
```html
<!-- Extension popup -->
<div class="harvous-capture-popup">
  <div class="capture-header">
    <h3>Capture to Harvous</h3>
  </div>
  
  <div class="content-preview">
    <div class="selected-text">{{selectedText}}</div>
    <div class="source-info">{{sourceUrl}}</div>
  </div>
  
  <div class="capture-options">
    <select class="space-selector">
      <option>Select Space...</option>
      <option>Bible Study</option>
      <option>Prayer Journal</option>
    </select>
    
    <select class="thread-selector">
      <option>Select Thread...</option>
      <option>Gospel of John</option>
      <option>Psalm 23 Study</option>
    </select>
  </div>
  
  <div class="scripture-detection" x-show="isScripture">
    <div class="scripture-formatting">
      <label>Format as Scripture</label>
      <input type="checkbox" checked>
    </div>
  </div>
  
  <button class="capture-button" @click="captureContent">
    Save to Harvous
  </button>
</div>
```

### 6. Advanced Web Features

#### Browser-Based Bible Study Tools
- **Parallel Bible reading** with multiple translations
- **Cross-reference explorer** with related verses
- **Commentary integration** from various sources
- **Study note templates** for different Bible study methods
- **Group study features** with shared notes and highlights

#### Web App Enhancements
- **Progressive Web App (PWA)** capabilities
- **Offline functionality** for captured content
- **Keyboard shortcuts** for quick capture
- **Drag-and-drop** content organization
- **Advanced search** with filters and tags

## Database Schema Extensions

### New Tables for Capture System
```sql
-- Captured content tracking
CREATE TABLE CapturedContent (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  sourceType TEXT NOT NULL, -- 'browser_extension', 'web_capture', 'bible_app'
  originalContent TEXT,
  processedContent TEXT,
  metadata JSON,
  createdAt DATETIME,
  FOREIGN KEY (userId) REFERENCES Users(id)
);

-- Scripture references
CREATE TABLE ScriptureReferences (
  id TEXT PRIMARY KEY,
  noteId TEXT,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  translation TEXT,
  FOREIGN KEY (noteId) REFERENCES Notes(id)
);

-- Capture sources
CREATE TABLE CaptureSources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  type TEXT NOT NULL, -- 'bible_website', 'general_website', 'extension'
  isActive BOOLEAN DEFAULT TRUE
);
```

## API Endpoints

### New Capture Endpoints
```typescript
// Capture API endpoints
POST /api/capture/browser-extension
POST /api/capture/web-content
POST /api/capture/process-scripture
POST /api/capture/detect-scripture
GET /api/capture/sources
GET /api/capture/history
```

### Scripture Processing
```typescript
// Scripture detection and formatting
interface ScriptureProcessor {
  detectScripture(text: string): ScriptureReference[];
  formatScripture(reference: ScriptureReference): FormattedScripture;
  getTranslation(version: string): Promise<BibleTranslation>;
  crossReference(verse: string): Promise<CrossReference[]>;
}
```

## Implementation Timeline

### Phase 1: Browser Extension (Weeks 1-4)
- Chrome extension development
- Basic content capture functionality
- Integration with existing Harvous API
- Scripture detection and formatting

### Phase 2: Cross-Browser Support (Weeks 5-6)
- Firefox extension
- Safari Web Extension
- Edge extension
- Cross-browser testing and optimization

### Phase 3: Bible Website Integration (Weeks 7-10)
- YouVersion.com integration
- BibleGateway.com integration
- BlueLetterBible.org integration
- Advanced scripture detection

### Phase 4: Enhanced Features (Weeks 11-14)
- AI-powered content categorization
- Advanced formatting options
- Bulk capture capabilities
- Export/import functionality

### Phase 5: Bible Reader Integration (Weeks 15-18)
- Built-in Bible reader
- Multiple translation support
- Cross-reference linking
- Study tools and commentary

## Technical Architecture

### Extension Structure
```
harvous-extension/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
├── background.js
├── options.html
└── styles/
    ├── popup.css
    └── content.css
```

### API Integration
```typescript
// Extension to Harvous API communication
class HarvousCapture {
  async captureContent(content: CaptureContent) {
    const response = await fetch('https://harvous.app/api/capture', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    });
    return response.json();
  }
  
  async detectScripture(text: string) {
    // Scripture reference detection
    const scripturePattern = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+/gi;
    return scripturePattern.test(text);
  }
}
```

## Key Advantages of Web-Only Approach

### Development Benefits
- **Single codebase** for all platforms
- **Faster development** cycle
- **Easier maintenance** and updates
- **No app store approval** process
- **Immediate deployment** capabilities

### User Benefits
- **Cross-platform consistency**
- **No installation required** (browser extension only)
- **Automatic updates** via browser
- **Familiar web interface**
- **Easy sharing** and collaboration

### Technical Benefits
- **Leverage existing web technologies**
- **Rich browser APIs** for content capture
- **Easy integration** with Bible websites
- **Flexible deployment** options
- **Scalable architecture**

## Security & Privacy Considerations

### Data Protection
- **End-to-end encryption** for captured content
- **User consent** for data sharing between apps
- **GDPR compliance** for international users
- **Secure API authentication** with Bible app partners

### Performance
- **Offline capture** capability for mobile
- **Background sync** for captured content
- **Efficient storage** for large content (images, PDFs)
- **Caching strategy** for frequently accessed content

### User Experience
- **Seamless integration** with existing Harvous workflow
- **Intuitive organization** suggestions
- **Quick access** to captured content
- **Cross-device consistency**

## Next Steps

1. **Prototype Development**: Start with a basic Chrome extension
2. **API Integration**: Connect extension to existing Harvous API
3. **Scripture Detection**: Implement basic scripture reference detection
4. **Bible Website Integration**: Begin with YouVersion.com integration
5. **User Testing**: Gather feedback on capture workflow
6. **Feature Enhancement**: Add advanced formatting and organization features

## Conclusion

This web-only capture system provides 80% of the functionality of a full mobile app with significantly less development time and complexity. The browser extension becomes the "capture mechanism" while the existing Harvous web app becomes the "organization and study platform."

The system is designed to be:
- **User-friendly** with intuitive capture workflows
- **Bible-focused** with specialized scripture handling
- **Scalable** for future feature additions
- **Maintainable** with clean architecture and documentation
