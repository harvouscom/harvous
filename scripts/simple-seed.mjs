import { db, Spaces, Threads, Notes } from "astro:db";
import { generateSpaceId, generateThreadId, generateNoteId } from "../src/utils/ids.ts";

async function simpleSeed() {
  try {
    console.log("🌱 Simple seeding test...");
    
    const userId = "user_2abc123";
    
    // Create the unorganized thread with time-based ID
    const unorganizedThreadId = generateThreadId();
    const unorganizedThread = await db.insert(Threads).values({
      id: unorganizedThreadId,
      title: "Unorganized",
      subtitle: "Notes that haven't been organized into threads yet",
      spaceId: null,
      userId,
      isPublic: false,
      color: null, // Will use default paper color
      isPinned: false,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created unorganized thread:", unorganizedThread.title, "with ID:", unorganizedThreadId);
    
    // Create one space with time-based ID
    const spaceId = generateSpaceId();
    const space = await db.insert(Spaces).values({
      id: spaceId,
      title: "Bible Study",
      description: "Deep dive into scripture",
      color: "yellow",
      backgroundGradient: "linear-gradient(180deg, var(--color-yellow) 0%, var(--color-yellow) 100%)",
      userId,
      isPublic: false,
      isActive: true,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created space:", space.title, "with ID:", spaceId);
    
    // Create one thread in the space with time-based ID
    const threadId = generateThreadId();
    const thread = await db.insert(Threads).values({
      id: threadId,
      title: "Gospel of John",
      subtitle: "In-depth study of John's gospel",
      spaceId: space.id,
      userId,
      isPublic: false,
      color: "yellow",
      isPinned: true,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created thread:", thread.title, "with ID:", threadId);
    
    // Create one note in the thread with time-based ID
    const noteId = generateNoteId();
    const note = await db.insert(Notes).values({
      id: noteId,
      title: "John 3:16 - God's Love",
      content: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. This verse encapsulates the entire gospel message - God's love, Jesus' sacrifice, and the promise of eternal life for believers.",
      threadId: thread.id,
      spaceId: space.id,
      userId,
      isPublic: false,
      isFeatured: true,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created note:", note.title, "with ID:", noteId);
    
    // Create one note in unorganized thread with time-based ID
    const unorganizedNoteId = generateNoteId();
    const unorganizedNote = await db.insert(Notes).values({
      id: unorganizedNoteId,
      title: "John 3:16 Reflection",
      content: "For God so loved the world that he gave his one and only Son... This verse shows God's incredible love and the purpose of Jesus' mission. Need to study this more deeply.",
      threadId: unorganizedThread.id,
      spaceId: null,
      userId,
      isPublic: false,
      isFeatured: false,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created unorganized note:", unorganizedNote.title, "with ID:", unorganizedNoteId);
    
    // Create one note in unorganized thread (inbox content) with time-based ID
    const prayerNoteId = generateNoteId();
    const prayerNote = await db.insert(Notes).values({
      id: prayerNoteId,
      title: "Prayer Request",
      content: "Need to pray for Sarah's health, upcoming church meeting, and guidance on the new ministry opportunity. Also praying for wisdom in leading the Bible study group.",
      threadId: unorganizedThread.id,
      spaceId: null,
      userId,
      isPublic: false,
      isFeatured: false,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
    }).returning().get();
    
    console.log("✅ Created unorganized note:", prayerNote.title, "with ID:", prayerNoteId);
    
    // Create Psalm 23 Study thread (unorganized - will appear in inbox)
    const psalmThreadId = generateThreadId();
    const psalmThread = await db.insert(Threads).values({
      id: psalmThreadId,
      title: "Psalm 23 Study",
      subtitle: "Exploring God's care and provision",
      spaceId: null, // This makes it unorganized and appear in inbox
      userId,
      isPublic: false,
      color: "yellow",
      isPinned: false,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    }).returning().get();
    
    console.log("✅ Created unorganized thread:", psalmThread.title, "with ID:", psalmThreadId);
    
    // Create multiple notes in the Psalm 23 thread
    const psalmNotes = [
      {
        title: "Psalm 23:1-3 - The Shepherd",
        content: "The Lord is my shepherd, I shall not want. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul. This opening establishes God as our caring shepherd who provides for our needs.",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        title: "Psalm 23:4 - The Valley",
        content: "Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me. This verse speaks to God's presence during difficult times and His protection.",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      },
      {
        title: "Psalm 23:5-6 - The Table",
        content: "You prepare a table before me in the presence of my enemies. You anoint my head with oil; my cup overflows. Surely your goodness and love will follow me all the days of my life, and I will dwell in the house of the Lord forever. God's provision and the promise of eternal fellowship.",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      }
    ];
    
    for (const noteData of psalmNotes) {
      const psalmNoteId = generateNoteId();
      const note = await db.insert(Notes).values({
        id: psalmNoteId,
        ...noteData,
        threadId: psalmThread.id,
        spaceId: null,
        userId,
        isPublic: false,
        isFeatured: false,
      }).returning().get();
      
      console.log("✅ Created Psalm 23 note:", note.title, "with ID:", psalmNoteId);
    }
    
    console.log("🎉 Simple seeding completed!");
    
  } catch (error) {
    console.error("❌ Error in simple seeding:", error);
    throw error;
  }
}

export default simpleSeed;

if (import.meta.url === `file://${process.argv[1]}`) {
  simpleSeed().catch(console.error);
}
