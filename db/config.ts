
import { defineDb, defineTable, column } from 'astro:db';

const Note = defineTable({
  columns: {
    title: column.text(),
    content: column.text(),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
  }
})

// https://astro.build/db/config
export default defineDb({
  tables: {
    Note
  }
});