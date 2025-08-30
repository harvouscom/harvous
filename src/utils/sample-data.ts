// Robust sample data system for development
// This ensures consistent, clean data without duplicates

export interface SampleNote {
  id: string;
  title: string;
  content: string;
  threadId: string;
  lastUpdated: string;
  createdAt: Date;
  noteId?: number; // Simple note ID for user display (N001, N002, etc.) - only for added content
}

export interface SampleThread {
  id: string;
  title: string;
  content: string;
  spaceId?: string;
  noteCount: number;
  lastUpdated: string;
  isPrivate: boolean;
  color: string;
}

export interface SampleSpace {
  id: string;
  title: string;
  totalItemCount: number;
  color: string;
}

// Clean, consistent sample data
export const SAMPLE_DATA = {
  // Inbox content (not yet added by user) - these should NOT have simple note IDs
  unorganizedNotes: [
    {
      id: "note_1756318000001",
      title: "Prayer Request",
      content: "Need to pray for Sarah's health, upcoming church meeting, and guidance on the new ministry opportunity.",
      threadId: "thread_1756318000002",
      lastUpdated: "3 hours ago",
      createdAt: new Date("2025-02-07T08:00:00Z")
      // No noteId - this is inbox content, not yet added
    },
    {
      id: "note_1756318000003",
      title: "John 3:16 Reflection",
      content: "For God so loved the world that he gave his one and only Son... This verse shows God's incredible love.",
      threadId: "thread_1756318000002",
      lastUpdated: "2 hours ago",
      createdAt: new Date("2025-02-07T08:30:00Z")
      // No noteId - this is inbox content, not yet added
    }
  ] as SampleNote[],

  // Added content (user has added these to their notes) - these have simple note IDs
  threadNotes: [
    {
      id: "note_1756318000004",
      title: "John 3:16 - God's Love",
      content: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
      threadId: "thread_1756318000000",
      lastUpdated: "1 day ago",
      createdAt: new Date("2025-02-07T09:00:00Z"),
      noteId: 1 // This note has been added to user's notes
    },
    {
      id: "note_1756318000005",
      title: "John 14:1 - Let Not Your Hearts Be Troubled", 
      content: "Let not your hearts be troubled, neither let them be afraid.",
      threadId: "thread_1756318000000",
      lastUpdated: "1 day ago",
      createdAt: new Date("2025-02-07T09:30:00Z"),
      noteId: 2 // This note has been added to user's notes
    }
  ] as SampleNote[],

  // Unorganized threads (goes to inbox)
  unorganizedThreads: [
    {
      id: "thread_1756318000004",
      title: "Psalm 23 Study",
      content: "Exploring God's care and provision through Psalm 23",
      noteCount: 3,
      lastUpdated: "1 day ago",
      isPrivate: false,
      color: "blessed-blue"
    }
  ] as SampleThread[],

  // Organized content (goes to full list)
  organizedThreads: [
    {
      id: "thread_1756318000000",
      title: "Gospel of John",
      content: "In-depth study of John's gospel",
      spaceId: "space_1756318000006",
      noteCount: 2,
      lastUpdated: "2 days ago",
      isPrivate: true,
      color: "lovely-lavender"
    }
  ] as SampleThread[],

  // Spaces
  spaces: [
    {
      id: "space_1756318000006",
      title: "Bible Study",
      totalItemCount: 1,
      color: "blue"
    }
  ] as SampleSpace[],

  // Navigation threads (pinned)
  pinnedThreads: [
    {
      id: "thread_1756318000000",
      title: "Gospel of John",
      noteCount: 2,
      color: "lovely-lavender"
    }
  ]
};

// Helper functions to get data in the format expected by components
export function getInboxContent() {
  const inboxItems = [
    // Convert unorganized notes to the format expected by CardFeat
    // These are inbox content, so they should NOT have simple note IDs
    ...SAMPLE_DATA.unorganizedNotes.map(note => ({
      id: note.id,
      type: "note" as const,
      variant: "Note" as const,
      title: note.title,
      content: note.content,
      // No noteId - this is inbox content, not yet added
      threadId: note.threadId,
      lastUpdated: note.lastUpdated
    })),
    // Convert unorganized threads to the format expected by CardFeat
    ...SAMPLE_DATA.unorganizedThreads.map(thread => ({
      id: thread.id,
      type: "thread" as const,
      variant: "Thread" as const,
      title: thread.title,
      content: thread.content,
      threadId: thread.id,
      lastUpdated: thread.lastUpdated,
      isPrivate: thread.isPrivate
    }))
  ];

  return inboxItems;
}

export function getOrganizedContent() {
  const organizedItems = [
    // Add organized threads
    ...SAMPLE_DATA.organizedThreads.map(thread => ({
      id: thread.id,
      type: "thread" as const,
      title: thread.title,
      subtitle: `${thread.noteCount} note${thread.noteCount !== 1 ? 's' : ''}`,
      count: thread.noteCount,
      threadId: thread.id,
      spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated,
      isPrivate: thread.isPrivate
    })),
    // Add notes from organized threads
    ...SAMPLE_DATA.threadNotes.filter(note => {
      // Find the thread this note belongs to
      const thread = SAMPLE_DATA.organizedThreads.find(t => t.id === note.threadId);
      return thread; // Include notes from any organized thread
    }).map(note => ({
      id: note.id,
      type: "note" as const,
      title: note.title,
      content: note.content,
      noteId: note.id,
      threadId: note.threadId,
      lastUpdated: note.lastUpdated
    }))
  ];

  return organizedItems;
}

export function getNavigationData() {
  return {
    threads: SAMPLE_DATA.pinnedThreads.map(thread => ({
      id: thread.id,
      title: thread.title,
      noteCount: thread.noteCount,
      backgroundGradient: `linear-gradient(180deg, var(--color-${thread.color}) 0%, var(--color-${thread.color}) 100%)`,
      isPinned: true
    })),
    spaces: SAMPLE_DATA.spaces.map(space => ({
      id: space.id,
      title: space.title,
      totalItemCount: space.totalItemCount,
      backgroundGradient: `linear-gradient(180deg, var(--color-${space.color}) 0%, var(--color-${space.color}) 100%)`,
      isActive: true
    })),
    inboxCount: SAMPLE_DATA.unorganizedNotes.length + SAMPLE_DATA.unorganizedThreads.length
  };
}

// Function to check if we should use sample data
export function shouldUseSampleData(): boolean {
  // Check for a URL parameter to force real database usage
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('useRealData') === 'true') {
      return false;
    }
  }
  
  // In development, always use sample data for consistency
  return import.meta.env.DEV;
}

// Function to get the current data mode
export function getDataMode(): 'sample' | 'real' {
  return shouldUseSampleData() ? 'sample' : 'real';
}

// Function to toggle data mode
export function toggleDataMode(): void {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const urlParams = url.searchParams;
    
    if (urlParams.get('useRealData') === 'true') {
      urlParams.delete('useRealData');
    } else {
      urlParams.set('useRealData', 'true');
    }
    
    window.location.href = url.toString();
  }
}
