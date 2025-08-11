import { defineDb, defineTable, column } from 'astro:db';

const Notes = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    title: column.text({ optional: true }),
    content: column.text(),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
  }
})

// const Threads = defineTable({
//   columns: {
//     id: column.number({ primaryKey: true }),
//     title: column.text(),
//     createdAt: column.date(),
//     updatedAt: column.date({ optional: true }),
//     userId: column.text(), // Clerk user id
//     isPublic: column.boolean({ default: false }),
//     color: column.text({ optional: true }), // Store the color name or value
//     isPinned: column.boolean({ default: false }), // Whether the thread is pinned
//   }
// })

// const NoteThreads = defineTable({
//   columns: {
//     id: column.number({ primaryKey: true }),
//     noteId: column.number(),
//     threadId: column.number(),
//     createdAt: column.date(),
//   }
// })

// https://astro.build/db/config
export default defineDb({
  tables: {
    Notes,
    // Threads,
    // NoteThreads
  }
});