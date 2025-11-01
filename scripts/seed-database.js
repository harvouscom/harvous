import { db, Threads, Notes, NoteThreads } from "astro:db";

async function seedDatabase() {
  try {
    console.log("🌱 Seeding database with sample data...");
    
    const userId = "user_2abc123"; // Test user ID
    
    // Create sample threads
    const thread1 = await db.insert(Threads).values({
      title: "Welcome to Harvous",
      userId,
      isPublic: false,
      color: "blue",
      isPinned: true,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    }).returning().get();
    
    const thread2 = await db.insert(Threads).values({
      title: "Bible Study Notes",
      userId,
      isPublic: false,
      color: "yellow",
      isPinned: false,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    }).returning().get();
    
    const thread3 = await db.insert(Threads).values({
      title: "Prayer Requests",
      userId,
      isPublic: false,
      color: "green",
      isPinned: false,
      createdAt: new Date(),
    }).returning().get();
    
    console.log("✅ Created threads:", [thread1.title, thread2.title, thread3.title]);
    
    // Create sample notes
    const note1 = await db.insert(Notes).values({
      title: "Note from Our Founder",
      content: "Thank you so much for trying out this notes app designed for Bible study. It's been a project I've been working on for a good amount of time. I hope it helps you in your spiritual journey!",
      userId,
      isPublic: false,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
    }).returning().get();
    
    const note2 = await db.insert(Notes).values({
      title: "Quick Tour of Harvous",
      content: "Play a video walkthrough going through the app. Think of this as a live demo and feel free to leave a comment with questions. This will help you get started quickly!",
      userId,
      isPublic: false,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    }).returning().get();
    
    const note3 = await db.insert(Notes).values({
      title: "You're invited to Harvous!",
      content: "Share your experience with Harvous! Invite friends, family, and your church community to explore this unique Bible study tool. Together we can grow in faith.",
      userId,
      isPublic: false,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    }).returning().get();
    
    const note4 = await db.insert(Notes).values({
      title: "Getting Started Guide",
      content: "This is a comprehensive guide to help you get started with Harvous. Learn about threads, notes, and how to organize your Bible study effectively.",
      userId,
      isPublic: false,
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    }).returning().get();
    
    const note5 = await db.insert(Notes).values({
      title: "John 3:16 Reflection",
      content: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. This verse reminds us of God's incredible love and the gift of salvation through Jesus Christ.",
      userId,
      isPublic: false,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    }).returning().get();
    
    console.log("✅ Created notes:", [note1.title, note2.title, note3.title, note4.title, note5.title]);
    
    // Create note-thread relationships
    await db.insert(NoteThreads).values({
      noteId: note1.id,
      threadId: thread1.id,
      createdAt: new Date(),
    });
    
    await db.insert(NoteThreads).values({
      noteId: note2.id,
      threadId: thread1.id,
      createdAt: new Date(),
    });
    
    await db.insert(NoteThreads).values({
      noteId: note3.id,
      threadId: thread1.id,
      createdAt: new Date(),
    });
    
    await db.insert(NoteThreads).values({
      noteId: note4.id,
      threadId: thread2.id,
      createdAt: new Date(),
    });
    
    await db.insert(NoteThreads).values({
      noteId: note5.id,
      threadId: thread2.id,
      createdAt: new Date(),
    });
    
    console.log("✅ Created note-thread relationships");
    
    console.log("🎉 Database seeding completed successfully!");
    console.log(`📊 Created ${3} threads and ${5} notes with relationships`);
    
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run the seeding function
seedDatabase().catch(console.error);
