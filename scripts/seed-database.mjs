import { db, Spaces, Threads, Notes, NoteThreads } from "astro:db";
import { generateSpaceId, generateThreadId, generateNoteId } from "../src/utils/ids.ts";

// Helper function to add a small delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function seedDatabase() {
  console.log("🌱 Seeding database with new thread-centric structure...");

  try {
    // Clear existing data
    await db.delete(NoteThreads);
    await db.delete(Notes);
    await db.delete(Threads);
    await db.delete(Spaces);

    const userId = "user_2abc123";

    // 1. Create the unorganized thread (required for all notes)
    const unorganizedThreadId = generateThreadId();
    console.log("Generated unorganized thread ID:", unorganizedThreadId);
    
    await db.insert(Threads).values({
      id: unorganizedThreadId,
      title: "Unorganized",
      subtitle: "Notes not yet organized into specific threads",
      color: "neutral-gray",
      spaceId: null, // No space - this is a background concept
      userId: userId,
      isPublic: false,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("✅ Created unorganized thread:", "Unorganized");

    await delay(10); // Small delay to ensure unique timestamps

    // 2. Create optional spaces
    const spaceIds = {
      bibleStudy: generateSpaceId(),
      prayerJournal: generateSpaceId(),
    };
    
    console.log("Generated space IDs:", spaceIds);

    await db.insert(Spaces).values([
      {
        id: spaceIds.bibleStudy,
        title: "Bible Study",
        description: "In-depth study of Scripture",
        color: "graceful-gold",
        backgroundGradient: "linear-gradient(180deg, var(--color-graceful-gold) 0%, var(--color-graceful-gold) 100%)",
        userId: userId,
        isPublic: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: spaceIds.prayerJournal,
        title: "Prayer Journal",
        description: "Personal prayers and reflections",
        color: "caring-coral",
        backgroundGradient: "linear-gradient(180deg, var(--color-caring-coral) 0%, var(--color-caring-coral) 100%)",
        userId: userId,
        isPublic: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log("✅ Created optional spaces:", ["Bible Study", "Prayer Journal"]);

    await delay(10); // Small delay to ensure unique timestamps

    // 3. Create threads (some in spaces, some standalone)
    const threadIds = {
      gospelJohn: generateThreadId(),
      psalms: generateThreadId(),
      dailyPrayers: generateThreadId(),
      gettingStarted: generateThreadId(),
    };
    
    console.log("Generated thread IDs:", threadIds);

    await db.insert(Threads).values([
      {
        id: threadIds.gospelJohn,
        title: "Gospel of John",
        subtitle: "In-depth study of John's gospel",
        color: "graceful-gold",
        spaceId: spaceIds.bibleStudy, // In Bible Study space
        userId: userId,
        isPublic: false,
        isPinned: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: threadIds.psalms,
        title: "Psalms",
        subtitle: "Study of the Psalms",
        color: "blessed-blue",
        spaceId: spaceIds.bibleStudy, // In Bible Study space
        userId: userId,
        isPublic: false,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: threadIds.dailyPrayers,
        title: "Daily Prayers",
        subtitle: "Daily prayer reflections",
        color: "caring-coral",
        spaceId: spaceIds.prayerJournal, // In Prayer Journal space
        userId: userId,
        isPublic: false,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: threadIds.gettingStarted,
        title: "Getting Started",
        subtitle: "Welcome and getting started guide",
        color: "blessed-blue",
        spaceId: null, // Standalone thread (no space)
        userId: userId,
        isPublic: false,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log("✅ Created threads:", ["Gospel of John", "Psalms", "Daily Prayers", "Getting Started"]);

    await delay(10); // Small delay to ensure unique timestamps

    // 4. Create notes with proper thread relationships
    const noteIds = {
      john316: generateNoteId(),
      john141: generateNoteId(),
      john1010: generateNoteId(),
      psalm23: generateNoteId(),
      psalm51: generateNoteId(),
      morningPrayer: generateNoteId(),
      eveningReflection: generateNoteId(),
      quickTour: generateNoteId(),
      randomThought: generateNoteId(),
      godsLove: generateNoteId(), // This will be in multiple threads
    };
    
    console.log("Generated note IDs:", noteIds);

    await db.insert(Notes).values([
      // Notes in Gospel of John thread
      {
        id: noteIds.john316,
        title: "John 3:16 - God's Love",
        content: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. This verse encapsulates the entire gospel message - God's love, Christ's sacrifice, and the offer of eternal life through faith.",
        threadId: threadIds.gospelJohn,
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: noteIds.john141,
        title: "John 14:1 - Let Not Your Hearts Be Troubled",
        content: "Let not your hearts be troubled, neither let them be afraid. Jesus speaks these words to comfort his disciples before his departure. This verse reminds us that in Christ, we have peace that transcends understanding.",
        threadId: threadIds.gospelJohn,
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: noteIds.john1010,
        title: "John 10:10 - Abundant Life",
        content: "The thief comes only to steal and kill and destroy. I came that they may have life and have it abundantly. Jesus contrasts his purpose with that of the thief, emphasizing the fullness of life he offers.",
        threadId: threadIds.gospelJohn,
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Notes in Psalms thread
      {
        id: noteIds.psalm23,
        title: "Psalm 23 - The Lord is My Shepherd",
        content: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul. This psalm speaks of God's care and provision for his people.",
        threadId: threadIds.psalms,
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: noteIds.psalm51,
        title: "Psalm 51 - Create in Me a Clean Heart",
        content: "Create in me a clean heart, O God, and renew a right spirit within me. Cast me not away from your presence, and take not your Holy Spirit from me. A prayer of repentance and renewal.",
        threadId: threadIds.psalms,
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Notes in Daily Prayers thread
      {
        id: noteIds.morningPrayer,
        title: "Morning Prayer",
        content: "Thank you, Lord, for this new day. Help me to walk in your ways and to be a light to those around me. Guide my thoughts, words, and actions to glorify you.",
        threadId: threadIds.dailyPrayers,
        spaceId: spaceIds.prayerJournal,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: noteIds.eveningReflection,
        title: "Evening Reflection",
        content: "As I end this day, I reflect on your faithfulness, Lord. Thank you for your presence throughout the day. Help me to rest in your peace and prepare for tomorrow.",
        threadId: threadIds.dailyPrayers,
        spaceId: spaceIds.prayerJournal,
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Note in Getting Started thread (standalone)
      {
        id: noteIds.quickTour,
        title: "Quick Tour of Harvous",
        content: "Welcome to Harvous! This is a Bible study notes app designed to help you organize your spiritual journey. Create threads to group related notes, and use spaces to organize your threads.",
        threadId: threadIds.gettingStarted,
        spaceId: null, // No space - thread is standalone
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Notes in unorganized thread
      {
        id: noteIds.randomThought,
        title: "Random Thought",
        content: "This note is in the unorganized thread by default. I should probably move it to a more appropriate thread when I figure out what it's about.",
        threadId: unorganizedThreadId,
        spaceId: null, // No space - unorganized
        userId: userId,
        isPublic: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Multi-thread note (will be linked to multiple threads via NoteThreads)
      {
        id: noteIds.godsLove,
        title: "God's Love in Scripture",
        content: "God's love is a central theme throughout Scripture. From Genesis to Revelation, we see God's love demonstrated in creation, redemption, and ongoing care for his people.",
        threadId: threadIds.gospelJohn, // Primary thread
        spaceId: spaceIds.bibleStudy,
        userId: userId,
        isPublic: false,
        isFeatured: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await delay(10); // Small delay to ensure unique timestamps

    // 5. Create many-to-many relationships for the multi-thread note
    await db.insert(NoteThreads).values([
      {
        id: generateNoteId(), // Using note ID generator for junction table
        noteId: noteIds.godsLove,
        threadId: threadIds.gospelJohn,
        createdAt: new Date(),
      },
      {
        id: generateNoteId(), // Using note ID generator for junction table
        noteId: noteIds.godsLove,
        threadId: threadIds.psalms,
        createdAt: new Date(),
      },
    ]);

    console.log("✅ Created notes with proper thread relationships:");
    console.log(`   Thread 1 (Gospel of John): 3 notes`);
    console.log(`   Thread 2 (Psalms): 2 notes (1 shared)`);
    console.log(`   Thread 3 (Daily Prayers): 2 notes`);
    console.log(`   Thread 4 (Getting Started): 1 note`);
    console.log(`   Unorganized Thread: 2 notes`);
    console.log(`   Multi-thread note: "God's Love in Scripture" (in threads 1 & 2)`);

    console.log("🎉 Database seeding completed successfully!");
    console.log("📊 Created 2 spaces, 5 threads (including unorganized), and 9 notes");
    console.log("🔗 New structure: Threads (required) → Notes (required), Spaces (optional)");
    console.log("🔑 Using time-based IDs for consistent navigation:");
    console.log(`   Spaces: ${spaceIds.bibleStudy}, ${spaceIds.prayerJournal}`);
    console.log(`   Threads: ${unorganizedThreadId}, ${threadIds.gospelJohn}, ${threadIds.psalms}, ${threadIds.dailyPrayers}, ${threadIds.gettingStarted}`);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run the seed function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch(console.error);
}

export default seedDatabase;
