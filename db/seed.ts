import { db, Spaces, Threads, Notes, NoteThreads } from 'astro:db';

export default async function() {
  // Create a test user ID (this would normally come from Clerk)
  const testUserId = 'user_test_123';

  // Create test spaces
  await db.insert(Spaces).values([
    {
      id: 'space_test_1',
      title: 'Test Space 1',
      description: 'A test space for development',
      color: 'blessed-blue',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: false,
      isActive: true,
      order: 1
    },
    {
      id: 'space_test_2',
      title: 'Test Space 2',
      description: 'Another test space',
      color: 'lovely-lavender',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: true,
      isActive: true,
      order: 2
    }
  ]);

  // Create test threads
  await db.insert(Threads).values([
    {
      id: 'thread_test_1',
      title: 'Test Thread 1',
      subtitle: 'First test thread',
      spaceId: 'space_test_1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: false,
      isPinned: false,
      color: 'blessed-blue',
      order: 1
    },
    {
      id: 'thread_test_2',
      title: 'Test Thread 2',
      subtitle: 'Second test thread',
      spaceId: null, // Unorganized thread
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: true,
      isPinned: true,
      color: 'lovely-lavender',
      order: 2
    },
    {
      id: 'thread_unorganized',
      title: 'Unorganized',
      subtitle: 'Default thread for unorganized notes',
      spaceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: true,
      isPinned: false,
      color: 'paper',
      order: 0
    }
  ]);

  // Create test notes
  await db.insert(Notes).values([
    {
      id: 'note_test_1',
      title: 'Test Note 1',
      content: 'This is the first test note content.',
      threadId: 'thread_test_1',
      spaceId: 'space_test_1',
      simpleNoteId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: false,
      isFeatured: true,
      order: 1
    },
    {
      id: 'note_test_2',
      title: 'Test Note 2',
      content: 'This is the second test note content.',
      threadId: 'thread_test_2',
      spaceId: null,
      simpleNoteId: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: true,
      isFeatured: false,
      order: 2
    },
    {
      id: 'note_unorganized_1',
      title: 'Unorganized Note 1',
      content: 'This note is in the unorganized thread.',
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: testUserId,
      isPublic: false,
      isFeatured: false,
      order: 1
    }
  ]);

  console.log('Database seeded with test data');
}