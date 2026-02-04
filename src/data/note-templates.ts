/**
 * Note Templates Data
 *
 * Built-in study method templates for Harvous.
 * These templates provide pre-filled content structures for common Bible study methods.
 */

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  estimatedMinutes: string;  // e.g., "15–20 min"
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner–Intermediate' | 'Intermediate–Advanced';
  titleTemplate: string;     // e.g., "SOAP Study - {date}" or just ""
  content: string;           // HTML for TiptapEditor
  noteType: 'default' | 'scripture' | 'resource';
}

export const BUILT_IN_TEMPLATES: NoteTemplate[] = [
  {
    id: 'soap',
    name: 'SOAP',
    description: 'Scripture, Observation, Application, Prayer',
    estimatedMinutes: '15–20 min',
    level: 'Beginner',
    titleTemplate: '',  // User will fill in
    content: `<h2>📖 Scripture</h2><p>Write or paste the scripture passage here.</p><p><br></p><h2>👁️ Observation</h2><p>What do you notice about this passage? Key words, themes, context?</p><p><br></p><h2>✨ Application</h2><p>How does this apply to your life today?</p><p><br></p><h2>🙏 Prayer</h2><p>Turn your study into prayer.</p>`,
    noteType: 'default'
  },
  {
    id: 'inductive',
    name: 'Inductive Study',
    description: 'Observation → Interpretation → Application',
    estimatedMinutes: '45–90 min',
    level: 'Intermediate',
    titleTemplate: '',
    content: `<h2>1. Observation</h2><p>What does the passage say? Facts, details, context.</p><p><br></p><h2>2. Interpretation</h2><p>What does the passage mean? Original context, cultural background, author's intent.</p><p><br></p><h2>3. Application</h2><p>How should I respond? Personal application, action steps.</p>`,
    noteType: 'default'
  },
  {
    id: 'bible-nerd',
    name: 'Bible Nerd Method',
    description: 'Faith\'s 5-step process: context, translations, dictionaries, commentaries',
    estimatedMinutes: '60–120 min',
    level: 'Intermediate–Advanced',
    titleTemplate: '',
    content: `<h2>1. Context</h2><p>Historical and literary context of the passage.</p><p><br></p><h2>2. Translations</h2><p>Compare different Bible translations.</p><p><br></p><h2>3. Dictionary</h2><p>Word studies and definitions.</p><p><br></p><h2>4. Commentaries</h2><p>What do scholars say?</p><p><br></p><h2>5. Synthesis</h2><p>Bring it all together.</p>`,
    noteType: 'default'
  },
  {
    id: 'topical',
    name: 'Topical Study',
    description: 'Study themes across the whole Bible',
    estimatedMinutes: '20–60 min',
    level: 'Beginner–Intermediate',
    titleTemplate: '',
    content: `<h2>Topic</h2><p>[Your topic or theme]</p><p><br></p><h2>Key Verses</h2><p>List relevant verses from across Scripture.</p><p><br></p><h2>Insights</h2><p>What patterns or themes emerge?</p><p><br></p><h2>Application</h2><p>How does this theme apply today?</p>`,
    noteType: 'default'
  },
  {
    id: 'chapter-summary',
    name: 'Chapter Summary',
    description: 'Quick summaries for reading retention',
    estimatedMinutes: '10–15 min',
    level: 'Beginner',
    titleTemplate: '',
    content: `<h2>Chapter Overview</h2><p>Main theme or message of this chapter.</p><p><br></p><h2>Key Points</h2><p>• Point 1</p><p>• Point 2</p><p>• Point 3</p><p><br></p><h2>Notable Verses</h2><p>Verses that stood out.</p><p><br></p><h2>Questions</h2><p>Questions for further study.</p>`,
    noteType: 'default'
  },
  {
    id: 'comparative',
    name: 'Comparative Study',
    description: 'Side-by-side analysis of translations, parallel passages, authors',
    estimatedMinutes: '20–60 min',
    level: 'Intermediate',
    titleTemplate: '',
    content: `<h2>Comparison Focus</h2><p>[What are you comparing? Translations, parallel passages, etc.]</p><p><br></p><h2>Version A</h2><p>Observations and notes.</p><p><br></p><h2>Version B</h2><p>Observations and notes.</p><p><br></p><h2>Key Differences</h2><p>What stands out in comparison?</p><p><br></p><h2>Insights</h2><p>What do the differences reveal?</p>`,
    noteType: 'default'
  }
];

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): NoteTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all built-in templates
 */
export function getBuiltInTemplates(): NoteTemplate[] {
  return BUILT_IN_TEMPLATES;
}
