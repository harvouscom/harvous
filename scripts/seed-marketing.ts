/**
 * Marketing Seed Script
 * 
 * Creates realistic Bible study content for marketing screenshots.
 * Generates spaces, threads, notes (default and scripture), and tags.
 * 
 * Usage: npx tsx scripts/seed-marketing.ts
 */

import { db, Spaces, Threads, Notes, NoteThreads, Tags, NoteTags, ScriptureMetadata, UserMetadata } from 'astro:db';
import { eq, and } from 'astro:db';
import { generateSpaceId, generateThreadId, generateNoteId } from '../src/utils/ids.ts';
import { parseScriptureReference, normalizeScriptureReference } from '../src/utils/scripture-detector';
import { fetchWithTimeout } from '../src/utils/fetch-helpers.js';
import { processScriptureReferences } from '../src/utils/process-scripture-references';

const USER_ID = 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';

interface BibleOrgVerse {
  bookname: string;
  chapter: string;
  verse: string;
  text: string;
}

/**
 * Fetch verse text from Bible.org API
 */
async function fetchVerseText(reference: string): Promise<string> {
  try {
    const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
    const response = await fetchWithTimeout(apiUrl, {
      timeout: 10000,
      retries: 2,
      retryTimeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`Bible.org API error: ${response.status} ${response.statusText}`);
    }

    const verses = await response.json() as BibleOrgVerse[];
    if (!verses || verses.length === 0) {
      throw new Error('No verses found');
    }

    // Format with superscript verse numbers
    const verseText = verses.map(v => `<sup>${v.verse}</sup>${v.text}`).join(' ');
    // Capitalize first letter
    return verseText.charAt(0).toUpperCase() + verseText.slice(1);
  } catch (error: any) {
    console.warn(`⚠️  Could not fetch verse for ${reference}: ${error.message}`);
    // Return fallback content
    return reference;
  }
}

/**
 * Get or create user metadata
 */
async function ensureUserMetadata(): Promise<{ highestSimpleNoteId: number }> {
  const existing = await db.select()
    .from(UserMetadata)
    .where(eq(UserMetadata.userId, USER_ID))
    .get();

  if (existing) {
    return { highestSimpleNoteId: existing.highestSimpleNoteId || 0 };
  }

  await db.insert(UserMetadata).values({
    id: `usermeta_${Date.now()}`,
    userId: USER_ID,
    highestSimpleNoteId: 0,
    userColor: 'paper',
    createdAt: new Date(),
  });

  return { highestSimpleNoteId: 0 };
}

/**
 * Create a scripture note with proper metadata
 */
async function createScriptureNote(
  reference: string,
  threadId: string,
  spaceId: string | null,
  simpleNoteId: number,
  createdAt: Date
): Promise<string> {
  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    throw new Error(`Invalid scripture reference: ${reference}`);
  }

  const verseText = await fetchVerseText(reference);
  const normalizedRef = normalizeScriptureReference(reference);
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

  const noteId = generateNoteId();
  
  // Generate varied lastVisited dates for scripture notes
  // Mix of recent, moderate, and old visits, with some never visited
  const visitPatterns: Array<'recent' | 'moderate' | 'old' | 'never'> = ['recent', 'moderate', 'recent', 'old', 'recent', 'moderate', 'never', 'recent'];
  const patternIndex = Math.floor(Math.random() * visitPatterns.length);
  const visitPattern = visitPatterns[patternIndex];
  const lastVisited = generateLastVisitedDate(createdAt, visitPattern);
  
  await db.insert(Notes).values({
    id: noteId,
    title: reference,
    content: verseText,
    threadId,
    spaceId,
    simpleNoteId,
    noteType: 'scripture',
    addedBy: 'user',
    userId: USER_ID,
    createdAt,
    lastVisited,
    isPublic: false,
    isFeatured: false,
  });

  await db.insert(ScriptureMetadata).values({
    id: `scripture_${noteId}_${Date.now()}`,
    noteId,
    reference: normalizedRef,
    book: parsed.book,
    chapter: parsed.chapter,
    verse: verseStart,
    verseEnd: verseEnd || null,
    translation: 'NET',
    originalText: verseText,
    createdAt,
  });

  return noteId;
}

/**
 * Create a default note
 */
async function createDefaultNote(
  title: string,
  content: string,
  threadId: string,
  spaceId: string | null,
  simpleNoteId: number,
  createdAt: Date,
  isFeatured: boolean = false
): Promise<string> {
  const noteId = generateNoteId();
  
  // Generate varied lastVisited dates for default notes
  // Mix of recent, moderate, old, and never visited
  const visitPatterns: Array<'recent' | 'moderate' | 'old' | 'never'> = ['recent', 'recent', 'moderate', 'old', 'recent', 'moderate', 'never', 'recent', 'moderate', 'old'];
  const patternIndex = Math.floor(Math.random() * visitPatterns.length);
  const visitPattern = visitPatterns[patternIndex];
  const lastVisited = generateLastVisitedDate(createdAt, visitPattern);
  
  await db.insert(Notes).values({
    id: noteId,
    title,
    content,
    threadId,
    spaceId,
    simpleNoteId,
    noteType: 'default',
    addedBy: 'user',
    userId: USER_ID,
    createdAt,
    lastVisited,
    isPublic: false,
    isFeatured,
  });
  return noteId;
}

/**
 * Create a tag
 */
async function getOrCreateTag(name: string, color: string, category: string): Promise<string> {
  const existing = await db.select()
    .from(Tags)
    .where(and(eq(Tags.name, name), eq(Tags.userId, USER_ID)))
    .get();

  if (existing) {
    return existing.id;
  }

  const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(Tags).values({
    id: tagId,
    name,
    color,
    category,
    userId: USER_ID,
    isSystem: false,
    createdAt: new Date(),
  });

  return tagId;
}

/**
 * Tag a note
 */
async function tagNote(noteId: string, tagId: string): Promise<void> {
  const existing = await db.select()
    .from(NoteTags)
    .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)))
    .get();

  if (!existing) {
    await db.insert(NoteTags).values({
      id: `notetag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      noteId,
      tagId,
      isAutoGenerated: false,
      createdAt: new Date(),
    });
  }
}

/**
 * Link a note to a thread via junction table
 */
async function linkNoteToThread(noteId: string, threadId: string): Promise<void> {
  const existing = await db.select()
    .from(NoteThreads)
    .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, threadId)))
    .get();

  if (!existing) {
    await db.insert(NoteThreads).values({
      id: `notethread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      noteId,
      threadId,
      createdAt: new Date(),
    });
  }
}

/**
 * Generate dates spread over 2-3 weeks
 * Includes Sunday dates for sermon notes
 */
function generateDate(daysAgo: number): Date {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const baseDate = new Date(now - (daysAgo * msPerDay));
  return baseDate;
}

/**
 * Generate a date for a Sunday (for sermon notes)
 * Returns the most recent Sunday before or on the specified daysAgo
 */
function generateSundayDate(daysAgo: number): Date {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const baseDate = new Date(now - (daysAgo * msPerDay));
  const dayOfWeek = baseDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToSubtract = dayOfWeek; // How many days to go back to get to Sunday
  const sundayDate = new Date(baseDate.getTime() - (daysToSubtract * msPerDay));
  // Set to Sunday morning (10:00 AM for typical service time)
  sundayDate.setHours(10, 30, 0, 0);
  return sundayDate;
}

/**
 * Generate a varied lastVisited date based on creation date and visit pattern
 * Creates believable variation in when items were last accessed
 */
function generateLastVisitedDate(createdAt: Date, visitPattern: 'recent' | 'moderate' | 'old' | 'never'): Date | null {
  if (visitPattern === 'never') {
    return null; // Not visited yet
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const createdTime = createdAt.getTime();
  const now = Date.now();
  
  let daysAfterCreation: number;
  
  switch (visitPattern) {
    case 'recent':
      // Visited 0-2 days after creation, but not in the future
      daysAfterCreation = Math.floor(Math.random() * 3); // 0, 1, or 2
      break;
    case 'moderate':
      // Visited 3-7 days after creation
      daysAfterCreation = 3 + Math.floor(Math.random() * 5); // 3-7
      break;
    case 'old':
      // Visited 8-14 days after creation
      daysAfterCreation = 8 + Math.floor(Math.random() * 7); // 8-14
      break;
  }
  
  const visitTime = createdTime + (daysAfterCreation * msPerDay);
  
  // Don't return a date in the future - cap at now
  const lastVisited = Math.min(visitTime, now);
  
  return new Date(lastVisited);
}

async function seedMarketing() {
  try {
    console.log('🌱 Starting marketing seed...');
    console.log(`📝 User ID: ${USER_ID}`);

    // Ensure user metadata exists
    const userMeta = await ensureUserMetadata();
    let nextSimpleNoteId = userMeta.highestSimpleNoteId + 1;

    // Create spaces
    console.log('\n📁 Creating spaces...');
    const spaces = [
      {
        id: generateSpaceId(),
        title: 'Gospel Studies',
        description: 'Deep dive into the four gospels',
        color: 'blue',
        order: 1,
      },
      {
        id: generateSpaceId(),
        title: 'Old Testament Wisdom',
        description: 'Psalms, Proverbs, and wisdom literature',
        color: 'purple',
        order: 2,
      },
      {
        id: generateSpaceId(),
        title: "Paul's Letters",
        description: 'Study of Pauline epistles',
        color: 'yellow',
        order: 3,
      },
      {
        id: generateSpaceId(),
        title: 'Daily Devotionals',
        description: 'Personal reflection and prayer notes',
        color: 'green',
        order: 4,
      },
      {
        id: generateSpaceId(),
        title: 'Small Group Prep',
        description: 'Preparation notes for leading Bible study',
        color: 'pink',
        order: 5,
      },
    ];

    for (const spaceData of spaces) {
      const existing = await db.select()
        .from(Spaces)
        .where(and(eq(Spaces.id, spaceData.id), eq(Spaces.userId, USER_ID)))
        .get();

      if (!existing) {
        await db.insert(Spaces).values({
          ...spaceData,
          userId: USER_ID,
          isPublic: false,
          isActive: true,
          createdAt: generateDate(20),
          updatedAt: generateDate(5),
        });
        console.log(`  ✅ Created space: ${spaceData.title}`);
      } else {
        console.log(`  ⏭️  Space already exists: ${spaceData.title}`);
      }
    }

    // Create threads (fewer threads, more notes per thread)
    // Use varied colors across threads for visual diversity
    console.log('\n🧵 Creating threads...');
    const threads = [
      // Gospel Studies
      { spaceId: spaces[0].id, title: 'Gospel of John', subtitle: 'In-depth study of John\'s gospel', color: 'blue', isPinned: true, order: 1 },
      
      // Old Testament Wisdom
      { spaceId: spaces[1].id, title: 'Psalm 23 Study', subtitle: 'Exploring God\'s care and provision', color: 'purple', isPinned: true, order: 1 },
      
      // Paul's Letters
      { spaceId: spaces[2].id, title: 'Romans Study', subtitle: 'Paul\'s letter to the Romans', color: 'yellow', isPinned: true, order: 1 },
      
      // Daily Devotionals
      { spaceId: spaces[3].id, title: 'Morning Reflections', subtitle: 'Daily quiet time notes', color: 'green', isPinned: true, order: 1 },
      
      // Small Group Prep
      { spaceId: spaces[4].id, title: 'This Week\'s Study', subtitle: 'Current small group preparation', color: 'pink', isPinned: true, order: 1 },
    ];

    const createdThreads: Array<{ id: string; spaceId: string; title: string }> = [];
    const visitPatterns: Array<'recent' | 'moderate' | 'old'> = ['recent', 'recent', 'moderate', 'recent', 'old'];
    for (let i = 0; i < threads.length; i++) {
      const threadData = threads[i];
      const threadId = generateThreadId();
      const existing = await db.select()
        .from(Threads)
        .where(and(eq(Threads.title, threadData.title), eq(Threads.userId, USER_ID)))
        .get();

      if (!existing) {
        const createdAt = generateDate(15);
        const visitPattern = visitPatterns[i % visitPatterns.length];
        const lastVisited = generateLastVisitedDate(createdAt, visitPattern);
        
        await db.insert(Threads).values({
          id: threadId,
          title: threadData.title,
          subtitle: threadData.subtitle,
          spaceId: threadData.spaceId,
          color: threadData.color, // Explicitly set color
          isPinned: threadData.isPinned,
          order: threadData.order,
          userId: USER_ID,
          isPublic: false,
          createdAt,
          updatedAt: generateDate(3),
          lastVisited,
        });
        createdThreads.push({ id: threadId, spaceId: threadData.spaceId, title: threadData.title });
        console.log(`  ✅ Created thread: ${threadData.title} (color: ${threadData.color || 'default'})`);
      } else {
        // Always update existing thread with the specified color to ensure it's set
        if (threadData.color && existing.color !== threadData.color) {
          await db.update(Threads)
            .set({ 
              color: threadData.color,
              updatedAt: new Date()
            })
            .where(eq(Threads.id, existing.id));
          console.log(`  🔄 Updated thread color: ${threadData.title} -> ${threadData.color}`);
        } else if (!existing.color && threadData.color) {
          await db.update(Threads)
            .set({ 
              color: threadData.color,
              updatedAt: new Date()
            })
            .where(eq(Threads.id, existing.id));
          console.log(`  🔄 Set thread color: ${threadData.title} -> ${threadData.color}`);
        }
        createdThreads.push({ id: existing.id, spaceId: threadData.spaceId, title: threadData.title });
        console.log(`  ⏭️  Thread already exists: ${threadData.title} (current color: ${existing.color || 'none'})`);
      }
    }

    // Create tags
    console.log('\n🏷️  Creating tags...');
    const tagData = [
      { name: 'Prayer', color: 'peaceful-green', category: 'spiritual' },
      { name: 'Faith', color: 'blessed-blue', category: 'spiritual' },
      { name: 'Love', color: 'warm-coral', category: 'spiritual' },
      { name: 'Forgiveness', color: 'lovely-lavender', category: 'character' },
      { name: 'Grace', color: 'sunny-yellow', category: 'spiritual' },
      { name: 'John', color: 'blessed-blue', category: 'biblical' },
      { name: 'Romans', color: 'sunny-yellow', category: 'biblical' },
      { name: 'Psalms', color: 'lovely-lavender', category: 'biblical' },
      { name: 'Wisdom', color: 'peaceful-green', category: 'spiritual' },
      { name: 'Application', color: 'warm-coral', category: 'spiritual' },
    ];

    const createdTags: Record<string, string> = {};
    for (const tag of tagData) {
      const tagId = await getOrCreateTag(tag.name, tag.color, tag.category);
      createdTags[tag.name] = tagId;
      console.log(`  ✅ Tag: ${tag.name}`);
    }

    // Create notes
    console.log('\n📝 Creating notes...');

    // Scripture notes (fewer total, but more in multiple threads)
    const scriptureReferences = [
      'John 3:16',
      'Romans 8:1',
      'Romans 8:28',
      'Psalm 23:1',
      'Psalm 23:4',
      'Ephesians 2:8-10',
      'Matthew 5:3-12',
      'Matthew 28:18-20',
      '1 Corinthians 13:4-7',
      'Philippians 4:6-7',
      'Philippians 4:13',
      'Proverbs 3:5-6',
      'Lamentations 3:22-23',
      'Romans 9:15-16',
    ];

    const scriptureNotes: Array<{ noteId: string; threadId: string; spaceId: string; tags: string[] }> = [];
    for (let i = 0; i < scriptureReferences.length; i++) {
      const ref = scriptureReferences[i];
      const thread = createdThreads[i % createdThreads.length];
      // Vary dates - some on Sundays, some on weekdays
      const daysAgo = 14 - i;
      const isSundayNote = i % 3 === 0; // Every 3rd scripture note is from a Sunday
      const noteDate = isSundayNote ? generateSundayDate(daysAgo) : generateDate(daysAgo);
      
      const noteId = await createScriptureNote(
        ref,
        thread.id,
        thread.spaceId,
        nextSimpleNoteId++,
        noteDate
      );
      scriptureNotes.push({
        noteId,
        threadId: thread.id,
        spaceId: thread.spaceId,
        tags: [],
      });
      const dateNote = isSundayNote ? ' (Sunday)' : '';
      console.log(`  ✅ Created scripture note: ${ref}${dateNote}`);
      
      // Small delay to avoid rate limiting
      if (i < scriptureReferences.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Default notes (fewer total, but more in multiple threads)
    const defaultNotes = [
      {
        title: 'Sovereignty and Responsibility',
        content: 'There\'s a fascinating tension between God\'s sovereignty and human responsibility in these chapters. Paul addresses the question of Israel\'s rejection and God\'s faithfulness. Romans 9:15-16 says "I will have mercy on whom I have mercy" - God\'s sovereignty. But Romans 10:13 says "Everyone who calls on the name of the Lord will be saved" - human responsibility. The mystery of election and the call to faith creates a tension that requires both theological precision and humble acceptance of mystery.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Romans', 'Faith', 'Application'],
        isFeatured: true,
        daysAgo: 12,
      },
      {
        title: 'Rest in Overstimulation',
        content: 'Reading Psalm 23 in the context of modern anxiety disorders. Psalm 23:1-2 says "The Lord is my shepherd, I shall not want. He makes me lie down in green pastures, he leads me beside quiet waters." The imagery speaks to the need for rest in our overstimulated world. Psalm 23:4 says "Even though I walk through the darkest valley" - this acknowledges real suffering while the promise of God\'s presence offers genuine comfort.',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Psalms', 'Prayer', 'Application'],
        isFeatured: false,
        daysAgo: 11,
      },
      {
        title: 'Comparing the Beatitudes',
        content: 'Matthew 5:3-12 vs Luke 6:20-26. Matthew includes "poor in spirit" while Luke says simply "poor." Matthew has "hunger and thirst for righteousness" while Luke has "hunger now." The differences reflect each gospel\'s emphasis - Matthew on spiritual condition, Luke on physical/material reality.',
        thread: createdThreads[0], // Gospel of John (index 0)
        tags: ['John', 'Wisdom', 'Application'],
        isFeatured: false,
        daysAgo: 10,
      },
      {
        title: 'Paul\'s Use of "In Christ"',
        content: 'Throughout Ephesians, Paul uses the phrase "in Christ" or "in him" repeatedly. Ephesians 1:3 says "in Christ" - blessed with every spiritual blessing. Ephesians 1:4 says "in him" - chosen before creation. Ephesians 2:6 says "in Christ Jesus" - seated with him in heavenly places. This isn\'t just theological language - it\'s describing a real union with Christ. Our identity, our inheritance, our purpose all flow from being "in Christ." This changes how I think about my daily life and decisions.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Romans', 'Faith', 'Application'],
        isFeatured: true,
        daysAgo: 9,
      },
      {
        title: 'The Good Shepherd Metaphor',
        content: 'Jesus calls himself the good shepherd in John 10:11-14. "I am the good shepherd. The good shepherd lays down his life for the sheep." This connects to Psalm 23:1 and Ezekiel 34. The contrast with hired hands who abandon the sheep (John 10:12-13) shows the depth of Jesus\' commitment. John 10:14 says "I know my sheep and my sheep know me" - personal, intimate relationship.',
        thread: createdThreads[0], // Gospel of John (index 0)
        tags: ['John', 'Faith', 'Application'],
        isFeatured: false,
        daysAgo: 8,
      },
      {
        title: 'All Things Work Together',
        content: 'Studying Romans 8:28 - "And we know that in all things God works for the good of those who love him." The phrase "all things" is pretty broad. Does this mean every single thing that happens is good? Or that God works good out of all things? The context matters - Romans 8:29-30 talks about being conformed to Christ\'s image. Maybe the "good" is our transformation, not necessarily our comfort. Need to think more about how this applies when things are genuinely hard.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Romans', 'Application'],
        isFeatured: false,
        daysAgo: 7,
      },
      {
        title: 'Questions for Small Group',
        content: 'Romans 8:28-30 discussion questions:\n1. How does Romans 8:28 apply when we\'re in the middle of suffering?\n2. What does "all things" actually mean in context?\n3. Romans 8:29 says "predestined to be conformed to the image of his Son" - how does this relate to suffering?\n4. How do we balance this promise with the reality of pain?\n5. What role does our response play in God\'s working?',
        thread: createdThreads[4], // This Week's Study (index 4)
        tags: ['Romans', 'Application'],
        isFeatured: false,
        daysAgo: 6,
      },
      {
        title: 'Proverbs on Work and Rest',
        content: 'Proverbs has a lot to say about diligence and hard work, but also about wisdom in rest. The ant works hard (6:6-11) but wisdom also knows when to rest. How do we balance these in modern work culture?',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Wisdom', 'Application'],
        isFeatured: false,
        daysAgo: 5,
      },
      {
        title: 'Ecclesiastes and the Meaning of Work',
        content: 'Ecclesiastes is brutally honest about the futility of work "under the sun." Yet there\'s also a call to enjoy work as a gift from God. The tension between meaninglessness and finding joy in daily labor is relevant for modern work struggles.',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Wisdom', 'Application'],
        isFeatured: false,
        daysAgo: 4,
      },
      {
        title: 'New Every Morning',
        content: 'Reading Lamentations 3:22-23. "Because of the Lord\'s great love we are not consumed, for his compassions never fail. They are new every morning; great is your faithfulness." What\'s striking is this comes in the middle of Lamentations - a book about deep suffering and loss. Yet there\'s this declaration of God\'s faithfulness. Lamentations 3:24 says "The Lord is my portion" - it\'s not denying the pain, but anchoring hope in God\'s character even when circumstances are terrible. The contrast is powerful.',
        thread: createdThreads[3], // Morning Reflections (index 3)
        tags: ['Faith', 'Application'],
        isFeatured: false,
        daysAgo: 3,
      },
      {
        title: '1 Corinthians 13 in Context',
        content: 'This "love chapter" comes in the middle of Paul addressing spiritual gifts and church unity. It\'s not just a wedding reading - it\'s a corrective to how the Corinthians were using (and misusing) their gifts. Love is the better way, the more excellent way.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Romans', 'Love', 'Application'],
        isFeatured: false,
        daysAgo: 2,
      },
      {
        title: 'Preparing for This Week\'s Study',
        content: 'Focusing on Romans 8:28-39. Key points:\n- The promise is for those who love God\n- "All things" includes suffering\n- The purpose is conformity to Christ\n- Nothing can separate us from God\'s love\n\nNeed to prepare discussion questions that help people engage without oversimplifying.',
        thread: createdThreads[4], // This Week's Study (index 4)
        tags: ['Romans', 'Application'],
        isFeatured: false,
        daysAgo: 1,
      },
      {
        title: 'The Parable of the Sower',
        content: 'Jesus explains this parable in Matthew 13. The different soils represent different responses to the word. But what strikes me is that the sower sows generously - the word goes to all kinds of soil. God\'s word is available, but the response matters.',
        thread: createdThreads[0], // Gospel of John (index 0)
        tags: ['John', 'Faith', 'Application'],
        isFeatured: false,
        daysAgo: 13,
      },
      {
        title: 'Grace vs Works in Ephesians 2',
        content: 'Ephesians 2:8-10 is so clear: "For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast." But then Ephesians 2:10 says "For we are God\'s handiwork, created in Christ Jesus to do good works, which God prepared in advance for us to do." So works don\'t save, but saved people do good works. The order matters - grace first, then works flow from that.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Romans', 'Grace', 'Application'],
        isFeatured: false,
        daysAgo: 15,
      },
      {
        title: 'Lean Not on Your Own Understanding',
        content: 'Proverbs 3:5-6 says "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight." The phrase "lean not on your own understanding" is interesting - it\'s not saying don\'t think, but don\'t rely solely on your own perspective. There\'s a difference between using wisdom and trusting only in what you can figure out. James 1:5 also talks about asking God for wisdom. The combination is trusting God while also seeking wisdom from him.',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Wisdom', 'Application'],
        isFeatured: false,
        daysAgo: 2,
      },
      {
        title: 'John\'s Prologue and Creation',
        content: 'John 1:1-18 connects Jesus to the creation account in Genesis. "In the beginning" echoes Genesis 1:1. The Word was with God and was God. The Word became flesh. This is the ultimate revelation - God making himself known in the most tangible way.',
        thread: createdThreads[0], // Gospel of John (index 0)
        tags: ['John', 'Faith'],
        isFeatured: false,
        daysAgo: 16,
      },
      {
        title: 'The Lord\'s Prayer Structure',
        content: 'Matthew 6:9-13. The prayer starts with God\'s name, kingdom, and will - God-focused. Then moves to our needs - daily bread, forgiveness, deliverance. The structure itself teaches us to prioritize God\'s concerns before our own.',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Prayer', 'Application'],
        isFeatured: false,
        daysAgo: 14,
      },
      {
        title: 'Small Group Discussion Notes',
        content: 'Last week we discussed Romans 8:1-17. Key points:\n- No condemnation for those in Christ\n- The Spirit vs the flesh\n- We\'re children of God, not slaves\n- Suffering and glory are connected\n\nThis week moving to 8:18-39, focusing on hope in suffering.',
        thread: createdThreads[4], // This Week's Study (index 4)
        tags: ['Romans', 'Application'],
        isFeatured: false,
        daysAgo: 0,
      },
      {
        title: 'The Prodigal Son: Both Brothers',
        content: 'Luke 15:11-32. Usually focus on the younger son, but the older brother is just as lost. He\'s working for the father, not with the father. Both need grace. The father runs to both - to the younger in his return, to the older in his self-righteousness.',
        thread: createdThreads[0], // Gospel of John (index 0)
        tags: ['Faith', 'Grace', 'Application'],
        isFeatured: false,
        daysAgo: 17,
      },
      {
        title: 'Do Not Be Anxious',
        content: 'Philippians 4:6-7 says "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus." The connection between thanksgiving and peace is interesting. It\'s not just asking for things - it\'s presenting requests with thanksgiving. Maybe gratitude changes our perspective even before the answer comes.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Faith', 'Application'],
        isFeatured: false,
        daysAgo: 1,
      },
      {
        title: 'The Fruit of the Spirit',
        content: 'Galatians 5:22-23 says "But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control." These aren\'t things we manufacture - they\'re fruit. Fruit grows naturally when the tree is healthy. Galatians 5:16 says "walk by the Spirit" - the Spirit produces these in us as we abide in Christ. Can\'t force love, joy, peace - they flow from relationship with God.',
        thread: createdThreads[2], // Romans Study (index 2)
        tags: ['Faith', 'Application'],
        isFeatured: false,
        daysAgo: 18,
      },
      {
        title: 'Wisdom vs Knowledge in Proverbs',
        content: 'Proverbs distinguishes between knowledge (knowing facts) and wisdom (applying truth). Wisdom is skill in living. It\'s not just intellectual - it\'s practical. "The fear of the Lord is the beginning of wisdom" - it starts with right relationship with God.',
        thread: createdThreads[1], // Psalm 23 Study (index 1)
        tags: ['Wisdom', 'Application'],
        isFeatured: false,
        daysAgo: 19,
      },
      {
        title: 'The Prodigal Son - Both Brothers',
        content: 'Studying Luke 15:11-32. Usually focus on the younger son, but the older brother is just as lost in a different way. He\'s working for the father, not with the father. Both need grace. The father runs to both - to the younger in his return, to the older in his self-righteousness. The older brother says "I\'ve been slaving for you" - that\'s not how you talk about a relationship with your father. He sees it as work, not love. Both sons misunderstand the father\'s heart.',
        thread: createdThreads[0], // Gospel of John
        tags: ['Faith', 'Grace', 'Application'],
        isFeatured: false,
        daysAgo: 0,
        isSunday: true,
      },
      {
        title: 'No Condemnation',
        content: 'Romans 8:1 says "Therefore, there is now no condemnation for those who are in Christ Jesus." The "therefore" connects back to chapter 7 where Paul talks about the struggle with sin. Romans 8:2-3 explains why - "because through Christ Jesus the law of the Spirit who gives life has set you free from the law of sin and death. For what the law was powerless to do because it was weakened by the flesh, God did by sending his own Son." The law couldn\'t save us, but Christ did. We\'re free from condemnation, not free to sin. Romans 8:4 says the Spirit enables us to live according to God\'s will. The difference is the Spirit\'s power, not our willpower.',
        thread: createdThreads[2], // Romans Study
        tags: ['Romans', 'Faith'],
        isFeatured: true,
        daysAgo: 7,
        isSunday: true,
      },
      {
        title: 'Walking Through the Valley',
        content: 'Psalm 23:4 says "Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me." The phrase "walk through" is important - it\'s not "get stuck in" or "live in" but "walk through." Valleys are temporary, even when they feel endless. The rod (discipline) and staff (guidance) are for our good, not punishment. Psalm 23:5-6 continues "You prepare a table before me in the presence of my enemies... Surely your goodness and love will follow me all the days of my life." God\'s presence changes everything, even in the valley.',
        thread: createdThreads[1], // Psalm 23 Study
        tags: ['Psalms', 'Application'],
        isFeatured: false,
        daysAgo: 14,
        isSunday: true,
      },
      {
        title: 'The Great Commission',
        content: 'Matthew 28:18-20. "All authority has been given to me... go and make disciples." Not just converts, but disciples. Teaching them to obey everything Jesus commanded. The word "disciple" means learner - someone who follows and learns from a teacher. Making disciples involves teaching, not just sharing. And it\'s "teaching them to obey" - not just knowing, but doing. This is our mission - not optional, but the core of following Jesus. The question is how to make disciples in everyday life, not just in formal settings.',
        thread: createdThreads[0], // Gospel of John
        tags: ['Faith', 'Application'],
        isFeatured: false,
        daysAgo: 21,
        isSunday: true,
      },
    ];

    const createdDefaultNotes: Array<{ noteId: string; threadId: string; spaceId: string; tags: string[] }> = [];
    for (const noteData of defaultNotes) {
      // Use Sunday date for sermon notes, regular date for others
      const noteDate = (noteData as any).isSunday 
        ? generateSundayDate(noteData.daysAgo)
        : generateDate(noteData.daysAgo);
      
      const noteId = await createDefaultNote(
        noteData.title,
        noteData.content,
        noteData.thread.id,
        noteData.thread.spaceId,
        nextSimpleNoteId++,
        noteDate,
        noteData.isFeatured
      );
      createdDefaultNotes.push({
        noteId,
        threadId: noteData.thread.id,
        spaceId: noteData.thread.spaceId,
        tags: noteData.tags,
      });
      console.log(`  ✅ Created note: ${noteData.title}`);
      
      // Process scripture references in the note to create pills and links
      try {
        const processResult = await processScriptureReferences(noteId, USER_ID, noteData.thread.id, noteData.content);
        if (processResult.results.length > 0) {
          // Update the note with the processed content (includes scripture pills)
          await db.update(Notes)
            .set({ content: processResult.updatedContent })
            .where(eq(Notes.id, noteId));
          console.log(`    📖 Processed ${processResult.results.length} scripture reference(s) in note`);
        }
      } catch (error: any) {
        console.warn(`    ⚠️  Could not process scripture references for note: ${error.message}`);
      }
    }

    // Link notes to threads via junction table
    // IMPORTANT: Each note is created ONCE, then linked to multiple threads via NoteThreads junction table
    // This is a key advantage of Harvous - one note can belong to multiple threads without duplication
    console.log('\n🔗 Linking notes to threads...');
    console.log('   (Each note created once, then linked to multiple threads - no duplicates!)');
    
    // First, link each note to its primary thread
    for (const note of [...scriptureNotes, ...createdDefaultNotes]) {
      await linkNoteToThread(note.noteId, note.threadId);
    }
    
    // Then, link notes to additional threads (many-to-many)
    // This demonstrates Harvous's key feature: one note instance appearing in multiple threads
    // ALL scripture notes should be in multiple threads to showcase this
    const scriptureMultiThread = [
      { noteIndex: 0, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // John 3:16 also in Romans Study and This Week's Study
      { noteIndex: 1, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Romans 8:1 also in Romans Study and This Week's Study
      { noteIndex: 2, additionalThreads: [createdThreads[4].id, createdThreads[3].id] }, // Romans 8:28 also in This Week's Study and Morning Reflections
      { noteIndex: 3, additionalThreads: [createdThreads[3].id, createdThreads[0].id] }, // Psalm 23:1 also in Morning Reflections and Gospel of John
      { noteIndex: 4, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Psalm 23:4 also in Psalm 23 Study and Morning Reflections
      { noteIndex: 5, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Ephesians 2:8-10 also in Romans Study and This Week's Study
      { noteIndex: 6, additionalThreads: [createdThreads[0].id, createdThreads[1].id] }, // Matthew 5:3-12 also in Gospel of John and Psalm 23 Study
      { noteIndex: 7, additionalThreads: [createdThreads[0].id, createdThreads[2].id] }, // Matthew 28:18-20 also in Gospel of John and Romans Study
      { noteIndex: 8, additionalThreads: [createdThreads[4].id, createdThreads[2].id] }, // 1 Corinthians 13:4-7 also in This Week's Study and Romans Study
      { noteIndex: 9, additionalThreads: [createdThreads[2].id, createdThreads[3].id] }, // Philippians 4:6-7 also in Romans Study and Morning Reflections
      { noteIndex: 10, additionalThreads: [createdThreads[3].id, createdThreads[1].id] }, // Philippians 4:13 also in Morning Reflections and Psalm 23 Study
      { noteIndex: 11, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Proverbs 3:5-6 also in Psalm 23 Study and Morning Reflections
      { noteIndex: 12, additionalThreads: [createdThreads[3].id, createdThreads[0].id] }, // Lamentations 3:22-23 also in Morning Reflections and Gospel of John
      { noteIndex: 13, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Romans 9:15-16 also in Romans Study and This Week's Study
    ];
    
    const defaultMultiThread = [
      { noteIndex: 0, additionalThreads: [createdThreads[4].id, createdThreads[3].id] }, // Romans 9-11 also in This Week's Study and Morning Reflections
      { noteIndex: 1, additionalThreads: [createdThreads[3].id, createdThreads[0].id] }, // Psalm 23 and Anxiety also in Morning Reflections and Gospel of John
      { noteIndex: 2, additionalThreads: [createdThreads[0].id, createdThreads[1].id] }, // Beatitudes also in Gospel of John and Psalm 23 Study
      { noteIndex: 3, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // "In Christ" also in Romans Study and This Week's Study
      { noteIndex: 4, additionalThreads: [createdThreads[1].id, createdThreads[0].id] }, // Good Shepherd also in Psalm 23 Study and Gospel of John
      { noteIndex: 5, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Understanding Romans 8:28 also in Romans Study and This Week's Study
      { noteIndex: 6, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Questions for Small Group also in Romans Study and This Week's Study
      { noteIndex: 7, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Proverbs on Work also in Psalm 23 Study and Morning Reflections
      { noteIndex: 8, additionalThreads: [createdThreads[1].id, createdThreads[2].id] }, // Ecclesiastes also in Psalm 23 Study and Romans Study
      { noteIndex: 9, additionalThreads: [createdThreads[0].id, createdThreads[3].id] }, // Lamentations 3:22-23 also in Gospel of John and Morning Reflections
      { noteIndex: 10, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // 1 Corinthians 13 also in Romans Study and This Week's Study
      { noteIndex: 11, additionalThreads: [createdThreads[0].id, createdThreads[4].id] }, // Preparing for This Week also in Gospel of John and This Week's Study
      { noteIndex: 12, additionalThreads: [createdThreads[1].id, createdThreads[0].id] }, // Parable of the Sower also in Psalm 23 Study and Gospel of John
      { noteIndex: 13, additionalThreads: [createdThreads[2].id, createdThreads[0].id] }, // Grace vs Works also in Romans Study and Gospel of John
      { noteIndex: 14, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Proverbs 3:5-6 also in Psalm 23 Study and Morning Reflections
      { noteIndex: 15, additionalThreads: [createdThreads[0].id, createdThreads[2].id] }, // John's Prologue also in Gospel of John and Romans Study
      { noteIndex: 16, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Lord's Prayer also in Psalm 23 Study and Morning Reflections
      { noteIndex: 17, additionalThreads: [createdThreads[4].id, createdThreads[2].id] }, // Small Group Discussion Notes also in This Week's Study and Romans Study
      { noteIndex: 18, additionalThreads: [createdThreads[0].id, createdThreads[1].id] }, // Prodigal Son: Both Brothers also in Gospel of John and Psalm 23 Study
      { noteIndex: 19, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Philippians 4:6-7 also in Romans Study and This Week's Study
      { noteIndex: 20, additionalThreads: [createdThreads[2].id, createdThreads[1].id] }, // Fruit of the Spirit also in Romans Study and Psalm 23 Study
      { noteIndex: 21, additionalThreads: [createdThreads[1].id, createdThreads[0].id] }, // Wisdom vs Knowledge also in Psalm 23 Study and Gospel of John
      { noteIndex: 22, additionalThreads: [createdThreads[0].id, createdThreads[1].id] }, // The Prodigal Son - Both Brothers also in Gospel of John and Psalm 23 Study
      { noteIndex: 23, additionalThreads: [createdThreads[2].id, createdThreads[4].id] }, // Romans 8:1 - No Condemnation also in Romans Study and This Week's Study
      { noteIndex: 24, additionalThreads: [createdThreads[1].id, createdThreads[3].id] }, // Psalm 23:4 - Walking Through the Valley also in Psalm 23 Study and Morning Reflections
      { noteIndex: 25, additionalThreads: [createdThreads[0].id, createdThreads[2].id] }, // Matthew 28:18-20 - The Great Commission also in Gospel of John and Romans Study
    ];
    
    // Link scripture notes to additional threads
    for (const multiThread of scriptureMultiThread) {
      const note = scriptureNotes[multiThread.noteIndex];
      if (note) {
        for (const threadId of multiThread.additionalThreads) {
          // Don't link to the same thread it's already in
          if (threadId !== note.threadId) {
            await linkNoteToThread(note.noteId, threadId);
          }
        }
      }
    }
    
    // Link default notes to additional threads
    for (const multiThread of defaultMultiThread) {
      const note = createdDefaultNotes[multiThread.noteIndex];
      if (note) {
        for (const threadId of multiThread.additionalThreads) {
          // Don't link to the same thread it's already in
          if (threadId !== note.threadId) {
            await linkNoteToThread(note.noteId, threadId);
          }
        }
      }
    }
    
    // Count total thread links (each note in primary thread + additional threads)
    const totalLinks = scriptureNotes.length + createdDefaultNotes.length + 
      scriptureMultiThread.reduce((sum, m) => sum + m.additionalThreads.length, 0) +
      defaultMultiThread.reduce((sum, m) => sum + m.additionalThreads.length, 0);
    console.log(`  ✅ Linked ${scriptureNotes.length + createdDefaultNotes.length} notes to ${totalLinks} thread relationships`);
    console.log(`   (Each note appears in multiple threads - demonstrating Harvous's many-to-many advantage!)`);

    // Tag notes
    console.log('\n🏷️  Tagging notes...');
    for (const note of createdDefaultNotes) {
      for (const tagName of note.tags) {
        const tagId = createdTags[tagName];
        if (tagId) {
          await tagNote(note.noteId, tagId);
        }
      }
    }
    // Tag some scripture notes too
    const scriptureTagPairs = [
      { noteIndex: 0, tags: ['John', 'Faith'] }, // John 3:16
      { noteIndex: 1, tags: ['Romans', 'Faith'] }, // Romans 8:28
      { noteIndex: 2, tags: ['Psalms', 'Prayer'] }, // Psalm 23:1
      { noteIndex: 3, tags: ['Romans', 'Grace'] }, // Ephesians 2:8-10
      { noteIndex: 5, tags: ['Romans', 'Love'] }, // 1 Corinthians 13:4-7
      { noteIndex: 7, tags: ['Wisdom'] }, // Proverbs 3:5-6
    ];
    for (const pair of scriptureTagPairs) {
      const note = scriptureNotes[pair.noteIndex];
      if (note) {
        for (const tagName of pair.tags) {
          const tagId = createdTags[tagName];
          if (tagId) {
            await tagNote(note.noteId, tagId);
          }
        }
      }
    }
    console.log(`  ✅ Tagged notes`);

    // Update user metadata with highest simpleNoteId
    await db.update(UserMetadata)
      .set({ 
        highestSimpleNoteId: nextSimpleNoteId - 1,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, USER_ID));

    console.log('\n🎉 Marketing seed completed!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Spaces: ${spaces.length}`);
    console.log(`   - Threads: ${createdThreads.length}`);
    console.log(`   - Scripture Notes: ${scriptureNotes.length}`);
    console.log(`   - Default Notes: ${createdDefaultNotes.length}`);
    console.log(`   - Tags: ${Object.keys(createdTags).length}`);
    console.log(`   - Total Notes: ${scriptureNotes.length + createdDefaultNotes.length}`);

  } catch (error) {
    console.error('❌ Error in marketing seed:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedMarketing().catch(console.error);
}

export default seedMarketing;

