var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  Comments: () => Comments,
  InboxItemNotes: () => InboxItemNotes,
  InboxItems: () => InboxItems,
  Members: () => Members,
  MonthlyAnalytics: () => MonthlyAnalytics,
  NoteScriptureReferences: () => NoteScriptureReferences,
  NoteTags: () => NoteTags,
  NoteThreads: () => NoteThreads,
  Notes: () => Notes,
  ResourceMetadata: () => ResourceMetadata,
  ScriptureMetadata: () => ScriptureMetadata,
  SpaceInvitations: () => SpaceInvitations,
  Spaces: () => Spaces,
  Tags: () => Tags,
  Threads: () => Threads,
  UserInboxItems: () => UserInboxItems,
  UserLifetimeXP: () => UserLifetimeXP,
  UserMetadata: () => UserMetadata,
  UserSeasonalXP: () => UserSeasonalXP,
  UserXP: () => UserXP,
  WeeklyStreaks: () => WeeklyStreaks
});
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
var Spaces, Threads, Notes, NoteThreads, Comments, Members, SpaceInvitations, UserMetadata, UserXP, UserSeasonalXP, UserLifetimeXP, WeeklyStreaks, Tags, NoteTags, ScriptureMetadata, NoteScriptureReferences, ResourceMetadata, InboxItems, InboxItemNotes, UserInboxItems, MonthlyAnalytics;
var init_schema = __esm({
  "server/db/schema.ts"() {
    "use strict";
    Spaces = sqliteTable("Spaces", {
      id: text("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description"),
      color: text("color"),
      backgroundGradient: text("backgroundGradient"),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt"),
      lastVisited: text("lastVisited"),
      userId: text("userId").notNull(),
      isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
      isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
      order: integer("order").notNull().default(0),
      shareToken: text("shareToken"),
      shareTokenCreatedAt: text("shareTokenCreatedAt")
    });
    Threads = sqliteTable("Threads", {
      id: text("id").primaryKey(),
      title: text("title").notNull(),
      subtitle: text("subtitle"),
      spaceId: text("spaceId"),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt"),
      lastVisited: text("lastVisited"),
      userId: text("userId").notNull(),
      isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
      isPinned: integer("isPinned", { mode: "boolean" }).notNull().default(false),
      color: text("color"),
      order: integer("order").notNull().default(0),
      shareToken: text("shareToken"),
      shareTokenCreatedAt: text("shareTokenCreatedAt")
    });
    Notes = sqliteTable("Notes", {
      id: text("id").primaryKey(),
      title: text("title"),
      content: text("content").notNull(),
      threadId: text("threadId").notNull(),
      spaceId: text("spaceId"),
      simpleNoteId: integer("simpleNoteId"),
      noteType: text("noteType").notNull().default("default"),
      addedBy: text("addedBy").notNull().default("user"),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt"),
      lastVisited: text("lastVisited"),
      userId: text("userId").notNull(),
      isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
      isFeatured: integer("isFeatured", { mode: "boolean" }).notNull().default(false),
      order: integer("order").notNull().default(0),
      shareToken: text("shareToken"),
      shareTokenCreatedAt: text("shareTokenCreatedAt"),
      contentEncrypted: integer("contentEncrypted", { mode: "boolean" }).notNull().default(false)
    });
    NoteThreads = sqliteTable("NoteThreads", {
      id: text("id").primaryKey(),
      noteId: text("noteId").notNull(),
      threadId: text("threadId").notNull(),
      createdAt: text("createdAt").notNull()
    }, (table) => [
      uniqueIndex("NoteThreads_uniqueNoteThread").on(table.noteId, table.threadId)
    ]);
    Comments = sqliteTable("Comments", {
      id: text("id").primaryKey(),
      content: text("content").notNull(),
      noteId: text("noteId").notNull(),
      userId: text("userId").notNull(),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    Members = sqliteTable("Members", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull(),
      spaceId: text("spaceId").notNull(),
      role: text("role").notNull().default("member"),
      createdAt: text("createdAt").notNull(),
      joinedAt: text("joinedAt")
    }, (table) => [
      index("Members_spaceIdIndex").on(table.spaceId),
      index("Members_userIdIndex").on(table.userId)
    ]);
    SpaceInvitations = sqliteTable("SpaceInvitations", {
      id: text("id").primaryKey(),
      spaceId: text("spaceId").notNull(),
      invitedBy: text("invitedBy").notNull(),
      invitedEmail: text("invitedEmail"),
      invitedUserId: text("invitedUserId"),
      inviteToken: text("inviteToken").notNull().unique(),
      role: text("role").notNull().default("member"),
      status: text("status").notNull(),
      message: text("message"),
      expiresAt: text("expiresAt"),
      createdAt: text("createdAt").notNull(),
      acceptedAt: text("acceptedAt")
    }, (table) => [
      uniqueIndex("SpaceInvitations_tokenIndex").on(table.inviteToken),
      index("SpaceInvitations_spaceStatusIndex").on(table.spaceId, table.status),
      index("SpaceInvitations_emailIndex").on(table.invitedEmail)
    ]);
    UserMetadata = sqliteTable("UserMetadata", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull().unique(),
      highestSimpleNoteId: integer("highestSimpleNoteId").notNull().default(0),
      userColor: text("userColor").notNull().default("paper"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      email: text("email"),
      profileImageUrl: text("profileImageUrl"),
      clerkDataUpdatedAt: text("clerkDataUpdatedAt"),
      churchName: text("churchName"),
      churchCity: text("churchCity"),
      churchState: text("churchState"),
      churchCountry: text("churchCountry"),
      currentSeason: text("currentSeason"),
      lastMonthlyVisit: text("lastMonthlyVisit"),
      churchAddedAt: text("churchAddedAt"),
      referralBonusNotes: integer("referralBonusNotes").notNull().default(0),
      referralCode: text("referralCode").unique(),
      lockPinSalt: text("lockPinSalt"),
      lockPinHash: text("lockPinHash"),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    UserXP = sqliteTable("UserXP", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull(),
      activityType: text("activityType").notNull(),
      xpAmount: integer("xpAmount").notNull(),
      relatedId: text("relatedId"),
      season: text("season"),
      createdAt: text("createdAt").notNull(),
      metadata: text("metadata")
    });
    UserSeasonalXP = sqliteTable("UserSeasonalXP", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull(),
      season: text("season").notNull(),
      totalXP: integer("totalXP").notNull().default(0),
      sessionCount: integer("sessionCount").notNull().default(0),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    UserLifetimeXP = sqliteTable("UserLifetimeXP", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull().unique(),
      totalXP: integer("totalXP").notNull().default(0),
      lastUpdated: text("lastUpdated").notNull()
    });
    WeeklyStreaks = sqliteTable("WeeklyStreaks", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull(),
      weekStart: text("weekStart").notNull(),
      daysWithSessions: integer("daysWithSessions").notNull().default(0),
      xpAwarded: integer("xpAwarded").notNull().default(0),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    Tags = sqliteTable("Tags", {
      id: text("id").primaryKey(),
      name: text("name").notNull(),
      color: text("color"),
      category: text("category"),
      userId: text("userId").notNull(),
      isSystem: integer("isSystem", { mode: "boolean" }).notNull().default(false),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    NoteTags = sqliteTable("NoteTags", {
      id: text("id").primaryKey(),
      noteId: text("noteId").notNull(),
      tagId: text("tagId").notNull(),
      isAutoGenerated: integer("isAutoGenerated", { mode: "boolean" }).notNull().default(false),
      confidence: integer("confidence"),
      createdAt: text("createdAt").notNull()
    });
    ScriptureMetadata = sqliteTable("ScriptureMetadata", {
      id: text("id").primaryKey(),
      noteId: text("noteId").notNull(),
      reference: text("reference").notNull(),
      book: text("book").notNull(),
      chapter: integer("chapter").notNull(),
      verse: integer("verse").notNull(),
      verseEnd: integer("verseEnd"),
      translation: text("translation").notNull(),
      originalText: text("originalText").notNull(),
      createdAt: text("createdAt").notNull()
    });
    NoteScriptureReferences = sqliteTable("NoteScriptureReferences", {
      id: text("id").primaryKey(),
      noteId: text("noteId").notNull(),
      scriptureNoteId: text("scriptureNoteId").notNull(),
      createdAt: text("createdAt").notNull()
    }, (table) => [
      uniqueIndex("NoteScriptureReferences_uniqueNoteScripture").on(table.noteId, table.scriptureNoteId)
    ]);
    ResourceMetadata = sqliteTable("ResourceMetadata", {
      id: text("id").primaryKey(),
      noteId: text("noteId").notNull(),
      sourceUrl: text("sourceUrl").notNull(),
      sourceDomain: text("sourceDomain"),
      sourceName: text("sourceName"),
      sourceTitle: text("sourceTitle"),
      sourceDescription: text("sourceDescription"),
      sourceImage: text("sourceImage"),
      createdAt: text("createdAt").notNull()
    });
    InboxItems = sqliteTable("InboxItems", {
      id: text("id").primaryKey(),
      webflowItemId: text("webflowItemId").notNull().unique(),
      contentType: text("contentType").notNull(),
      title: text("title").notNull(),
      subtitle: text("subtitle"),
      content: text("content"),
      imageUrl: text("imageUrl"),
      color: text("color"),
      threadType: text("threadType"),
      targetAudience: text("targetAudience").notNull(),
      isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
    InboxItemNotes = sqliteTable("InboxItemNotes", {
      id: text("id").primaryKey(),
      inboxItemId: text("inboxItemId").notNull(),
      title: text("title"),
      content: text("content").notNull(),
      order: integer("order").notNull().default(0),
      createdAt: text("createdAt").notNull()
    });
    UserInboxItems = sqliteTable("UserInboxItems", {
      id: text("id").primaryKey(),
      userId: text("userId").notNull(),
      inboxItemId: text("inboxItemId").notNull(),
      status: text("status").notNull(),
      addedAt: text("addedAt"),
      archivedAt: text("archivedAt"),
      createdAt: text("createdAt").notNull()
    });
    MonthlyAnalytics = sqliteTable("MonthlyAnalytics", {
      id: text("id").primaryKey(),
      month: text("month").notNull(),
      bookName: text("bookName"),
      tagName: text("tagName"),
      category: text("category").notNull(),
      count: integer("count").notNull().default(0),
      createdAt: text("createdAt").notNull(),
      updatedAt: text("updatedAt")
    });
  }
});

// server/db/client.ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
function createDb() {
  const url = process.env.ASTRO_DB_REMOTE_URL;
  const authToken = process.env.ASTRO_DB_APP_TOKEN;
  if (!url) {
    throw new Error("Missing ASTRO_DB_REMOTE_URL environment variable");
  }
  if (!authToken) {
    throw new Error("Missing ASTRO_DB_APP_TOKEN environment variable");
  }
  const tursoClient = createClient({ url, authToken });
  return drizzle(tursoClient, { schema: schema_exports });
}
function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
var _db, db;
var init_client = __esm({
  "server/db/client.ts"() {
    "use strict";
    init_schema();
    _db = null;
    db = new Proxy({}, {
      get(_, prop) {
        return getDb()[prop];
      }
    });
  }
});

// server/db/dates.ts
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var init_dates = __esm({
  "server/db/dates.ts"() {
    "use strict";
  }
});

// server/db/index.ts
import {
  eq,
  ne,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  like,
  asc,
  desc,
  count,
  sum,
  avg,
  min,
  max,
  sql,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  between,
  exists,
  notExists
} from "drizzle-orm";
var init_db = __esm({
  "server/db/index.ts"() {
    "use strict";
    init_client();
    init_schema();
    init_dates();
  }
});

// src/utils/html-stripper.ts
var html_stripper_exports = {};
__export(html_stripper_exports, {
  stripHtml: () => stripHtml,
  stripHtmlForCard: () => stripHtmlForCard,
  stripHtmlForPreview: () => stripHtmlForPreview
});
function stripHtml(html, options = {}) {
  if (!html) return "";
  const { preserveSpacing = false, useDOM = false, maxLength } = options;
  if (useDOM && typeof document !== "undefined") {
    try {
      let extractTextWithSpacing2 = function(node) {
        let result = "";
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          const prevSibling = i > 0 ? node.childNodes[i - 1] : null;
          const nextSibling = i < node.childNodes.length - 1 ? node.childNodes[i + 1] : null;
          if (child.nodeType === Node.TEXT_NODE) {
            const text4 = (child.textContent || "").replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\r/g, " ");
            result += text4;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const element = child;
            const tagName = element.tagName;
            const isBlockElement = blockElements.includes(tagName);
            if (isBlockElement && prevSibling && prevSibling.nodeType === Node.ELEMENT_NODE) {
              const prevTagName = prevSibling.tagName;
              if (blockElements.includes(prevTagName)) {
                result += " ";
              }
            }
            if (tagName === "BR") {
              result += " ";
            } else if (tagName === "LI") {
              result += "\u2022 ";
              result += extractTextWithSpacing2(child);
            } else {
              const childText = extractTextWithSpacing2(child);
              if (!isBlockElement && childText.trim().length > 0) {
                if (prevSibling) {
                  if (prevSibling.nodeType === Node.TEXT_NODE) {
                    const prevText = (prevSibling.textContent || "").trim();
                    if (prevText.length > 0) {
                      result += " ";
                    }
                  } else if (prevSibling.nodeType === Node.ELEMENT_NODE) {
                    result += " ";
                  }
                }
                result += childText.trim();
                if (nextSibling) {
                  if (nextSibling.nodeType === Node.TEXT_NODE) {
                    const nextText = (nextSibling.textContent || "").trim();
                    if (nextText.length > 0) {
                      result += " ";
                    }
                  } else if (nextSibling.nodeType === Node.ELEMENT_NODE) {
                    result += " ";
                  }
                }
              } else {
                result += childText;
                if (isBlockElement) {
                  result += " ";
                }
              }
            }
          }
        }
        return result;
      };
      var extractTextWithSpacing = extractTextWithSpacing2;
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const blockElements = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "BLOCKQUOTE", "PRE"];
      let text3 = extractTextWithSpacing2(tempDiv);
      text3 = text3.replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\r/g, " ");
      text3 = text3.replace(/\s+/g, " ").trim();
      if (maxLength && text3.length > maxLength) {
        return text3.substring(0, maxLength) + "...";
      }
      return text3;
    } catch (error) {
      console.warn("DOM-based HTML stripping failed, falling back to regex:", error);
    }
  }
  let text2 = html;
  text2 = text2.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text2 = text2.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  if (preserveSpacing) {
    text2 = text2.replace(/\r\n/g, " ");
    text2 = text2.replace(/\n/g, " ");
    text2 = text2.replace(/\r/g, " ");
    text2 = text2.replace(/<br\s*\/?>/gi, " ");
    text2 = text2.replace(/([^\s>])(<span[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/span>)([^\s<])/gi, "$1 $2");
    text2 = text2.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, (match, content) => {
      const trimmedContent = content.trim();
      if (trimmedContent) {
        return ` ${trimmedContent} `;
      }
      return " ";
    });
    text2 = text2.replace(/(<\/p>)(<p[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/p>)(<div[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/div>)(<p[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/div>)(<div[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/h[1-6]>)(<p[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/h[1-6]>)(<div[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/p>)(<h[1-6][^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/div>)(<h[1-6][^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/(<\/li>)(<li[^>]*>)/gi, "$1 $2");
    text2 = text2.replace(/<\/p>/gi, " __SPACE__ ");
    text2 = text2.replace(/<\/div>/gi, " __SPACE__ ");
    text2 = text2.replace(/<\/li>/gi, " __SPACE__ ");
    text2 = text2.replace(/<\/h[1-6]>/gi, " __SPACE__ ");
    text2 = text2.replace(/<ol[^>]*>/gi, "");
    text2 = text2.replace(/<\/ol>/gi, " __SPACE__ ");
    text2 = text2.replace(/<li[^>]*>/gi, "\u2022 ");
    text2 = text2.replace(/<ul[^>]*>/gi, "");
    text2 = text2.replace(/<\/ul>/gi, " __SPACE__ ");
    text2 = text2.replace(/<p[^>]*>/gi, "");
    text2 = text2.replace(/<div[^>]*>/gi, "");
    text2 = text2.replace(/<h[1-6][^>]*>/gi, "");
    text2 = text2.replace(/<[^>]*>/g, "");
    text2 = text2.replace(/&nbsp;/g, " ");
    text2 = text2.replace(/&amp;/g, "&");
    text2 = text2.replace(/&lt;/g, "<");
    text2 = text2.replace(/&gt;/g, ">");
    text2 = text2.replace(/&quot;/g, '"');
    text2 = text2.replace(/&#39;/g, "'");
    text2 = text2.replace(/&#x27;/g, "'");
    text2 = text2.replace(/&#x2F;/g, "/");
    text2 = text2.replace(/&#x60;/g, "`");
    text2 = text2.replace(/&#x3D;/g, "=");
    text2 = text2.replace(/__SPACE__/g, " ");
    text2 = text2.replace(/\s+/g, " ");
    text2 = text2.trim();
  } else {
    text2 = text2.replace(/<[^>]*>/g, "");
    text2 = text2.replace(/&nbsp;/g, " ");
    text2 = text2.replace(/&amp;/g, "&");
    text2 = text2.replace(/&lt;/g, "<");
    text2 = text2.replace(/&gt;/g, ">");
    text2 = text2.replace(/&quot;/g, '"');
    text2 = text2.replace(/&#39;/g, "'");
    text2 = text2.replace(/&#x27;/g, "'");
    text2 = text2.replace(/&#x2F;/g, "/");
    text2 = text2.replace(/&#x60;/g, "`");
    text2 = text2.replace(/&#x3D;/g, "=");
    text2 = text2.replace(/\s+/g, " ");
    text2 = text2.trim();
  }
  if (maxLength && text2.length > maxLength) {
    return text2.substring(0, maxLength) + "...";
  }
  return text2;
}
function stripHtmlForPreview(html, maxLength = 150) {
  return stripHtml(html, { maxLength });
}
function stripHtmlForCard(html, useDOM = false) {
  return stripHtml(html, { preserveSpacing: true, useDOM });
}
var init_html_stripper = __esm({
  "src/utils/html-stripper.ts"() {
    "use strict";
  }
});

// server/utils/unorganized-thread.ts
var unorganized_thread_exports = {};
__export(unorganized_thread_exports, {
  ensureUnorganizedThread: () => ensureUnorganizedThread
});
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function retryDbOperation(operation, maxRetries = 3, baseDelay = 50) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if ((error.message?.includes("SQLITE_BUSY") || error.message?.includes("database is locked")) && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
async function ensureUnorganizedThread(userId) {
  try {
    const existingThread = await retryDbOperation(async () => {
      return await db.select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
        spaceId: Threads.spaceId,
        isPublic: Threads.isPublic,
        isPinned: Threads.isPinned,
        createdAt: Threads.createdAt,
        updatedAt: Threads.updatedAt
      }).from(Threads).where(and(
        eq(Threads.userId, userId),
        eq(Threads.id, "thread_unorganized")
      )).get();
    });
    if (!existingThread) {
      try {
        await retryDbOperation(async () => {
          await db.insert(Threads).values({
            id: "thread_unorganized",
            title: "Unorganized",
            subtitle: "Notes that haven't been organized into threads yet",
            spaceId: null,
            userId,
            isPublic: true,
            isPinned: false,
            color: null,
            createdAt: nowISO(),
            updatedAt: nowISO()
          });
        });
      } catch (insertError) {
        if (insertError.code === "SQLITE_CONSTRAINT" || insertError.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || insertError.rawCode === 1555 || insertError.message?.includes("UNIQUE constraint failed")) {
          const createdThread = await db.select({
            id: Threads.id,
            title: Threads.title,
            subtitle: Threads.subtitle,
            color: Threads.color,
            spaceId: Threads.spaceId,
            isPublic: Threads.isPublic,
            isPinned: Threads.isPinned,
            createdAt: Threads.createdAt,
            updatedAt: Threads.updatedAt
          }).from(Threads).where(and(eq(Threads.userId, userId), eq(Threads.id, "thread_unorganized"))).get();
          if (createdThread) {
          }
        } else {
          console.error("Error creating unorganized thread:", insertError);
          throw insertError;
        }
      }
    }
    const noteCount = await retryDbOperation(async () => {
      return await db.select({ count: count() }).from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id)
      )).get();
    });
    const threadData = {
      id: "thread_unorganized",
      title: "Unorganized",
      color: null,
      noteCount: noteCount?.count || 0,
      backgroundGradient: "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)"
    };
    return threadData;
  } catch (error) {
    console.error("Error in ensureUnorganizedThread:", error);
    return {
      id: "thread_unorganized",
      title: "Unorganized",
      color: null,
      noteCount: 0,
      backgroundGradient: "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)"
    };
  }
}
var init_unorganized_thread = __esm({
  "server/utils/unorganized-thread.ts"() {
    "use strict";
    init_db();
    init_dates();
  }
});

// src/utils/markdown-to-html.ts
import { marked } from "marked";
function markdownToHtml(markdown) {
  if (!markdown || markdown.trim() === "") {
    return "";
  }
  try {
    marked.setOptions({
      gfm: true,
      // GitHub Flavored Markdown
      breaks: false
      // Don't convert line breaks to <br>
    });
    const html = marked.parse(markdown);
    const cleaned = html.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  } catch (error) {
    console.error("Error converting Markdown to HTML:", error);
    return `<p>${markdown.replace(/\n/g, "<br>")}</p>`;
  }
}
var init_markdown_to_html = __esm({
  "src/utils/markdown-to-html.ts"() {
    "use strict";
  }
});

// src/utils/ids.ts
var ids_exports = {};
__export(ids_exports, {
  addContentToUserNotes: () => addContentToUserNotes,
  generateCommentId: () => generateCommentId,
  generateMemberId: () => generateMemberId,
  generateNoteId: () => generateNoteId,
  generateShareToken: () => generateShareToken,
  generateSpaceId: () => generateSpaceId,
  generateThreadId: () => generateThreadId,
  generateTimestampId: () => generateTimestampId,
  getNextSimpleNoteId: () => getNextSimpleNoteId,
  getPrefixFromId: () => getPrefixFromId,
  isValidId: () => isValidId,
  isValidShareToken: () => isValidShareToken
});
function generateTimestampId(prefix) {
  let timestamp = Date.now();
  if (timestamp <= lastTimestamp) {
    timestamp = lastTimestamp + 1;
  }
  lastTimestamp = timestamp;
  return `${prefix}_${timestamp}`;
}
function generateSpaceId() {
  return generateTimestampId("space");
}
function generateThreadId() {
  return generateTimestampId("thread");
}
function generateNoteId() {
  return generateTimestampId("note");
}
function generateCommentId() {
  return generateTimestampId("comment");
}
function getNextSimpleNoteId(existingNotes) {
  const existingNoteIds = existingNotes.filter((note) => note.noteId !== void 0).map((note) => note.noteId).sort((a, b) => a - b);
  return existingNoteIds.length > 0 ? Math.max(...existingNoteIds) + 1 : 1;
}
function addContentToUserNotes(content, existingNotes) {
  if (content.noteId !== void 0) {
    return content;
  }
  const nextSimpleNoteId = getNextSimpleNoteId(existingNotes);
  return {
    ...content,
    noteId: nextSimpleNoteId
  };
}
function generateMemberId() {
  return generateTimestampId("member");
}
function generateShareToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const length = 12;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}
function isValidShareToken(token) {
  return /^[A-Za-z0-9]{12}$/.test(token);
}
function getPrefixFromId(id) {
  return id.split("_")[0];
}
function isValidId(id) {
  return /^[a-z]+_\d+$/.test(id);
}
var lastTimestamp;
var init_ids = __esm({
  "src/utils/ids.ts"() {
    "use strict";
    lastTimestamp = 0;
  }
});

// src/utils/load-onboarding-notes.ts
var load_onboarding_notes_exports = {};
__export(load_onboarding_notes_exports, {
  loadOnboardingNotes: () => loadOnboardingNotes
});
import { readdirSync, readFileSync as readFileSync2 } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
function loadMarkdownFiles() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname2 = dirname(__filename);
    const onboardingDir = join(__dirname2, "..", "data", "onboarding");
    console.log("[loadOnboardingNotes] Looking for files in:", onboardingDir);
    const files = readdirSync(onboardingDir).filter((file) => file.endsWith(".md") && file !== "README.md").sort();
    console.log("[loadOnboardingNotes] Found files:", files);
    const modules = {};
    for (const file of files) {
      const filePath = join(onboardingDir, file);
      const content = readFileSync2(filePath, "utf-8");
      modules[`../data/onboarding/${file}`] = content;
      console.log(`[loadOnboardingNotes] Loaded file: ${file} (${content.length} chars)`);
    }
    return modules;
  } catch (error) {
    console.error("[loadOnboardingNotes] Error reading onboarding directory:", error);
    console.error("[loadOnboardingNotes] Error details:", {
      message: error.message,
      code: error.code,
      path: error.path,
      stack: error.stack
    });
    return {};
  }
}
function parseMarkdownNote(markdown, order) {
  const lines = markdown.split("\n");
  let title = "";
  let contentStartIndex = 0;
  if (lines[0].startsWith("# ")) {
    title = lines[0].substring(2).trim();
    contentStartIndex = 1;
  } else if (lines[0].startsWith("## ")) {
    title = lines[0].substring(3).trim();
    contentStartIndex = 1;
  } else {
    title = lines[0].trim();
    contentStartIndex = 1;
  }
  const contentMarkdown = lines.slice(contentStartIndex).join("\n").trim();
  const contentHtml = markdownToHtml(contentMarkdown);
  return {
    title,
    content: contentHtml,
    order
  };
}
function loadOnboardingNotes() {
  try {
    const notes = [];
    console.log("[loadOnboardingNotes] onboardingModules keys:", Object.keys(onboardingModules));
    console.log("[loadOnboardingNotes] Number of files:", Object.keys(onboardingModules).length);
    for (const [filePath, markdownContent] of Object.entries(onboardingModules)) {
      try {
        const fileName = filePath.split("/").pop() || "";
        const orderMatch = fileName.match(/^(\d+)-/);
        const order = orderMatch ? parseInt(orderMatch[1], 10) : notes.length + 1;
        const note = parseMarkdownNote(markdownContent, order);
        notes.push(note);
      } catch (error) {
        console.error(`[loadOnboardingNotes] Error processing onboarding file ${filePath}:`, error);
      }
    }
    console.log(`[loadOnboardingNotes] Successfully loaded ${notes.length} notes`);
    return notes.sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error("[loadOnboardingNotes] Error loading onboarding notes:", error);
    console.error("[loadOnboardingNotes] Error stack:", error.stack);
    return getDefaultOnboardingNotes();
  }
}
function getDefaultOnboardingNotes() {
  return [
    {
      title: "Welcome to Harvous",
      content: "<p>This is your first note! You can edit it, add it to threads, or delete it. Try clicking on this note to see more options.</p>",
      order: 1
    },
    {
      title: "Organize Your Notes",
      content: "<p>Create threads to organize your notes by topic, study, or theme. You can add notes to multiple threads.</p>",
      order: 2
    },
    {
      title: "Capture Scripture",
      content: "<p>When you reference Bible verses in your notes, Harvous automatically creates scripture notes that link together.</p>",
      order: 3
    }
  ];
}
var onboardingModules;
var init_load_onboarding_notes = __esm({
  "src/utils/load-onboarding-notes.ts"() {
    "use strict";
    init_markdown_to_html();
    onboardingModules = loadMarkdownFiles();
  }
});

// server/netlify.ts
import { handle } from "hono/netlify";

// server/app.ts
import { Hono as Hono23 } from "hono";
import { cors } from "hono/cors";

// server/middleware/auth.ts
import { verifyToken } from "@clerk/backend";
var PUBLIC_PREFIXES = [
  "/api/shared/",
  "/api/og/",
  "/api/debug/",
  "/api/webflow/",
  "/api/migrations/",
  "/api/test/"
];
var PUBLIC_EXACT = [
  "/api/health",
  "/api/webhooks/clerk",
  "/api/seed-marketing",
  "/api/stats/user-count"
];
function isPublicRoute(path) {
  if (PUBLIC_EXACT.includes(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}
var NULL_AUTH = {
  userId: null,
  has: () => false
};
function getSessionToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? match[1] : null;
}
async function clerkAuth(c, next) {
  if (isPublicRoute(c.req.path)) {
    c.set("auth", NULL_AUTH);
    return next();
  }
  const sessionToken = getSessionToken(c.req.header("Cookie"));
  const bearerToken = c.req.header("Authorization")?.replace("Bearer ", "");
  const token = sessionToken || bearerToken;
  if (!token) {
    c.set("auth", NULL_AUTH);
    return next();
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("[auth] Missing CLERK_SECRET_KEY");
    c.set("auth", NULL_AUTH);
    return next();
  }
  try {
    const payload = await verifyToken(token, { secretKey });
    const auth = {
      userId: payload.sub,
      has: (check) => {
        const fea = payload.fea;
        if (!fea) return false;
        if (typeof fea === "string") {
          return fea.split(",").includes(check.feature);
        }
        if (Array.isArray(fea)) {
          return fea.includes(check.feature);
        }
        return false;
      }
    };
    c.set("auth", auth);
  } catch (err) {
    c.set("auth", NULL_AUTH);
  }
  return next();
}
function getAuth(c) {
  return c.get("auth");
}

// server/routes/health.ts
import { Hono } from "hono";
var route = new Hono();
route.get("/api/health", (c) => {
  return c.json(
    { status: "ok", timestamp: Date.now() },
    200,
    { "Cache-Control": "no-store, no-cache, must-revalidate" }
  );
});
var health_default = route;

// server/routes/navigation.ts
import { Hono as Hono2 } from "hono";

// server/utils/dashboard-data.ts
init_db();
init_dates();

// src/utils/colors.ts
var THREAD_COLORS = [
  "paper",
  // var(--color-paper)
  "blue",
  // var(--color-blue)
  "yellow",
  // var(--color-yellow)
  "orange",
  // var(--color-orange)
  "pink",
  // var(--color-pink)
  "purple",
  // var(--color-purple)
  "green"
  // var(--color-green)
];
function getThreadColorCSS(color) {
  if (!color) return "var(--color-paper)";
  const colorMap = {
    "paper": "var(--color-paper)",
    "blue": "var(--color-blue)",
    "yellow": "var(--color-yellow)",
    "green": "var(--color-green)",
    "pink": "var(--color-pink)",
    "orange": "var(--color-orange)",
    "purple": "var(--color-purple)"
  };
  return colorMap[color] || "var(--color-paper)";
}
function getThreadGradientCSS(color) {
  const baseColor = getThreadColorCSS(color);
  return `linear-gradient(180deg, ${baseColor} 0%, ${baseColor} 100%)`;
}
function getRandomThreadColor() {
  const randomIndex = Math.floor(Math.random() * THREAD_COLORS.length);
  return THREAD_COLORS[randomIndex];
}

// server/utils/inbox-data.ts
init_db();
import { asc as asc2 } from "drizzle-orm";
async function getInboxItemWithNotes(inboxItemId) {
  try {
    const [inboxItem, notes] = await Promise.all([
      db.select().from(InboxItems).where(eq(InboxItems.id, inboxItemId)).get(),
      // Pre-fetch notes (will be empty array if not a thread, but avoids conditional query)
      db.select().from(InboxItemNotes).where(eq(InboxItemNotes.inboxItemId, inboxItemId)).orderBy(asc2(InboxItemNotes.order)).all()
    ]);
    if (!inboxItem) {
      return null;
    }
    return {
      ...inboxItem,
      notes: inboxItem.contentType === "thread" ? notes : []
    };
  } catch (error) {
    console.error("Error fetching inbox item with notes:", error);
    return null;
  }
}
async function getInboxCount(userId) {
  try {
    const result = await db.select({ count: UserInboxItems.id }).from(UserInboxItems).innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id)).where(
      and(
        eq(UserInboxItems.userId, userId),
        eq(UserInboxItems.status, "inbox"),
        eq(InboxItems.isActive, true)
      )
    );
    return result.length;
  } catch (error) {
    console.error("Error fetching inbox count:", error);
    return 0;
  }
}

// src/utils/sorting.ts
function normalizeDate(date) {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === "string") {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
function sortByLastVisited(items) {
  return [...items].sort((a, b) => {
    const aHasLastVisited = a.lastVisited != null && normalizeDate(a.lastVisited) != null;
    const bHasLastVisited = b.lastVisited != null && normalizeDate(b.lastVisited) != null;
    if (aHasLastVisited && !bHasLastVisited) return -1;
    if (!aHasLastVisited && bHasLastVisited) return 1;
    const getEffectiveSortTime = (item, hasLastVisited) => {
      if (hasLastVisited && item.lastVisited) {
        const date = normalizeDate(item.lastVisited);
        if (date) return date.getTime();
      }
      if (item.updatedAt) {
        const date = normalizeDate(item.updatedAt);
        if (date) return date.getTime();
      }
      if (item.createdAt) {
        const date = normalizeDate(item.createdAt);
        if (date) return date.getTime();
      }
      return 0;
    };
    const aTime = getEffectiveSortTime(a, aHasLastVisited);
    const bTime = getEffectiveSortTime(b, bHasLastVisited);
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    if (aTime > 0 && bTime === 0) return -1;
    if (aTime === 0 && bTime > 0) return 1;
    const aUpdated = a.updatedAt ? normalizeDate(a.updatedAt)?.getTime() || 0 : 0;
    const bUpdated = b.updatedAt ? normalizeDate(b.updatedAt)?.getTime() || 0 : 0;
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
    }
    const aCreated = a.createdAt ? normalizeDate(a.createdAt)?.getTime() || 0 : 0;
    const bCreated = b.createdAt ? normalizeDate(b.createdAt)?.getTime() || 0 : 0;
    if (aCreated !== bCreated) {
      return bCreated - aCreated;
    }
    const aId = a.id || "";
    const bId = b.id || "";
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

// server/utils/dashboard-data.ts
init_html_stripper();
async function findUnorganizedThread(userId) {
  try {
    const unorganizedThread = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt
    }).from(Threads).where(and(
      eq(Threads.userId, userId),
      eq(Threads.id, "thread_unorganized")
    )).get();
    if (unorganizedThread) {
      return unorganizedThread;
    }
    try {
      const newUnorganizedThread = await db.insert(Threads).values({
        id: "thread_unorganized",
        title: "Unorganized",
        subtitle: "Notes that haven't been organized into threads yet",
        spaceId: null,
        userId,
        isPublic: true,
        isPinned: false,
        color: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
      }).returning().get();
      return newUnorganizedThread;
    } catch (createError2) {
      if (createError2.code === "SQLITE_CONSTRAINT" || createError2.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || createError2.rawCode === 1555 || createError2.message?.includes("UNIQUE constraint failed")) {
        const existingThread = await db.select({
          id: Threads.id,
          title: Threads.title,
          subtitle: Threads.subtitle,
          color: Threads.color,
          spaceId: Threads.spaceId,
          isPublic: Threads.isPublic,
          isPinned: Threads.isPinned,
          createdAt: Threads.createdAt,
          updatedAt: Threads.updatedAt
        }).from(Threads).where(and(
          eq(Threads.userId, userId),
          eq(Threads.id, "thread_unorganized")
        )).get();
        return existingThread;
      }
      throw createError2;
    }
  } catch (error) {
    console.error("Error finding/creating unorganized thread:", error);
    return null;
  }
}
async function getSpaceMemberCount(spaceId) {
  const members = await db.select().from(Members).where(eq(Members.spaceId, spaceId)).all();
  return members.length;
}
async function getAllThreadsWithCounts(userId) {
  try {
    const threads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(and(
      eq(Threads.userId, userId),
      ne(Threads.id, "thread_unorganized")
    )).orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    ).all();
    const threadIds = threads.map((thread) => thread.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({
        threadId: NoteThreads.threadId,
        count: count()
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(
        inArray(NoteThreads.threadId, threadIds),
        eq(Notes.userId, userId)
      )).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    const threadsWithCounts = threads.map((thread) => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0
    }));
    return threadsWithCounts.map((thread) => ({
      id: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      color: thread.color,
      spaceId: thread.spaceId,
      isPublic: thread.isPublic,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastVisited: thread.lastVisited,
      noteCount: thread.noteCount || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color)
    }));
  } catch (error) {
    console.error("Error fetching threads:", error);
    return [];
  }
}
async function getSpacesWithCounts(userId) {
  try {
    const spacesWithThreadCounts = await db.select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      backgroundGradient: Spaces.backgroundGradient,
      isPublic: Spaces.isPublic,
      isActive: Spaces.isActive,
      createdAt: Spaces.createdAt,
      updatedAt: Spaces.updatedAt,
      lastVisited: Spaces.lastVisited,
      threadCount: count(Threads.id)
    }).from(Spaces).leftJoin(Threads, eq(Spaces.id, Threads.spaceId)).where(eq(Spaces.userId, userId)).groupBy(Spaces.id).orderBy(
      desc(Spaces.isActive),
      asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Spaces.lastVisited),
      desc(Spaces.updatedAt),
      desc(Spaces.createdAt)
    ).all();
    const standaloneNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      standaloneNoteCount: count(Notes.id)
    }).from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(
      eq(Notes.userId, userId),
      isNull(NoteThreads.id),
      isNotNull(Notes.spaceId)
    )).groupBy(Notes.spaceId).all();
    const totalNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      totalNoteCount: count(Notes.id)
    }).from(Notes).where(and(
      eq(Notes.userId, userId),
      isNotNull(Notes.spaceId)
    )).groupBy(Notes.spaceId).all();
    const standaloneCountMap = new Map(standaloneNoteCounts.map((item) => [item.spaceId, item.standaloneNoteCount]));
    const totalCountMap = new Map(totalNoteCounts.map((item) => [item.spaceId, item.totalNoteCount]));
    return spacesWithThreadCounts.map((space) => ({
      id: space.id,
      title: space.title,
      description: space.description,
      color: space.color,
      backgroundGradient: space.backgroundGradient,
      isPublic: space.isPublic,
      isActive: space.isActive,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      lastVisited: space.lastVisited,
      threadCount: space.threadCount || 0,
      standaloneNoteCount: standaloneCountMap.get(space.id) || 0,
      totalItemCount: (space.threadCount || 0) + (totalCountMap.get(space.id) || 0),
      totalNoteCount: totalCountMap.get(space.id) || 0,
      lastUpdated: space.lastVisited || space.updatedAt || space.createdAt
    }));
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return [];
  }
}
async function getMemberOfSpaces(userId) {
  try {
    const memberships = await db.select({ spaceId: Members.spaceId }).from(Members).where(eq(Members.userId, userId)).all();
    const ownedSpaceIds = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId)).all();
    const ownedSet = new Set(ownedSpaceIds.map((r) => r.id));
    const memberOf = [];
    for (const m of memberships) {
      if (ownedSet.has(m.spaceId)) continue;
      const spaceRow = await db.select({ id: Spaces.id, title: Spaces.title, color: Spaces.color }).from(Spaces).where(eq(Spaces.id, m.spaceId)).get();
      if (spaceRow) {
        const memberCount = await getSpaceMemberCount(spaceRow.id);
        memberOf.push({ id: spaceRow.id, title: spaceRow.title, color: spaceRow.color, memberCount });
      }
    }
    return memberOf;
  } catch (error) {
    console.error("Error fetching member-of spaces:", error);
    return [];
  }
}
async function getInboxDisplayCount(userId) {
  try {
    return await getInboxCount(userId);
  } catch (error) {
    console.error("Error fetching inbox display count:", error);
    return 0;
  }
}
async function getThreadWithCount(threadId, userId) {
  try {
    const thread = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      userId: Threads.userId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, userId))).get();
    if (!thread) return null;
    const noteCountResult = await db.select({ count: count() }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId))).get();
    const noteCount = noteCountResult?.count || 0;
    return {
      ...thread,
      noteCount,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color)
    };
  } catch (error) {
    console.error("Error fetching thread with count:", error);
    return null;
  }
}
async function getThreadsWithCountsLimited(userId, limit) {
  try {
    const baseQuery = db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(and(eq(Threads.userId, userId), ne(Threads.id, "thread_unorganized"))).orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    );
    const threads = limit != null ? await baseQuery.limit(limit).all() : await baseQuery.all();
    const threadIds = threads.map((t) => t.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId))).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    return threads.map((thread) => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color)
    }));
  } catch (error) {
    console.error("Error fetching threads:", error);
    return [];
  }
}
async function getThreadColorsForNotesBatch(noteIds, userId) {
  if (noteIds.length === 0) return /* @__PURE__ */ new Map();
  try {
    const allNoteThreads = await db.select({
      noteId: NoteThreads.noteId,
      threadId: NoteThreads.threadId,
      color: Threads.color
    }).from(NoteThreads).innerJoin(Threads, eq(NoteThreads.threadId, Threads.id)).where(and(inArray(NoteThreads.noteId, noteIds), eq(Threads.userId, userId), ne(Threads.id, "thread_unorganized"))).all();
    const noteColorMap = /* @__PURE__ */ new Map();
    for (const nt of allNoteThreads) {
      if (nt.color) {
        if (!noteColorMap.has(nt.noteId)) noteColorMap.set(nt.noteId, /* @__PURE__ */ new Map());
        const colorMap = noteColorMap.get(nt.noteId);
        colorMap.set(nt.color, (colorMap.get(nt.color) || 0) + 1);
      }
    }
    const result = /* @__PURE__ */ new Map();
    for (const [noteId, colorMap] of noteColorMap.entries()) {
      result.set(noteId, Array.from(colorMap.entries()).map(([color, frequency]) => ({ color, frequency })));
    }
    return result;
  } catch (error) {
    console.error("Error batch fetching thread colors for notes:", error);
    return /* @__PURE__ */ new Map();
  }
}
async function getThreadColorsForNotesAsRecord(noteIds, userId) {
  const mapResult = await getThreadColorsForNotesBatch(noteIds, userId);
  const record = {};
  for (const [noteId, colors] of mapResult.entries()) record[noteId] = colors;
  return record;
}
async function getThreadNoteTypeCounts(threadId, userId) {
  try {
    let allCount = 0, defaultCount = 0, scriptureCount = 0, resourceCount = 0;
    if (threadId === "thread_unorganized") {
      const allNotes = await db.select({ id: Notes.id, noteType: Notes.noteType }).from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(Notes.userId, userId), isNull(NoteThreads.id))).all();
      allCount = allNotes.length;
      defaultCount = allNotes.filter((n) => !n.noteType || n.noteType === "default").length;
      scriptureCount = allNotes.filter((n) => n.noteType === "scripture").length;
      resourceCount = allNotes.filter((n) => n.noteType === "resource").length;
    } else {
      const allNotes = await db.select({ id: Notes.id, noteType: Notes.noteType }).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId))).all();
      allCount = allNotes.length;
      defaultCount = allNotes.filter((n) => !n.noteType || n.noteType === "default").length;
      scriptureCount = allNotes.filter((n) => n.noteType === "scripture").length;
      resourceCount = allNotes.filter((n) => n.noteType === "resource").length;
    }
    return { all: allCount, default: defaultCount, scripture: scriptureCount, resource: resourceCount };
  } catch (error) {
    console.error("Error fetching note type counts for thread:", error);
    return { all: 0, default: 0, scripture: 0, resource: 0 };
  }
}
var NOTE_SELECT_COLUMNS = {
  id: Notes.id,
  title: Notes.title,
  content: Notes.content,
  contentEncrypted: Notes.contentEncrypted,
  threadId: Notes.threadId,
  spaceId: Notes.spaceId,
  simpleNoteId: Notes.simpleNoteId,
  noteType: Notes.noteType,
  isPublic: Notes.isPublic,
  isFeatured: Notes.isFeatured,
  createdAt: Notes.createdAt,
  updatedAt: Notes.updatedAt,
  lastVisited: Notes.lastVisited
};
async function getNotesForThread(threadId, userId, limit = 20, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    let allNotes = [];
    if (threadId === "thread_unorganized") {
      const unorganizedNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(Notes.userId, userId), isNull(NoteThreads.id))).orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      ).limit(fetchLimit).all();
      const unorganizedNoteIds = unorganizedNotes.map((n) => n.id).filter(Boolean);
      let referencedScriptureNotes = [];
      if (unorganizedNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id)).where(and(inArray(NoteScriptureReferences.noteId, unorganizedNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
        const uniqueIds = [...new Set(refs.map((r) => r.scriptureNoteId))];
        const alreadyIds = new Set(unorganizedNotes.filter((n) => n.noteType === "scripture").map((n) => n.id));
        const additionalIds = uniqueIds.filter((id) => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
        }
      }
      const notesMap = /* @__PURE__ */ new Map();
      [...unorganizedNotes, ...referencedScriptureNotes].forEach((n) => {
        if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n);
      });
      allNotes = Array.from(notesMap.values());
    } else {
      const junctionNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId))).orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      ).limit(fetchLimit).all();
      const threadNoteIds = junctionNotes.map((n) => n.id).filter(Boolean);
      let referencedScriptureNotes = [];
      if (threadNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id)).where(and(inArray(NoteScriptureReferences.noteId, threadNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
        const uniqueIds = [...new Set(refs.map((r) => r.scriptureNoteId))];
        const alreadyIds = new Set(junctionNotes.filter((n) => n.noteType === "scripture").map((n) => n.id));
        const additionalIds = uniqueIds.filter((id) => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
        }
      }
      const notesMap = /* @__PURE__ */ new Map();
      [...junctionNotes, ...referencedScriptureNotes].forEach((n) => {
        if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n);
      });
      allNotes = Array.from(notesMap.values());
    }
    const isOnboardingThread = threadId.startsWith("thread_onboarding_");
    const sortedAllNotes = isOnboardingThread ? allNotes.map((note) => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || "" })).sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    }) : sortByLastVisited(allNotes.map((note) => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || "" })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);
    const resourceNoteIds = sortedNotes.filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {
      }
    }
    const noteIds = sortedNotes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    const notesWithThreadColors = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : void 0
      };
    });
    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for thread:", error);
    return [];
  }
}
async function getNotesForThreadForMember(threadId, ownerUserId, limit = 100, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    const junctionNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, threadId), eq(Notes.contentEncrypted, false))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(fetchLimit).all();
    const sortedAllNotes = sortByLastVisited(junctionNotes.map((note) => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id || ""
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);
    const resourceNoteIds = sortedNotes.filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {
      }
    }
    const noteIds = sortedNotes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, ownerUserId);
    const notesWithThreadColors = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : void 0
      };
    });
    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for thread (member):", error);
    return { notes: [], hasMore: false };
  }
}
async function getUnorganizedNotesForDashboard(userId, limit = 10) {
  try {
    const notes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(Notes.userId, userId), isNull(NoteThreads.id))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(limit).all();
    const noteIds = notes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    return notes.map((note) => ({
      ...note,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
      threadColors: (threadColorsMap.get(note.id) ?? []).length > 0 ? threadColorsMap.get(note.id) : void 0
    }));
  } catch (error) {
    console.error("Error fetching unorganized notes:", error);
    return [];
  }
}
async function getAssignedNotesForDashboard(userId, limit = 10) {
  try {
    const unorganizedThread = await findUnorganizedThread(userId);
    const whereClause = unorganizedThread ? and(eq(Notes.userId, userId), ne(Notes.threadId, unorganizedThread.id)) : eq(Notes.userId, userId);
    const notes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(whereClause).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(limit).all();
    const noteIds = notes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    return notes.map((note) => ({
      ...note,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
      threadColors: (threadColorsMap.get(note.id) ?? []).length > 0 ? threadColorsMap.get(note.id) : void 0
    }));
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}
async function getContentItems(userId, limit = 20, offset = 0, filterExcludeReferencedScripture = false, threads) {
  try {
    const fetchLimit = limit + offset;
    const threadLimit = Math.min(fetchLimit + 50, 500);
    const [threadsData, assignedNotesRaw, unorganizedNotesRaw] = await Promise.all([
      threads && Array.isArray(threads) ? Promise.resolve(threads) : getThreadsWithCountsLimited(userId, threadLimit),
      getAssignedNotesForDashboard(userId, fetchLimit),
      getUnorganizedNotesForDashboard(userId, fetchLimit)
    ]);
    const threadsToUse = Array.isArray(threadsData) ? threadsData : [];
    let assignedNotes = assignedNotesRaw;
    let unorganizedNotes = unorganizedNotesRaw;
    const threadItems = threadsToUse.map((thread) => ({
      id: thread.id,
      type: "thread",
      title: thread.title,
      subtitle: `${thread.noteCount} notes`,
      count: thread.noteCount,
      threadId: thread.id,
      spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated,
      updatedAt: thread.updatedAt || thread.createdAt,
      lastVisited: thread.lastVisited || null,
      createdAt: thread.createdAt,
      isPrivate: !thread.isPublic,
      accentColor: thread.accentColor,
      color: thread.color
    }));
    const resourceNoteIds = [...assignedNotes, ...unorganizedNotes].filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc, meta) => {
          acc[meta.noteId] = meta;
          return acc;
        }, {});
      } catch (_) {
      }
    }
    let scriptureReferencesMap = {};
    const defaultNoteIds = [...assignedNotes, ...unorganizedNotes].filter((n) => n.noteType === "default" || !n.noteType).map((n) => n.id);
    if (defaultNoteIds.length > 0) {
      try {
        const junctionEntries = await db.select({
          noteId: NoteScriptureReferences.noteId,
          scriptureNoteId: NoteScriptureReferences.scriptureNoteId
        }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id)).where(and(inArray(NoteScriptureReferences.noteId, defaultNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
        const scriptureNoteIds = [...new Set(junctionEntries.map((e) => e.scriptureNoteId))];
        let scriptureMetadataMap = {};
        if (scriptureNoteIds.length > 0) {
          const sm = await db.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference }).from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds)).all();
          scriptureMetadataMap = sm.reduce((acc, m) => {
            acc[m.noteId] = m.reference;
            return acc;
          }, {});
        }
        const scriptureNoteIdsArray = scriptureNoteIds.filter(Boolean);
        const scriptureThreadColorsBatchMap = scriptureNoteIdsArray.length > 0 ? await getThreadColorsForNotesBatch(scriptureNoteIdsArray, userId) : /* @__PURE__ */ new Map();
        for (const entry of junctionEntries) {
          const reference = scriptureMetadataMap[entry.scriptureNoteId];
          if (reference) {
            if (!scriptureReferencesMap[entry.noteId]) scriptureReferencesMap[entry.noteId] = [];
            if (!scriptureReferencesMap[entry.noteId].some((r) => r.noteId === entry.scriptureNoteId)) {
              scriptureReferencesMap[entry.noteId].push({
                reference,
                noteId: entry.scriptureNoteId,
                threadColors: scriptureThreadColorsBatchMap.get(entry.scriptureNoteId) ?? void 0
              });
            }
          }
        }
        if (filterExcludeReferencedScripture) {
          const referencedScriptureNoteIds = new Set(junctionEntries.map((e) => e.scriptureNoteId));
          assignedNotes = assignedNotes.filter((note) => {
            if (note.noteType !== "scripture") return true;
            if (!referencedScriptureNoteIds.has(note.id)) return true;
            return note.lastVisited != null;
          });
          unorganizedNotes = unorganizedNotes.filter((note) => {
            if (note.noteType !== "scripture") return true;
            if (!referencedScriptureNoteIds.has(note.id)) return true;
            return note.lastVisited != null;
          });
        }
      } catch (error) {
        console.error("Error fetching scripture references:", error);
      }
    }
    const mapNote = (note) => {
      const cleanContent = stripHtml(note.content);
      const resourceMeta = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      const isEncrypted = note.contentEncrypted === true;
      return {
        id: note.id,
        type: "note",
        title: resourceMeta?.sourceTitle || note.title || "Untitled Note",
        content: isEncrypted ? "" : (resourceMeta?.sourceDescription || cleanContent).substring(0, 150) + ((resourceMeta?.sourceDescription || cleanContent).length > 150 ? "..." : ""),
        contentEncrypted: isEncrypted,
        noteId: note.id,
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || "default",
        lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited || null,
        createdAt: note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: note.threadColors,
        scriptureReferences: scriptureReferencesMap[note.id] || void 0
      };
    };
    const allItemsMap = /* @__PURE__ */ new Map();
    threadItems.forEach((item) => allItemsMap.set(item.id, item));
    assignedNotes.map(mapNote).forEach((item) => {
      if (!allItemsMap.has(item.id)) allItemsMap.set(item.id, item);
    });
    unorganizedNotes.map(mapNote).forEach((item) => {
      if (!allItemsMap.has(item.id)) allItemsMap.set(item.id, item);
    });
    return sortByLastVisited(Array.from(allItemsMap.values())).slice(offset, offset + limit);
  } catch (error) {
    console.error("Error fetching content items:", error);
    return [];
  }
}
async function getReferencedScriptureNotesWithoutLastVisited(userId) {
  try {
    const junctionEntries = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id)).where(and(eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).all();
    const referencedIds = [...new Set(junctionEntries.map((e) => e.scriptureNoteId))];
    if (referencedIds.length === 0) return [];
    const notes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(and(inArray(Notes.id, referencedIds), eq(Notes.userId, userId), eq(Notes.noteType, "scripture"), isNull(Notes.lastVisited))).all();
    if (notes.length === 0) return [];
    const noteIds = notes.map((n) => n.id);
    const threadColorsMap = await getThreadColorsForNotesAsRecord(noteIds, userId);
    return notes.map((note) => {
      const cleanContent = stripHtml(note.content);
      return {
        id: note.id,
        type: "note",
        title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id,
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || "scripture",
        lastUpdated: note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt,
        lastVisited: null,
        createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || void 0
      };
    });
  } catch (error) {
    console.error("Error fetching referenced scripture notes without lastVisited:", error);
    return [];
  }
}
async function getScriptureNotesForDashboard(userId, limit = 20, offset = 0) {
  try {
    const fetchLimit = limit + 1;
    const notes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(and(eq(Notes.userId, userId), eq(Notes.noteType, "scripture"))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(fetchLimit).offset(offset).all();
    const sortedNotes = sortByLastVisited(notes.map((n) => ({ ...n, updatedAt: n.updatedAt || n.createdAt, id: n.id || "" })));
    const limitedNotes = sortedNotes.slice(0, limit);
    const noteIds = limitedNotes.map((n) => n.id);
    const threadColorsMap = await getThreadColorsForNotesAsRecord(noteIds, userId);
    const noteItems = limitedNotes.map((note) => {
      const cleanContent = stripHtml(note.content);
      return {
        id: note.id,
        type: "note",
        title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id,
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || "scripture",
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || void 0
      };
    });
    return { items: noteItems, hasMore: sortedNotes.length > limit };
  } catch (error) {
    console.error("Error fetching scripture notes:", error);
    return { items: [], hasMore: false };
  }
}
async function getThreadsForSpace(spaceId, userId) {
  try {
    const threads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId))).orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    ).all();
    const threadIds = threads.map((t) => t.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId))).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    return threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      color: thread.color,
      spaceId: thread.spaceId,
      isPublic: thread.isPublic,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastVisited: thread.lastVisited,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color)
    }));
  } catch (error) {
    console.error("Error fetching threads for space:", error);
    return [];
  }
}
async function getThreadsForSpaceBySpaceId(spaceId) {
  try {
    const threads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      userId: Threads.userId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(eq(Threads.spaceId, spaceId)).orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    ).all();
    const threadIds = threads.map((t) => t.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() }).from(NoteThreads).where(inArray(NoteThreads.threadId, threadIds)).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    return threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      color: thread.color,
      spaceId: thread.spaceId,
      userId: thread.userId,
      isPublic: thread.isPublic,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastVisited: thread.lastVisited,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color)
    }));
  } catch (error) {
    console.error("Error fetching threads for space by spaceId:", error);
    return [];
  }
}
async function getNotesForSpace(spaceId, userId, limit = 20, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    const allNotes = await db.select(NOTE_SELECT_COLUMNS).from(Notes).where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(fetchLimit).all();
    const sortedAllNotes = sortByLastVisited(allNotes.map((note) => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id || ""
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);
    const resourceNoteIds = sortedNotes.filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {
      }
    }
    const noteIds = sortedNotes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    const notesWithMeta = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : void 0
      };
    });
    return { notes: notesWithMeta, hasMore };
  } catch (error) {
    console.error("Error fetching notes for space:", error);
    return { notes: [], hasMore: false };
  }
}
async function getNotesForSpaceForMember(spaceId, ownerUserId, limit = 100, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    const allNotes = await db.select({
      ...NOTE_SELECT_COLUMNS,
      userId: Notes.userId
    }).from(Notes).where(and(eq(Notes.spaceId, spaceId), eq(Notes.contentEncrypted, false))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(fetchLimit).all();
    const sortedAllNotes = sortByLastVisited(allNotes.map((note) => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id || ""
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);
    const resourceNoteIds = sortedNotes.filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {
      }
    }
    const noteIds = sortedNotes.map((n) => n.id).filter(Boolean);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, ownerUserId);
    const notesWithMeta = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : void 0
      };
    });
    return { notes: notesWithMeta, hasMore };
  } catch (error) {
    console.error("Error fetching notes for space (member view):", error);
    return { notes: [], hasMore: false };
  }
}

// src/utils/error-handling.ts
function createError(message, code, context) {
  return {
    message,
    code,
    context,
    timestamp: Date.now()
  };
}
function handleAPIError(error, context) {
  let errorMessage = "An unexpected error occurred";
  let errorCode;
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else if (error && typeof error === "object" && "message" in error) {
    const errorObj = error;
    errorMessage = String(errorObj.message || "An unexpected error occurred");
    errorCode = errorObj.code;
  }
  const standardError = createError(errorMessage, errorCode, context);
  console.error("API Error:", standardError);
  if (typeof window !== "undefined" && window.posthog) {
    try {
      window.posthog.capture("error_occurred", {
        error_message: errorMessage,
        error_code: errorCode,
        ...context
      });
    } catch (posthogError) {
      console.warn("Failed to track error in PostHog:", posthogError);
    }
  }
  return standardError;
}

// server/routes/navigation.ts
init_unorganized_thread();
var route2 = new Hono2();
route2.get("/api/navigation/data", async (c) => {
  try {
    const auth = getAuth(c);
    const { userId } = auth;
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const [threads, spaces, inboxCount, unorganizedThreadData, memberSpaces] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getSpacesWithCounts(userId),
      getInboxDisplayCount(userId),
      ensureUnorganizedThread(userId),
      getMemberOfSpaces(userId)
    ]);
    const threadsWithGradients = threads.map((thread) => ({
      ...thread,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || "blue")
    }));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    threadsWithGradients.push({
      id: "thread_unorganized",
      title: "Unorganized",
      subtitle: "Notes that haven't been organized into threads yet",
      color: null,
      spaceId: null,
      isPublic: true,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      lastVisited: null,
      noteCount: unorganizedThreadData.noteCount || 0,
      lastUpdated: now,
      accentColor: getThreadGradientCSS("paper"),
      backgroundGradient: unorganizedThreadData.backgroundGradient || getThreadGradientCSS("paper")
    });
    const spacesWithGradients = spaces.map((space) => ({
      ...space,
      backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || "paper")
    }));
    const memberSpacesWithGradients = memberSpaces.map((space) => ({
      ...space,
      totalItemCount: 0,
      backgroundGradient: getThreadGradientCSS(space.color || "paper")
    }));
    return c.json(
      {
        threads: threadsWithGradients,
        spaces: spacesWithGradients,
        memberOfSpaces: memberSpacesWithGradients,
        inboxCount
      },
      200,
      { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" }
    );
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: "/api/navigation/data",
      action: "get_navigation_data"
    });
    return c.json(
      { error: standardError.message, code: standardError.code },
      500
    );
  }
});
var navigation_default = route2;

// server/routes/debug.ts
import { Hono as Hono3 } from "hono";
var route3 = new Hono3();
route3.get("/api/debug/request-headers", (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.body(null, 404);
  }
  const headers = c.req.raw.headers;
  const userAgent = headers.get("User-Agent") ?? headers.get("user-agent") ?? null;
  const xForwardedUserAgent = headers.get("x-forwarded-user-agent") ?? headers.get("X-Forwarded-User-Agent") ?? null;
  return c.json(
    {
      userAgent,
      userAgentLower: headers.get("user-agent") ?? null,
      xForwardedUserAgent,
      xForwardedUserAgentCaps: headers.get("X-Forwarded-User-Agent") ?? null,
      hasAnyUA: !!(userAgent || xForwardedUserAgent)
    },
    200,
    { "Cache-Control": "no-store" }
  );
});
var debug_default = route3;

// server/routes/about.ts
init_markdown_to_html();
import { Hono as Hono4 } from "hono";
import { readFileSync } from "fs";
import { resolve } from "path";
var founderLetterMarkdown = readFileSync(
  resolve(import.meta.dirname || __dirname, "../../src/data/about/founder-letter.md"),
  "utf-8"
);
var route4 = new Hono4();
route4.get("/api/about/founder-letter", (c) => {
  const html = markdownToHtml(founderLetterMarkdown);
  return c.json(
    { html },
    200,
    { "Cache-Control": "public, max-age=86400" }
  );
});
var about_default = route4;

// server/routes/og.ts
import { Hono as Hono5 } from "hono";
var route5 = new Hono5();
route5.get("/api/og/referral/:code", (c) => {
  return c.text("OG image temporarily disabled", 200);
});
var og_default = route5;

// server/routes/stats.ts
import { Hono as Hono6 } from "hono";
import { createClerkClient } from "@clerk/backend";
var route6 = new Hono6();
route6.get("/api/stats/user-count", async (c) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.harvous.com",
    "Access-Control-Allow-Methods": "GET"
  };
  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      console.error("[user-count] CLERK_SECRET_KEY not configured");
      return c.json(
        { count: 0, error: "Service unavailable" },
        503,
        { "Cache-Control": "no-store, no-cache, must-revalidate", ...corsHeaders }
      );
    }
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
    const { totalCount } = await clerkClient.users.getUserList({
      limit: 1,
      offset: 0
    });
    return c.json(
      { count: totalCount || 0 },
      200,
      { "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400", ...corsHeaders }
    );
  } catch (error) {
    console.error("[user-count] Error fetching user count:", error);
    return c.json(
      { count: 0, error: "Failed to fetch user count" },
      500,
      { "Cache-Control": "no-store, no-cache, must-revalidate", ...corsHeaders }
    );
  }
});
var stats_default = route6;

// server/routes/search.ts
import { Hono as Hono7 } from "hono";
init_db();
var route7 = new Hono7();
route7.get("/api/search", async (c) => {
  try {
    const auth = getAuth(c);
    const { userId } = auth;
    if (!userId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const url = new URL(c.req.url);
    const query = url.searchParams.get("q");
    const type = url.searchParams.get("type") || "all";
    const limit = parseInt(url.searchParams.get("limit") || "50");
    if (!query || query.trim().length === 0) {
      return c.json({ results: [] });
    }
    const searchTerm = `%${query.trim()}%`;
    let results = [];
    if (type === "all" || type === "notes") {
      const notes = await db.select().from(Notes).where(
        and(
          eq(Notes.userId, userId),
          not(eq(Notes.contentEncrypted, true)),
          or(
            like(Notes.title, searchTerm),
            like(Notes.content, searchTerm)
          )
        )
      ).orderBy(desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id).limit(limit);
      const noteResults = notes.map((note) => ({
        id: note.id,
        type: "note",
        title: note.title || "Untitled Note",
        content: note.content.substring(0, 200) + (note.content.length > 200 ? "..." : ""),
        contentEncrypted: false,
        noteType: note.noteType || "default",
        threadId: note.threadId,
        spaceId: note.spaceId,
        lastUpdated: note.updatedAt || note.createdAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      }));
      results = [...results, ...noteResults];
    }
    if (type === "all" || type === "threads") {
      const threads = await db.select().from(Threads).where(
        and(
          eq(Threads.userId, userId),
          like(Threads.title, searchTerm)
        )
      ).orderBy(desc(Threads.updatedAt), desc(Threads.createdAt), Threads.id).limit(limit);
      const threadResults = threads.map((thread) => ({
        id: thread.id,
        type: "thread",
        title: thread.title,
        subtitle: thread.subtitle || "",
        spaceId: thread.spaceId,
        color: thread.color,
        lastUpdated: thread.updatedAt || thread.createdAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }));
      results = [...results, ...threadResults];
    }
    results.sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
    results = results.slice(0, limit);
    return c.json({ results, query, type, total: results.length });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: "/api/search",
      action: "search"
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var search_default = route7;

// server/routes/content.ts
import { Hono as Hono8 } from "hono";
var route8 = new Hono8();
route8.get("/api/content/load-more", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const filter = c.req.query("filter") || "all";
    if (filter === "scripture") {
      const { items: items2, hasMore: hasMore2 } = await getScriptureNotesForDashboard(auth.userId, limit, offset);
      return c.json({ items: items2, hasMore: hasMore2, offset, limit });
    }
    const fetchLimit = filter === "all" ? limit : limit * 3;
    const filterExcludeReferencedScripture = filter === "all";
    const items = await getContentItems(auth.userId, fetchLimit, offset, filterExcludeReferencedScripture);
    let referencedScriptureNotes = [];
    if (filter === "all" && offset === 0) {
      referencedScriptureNotes = await getReferencedScriptureNotesWithoutLastVisited(auth.userId);
    }
    let filteredItems = items;
    if (filter === "threads") {
      filteredItems = items.filter((item) => item.type === "thread");
    } else if (filter === "notes") {
      filteredItems = items.filter((item) => item.type === "note" && (item.noteType === "default" || !item.noteType));
    } else if (filter === "resources") {
      filteredItems = items.filter((item) => item.type === "note" && item.noteType === "resource");
    }
    const limitedItems = filteredItems.slice(0, limit);
    const hasMore = limitedItems.length === limit && (items.length === fetchLimit || filteredItems.length > limit);
    return c.json({
      items: limitedItems,
      hasMore,
      offset,
      limit,
      referencedScriptureNotes: filter === "all" && offset === 0 ? referencedScriptureNotes : void 0
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error loading more content:", err);
    if (err.stack) console.error("Error stack:", err.stack);
    return c.json({ error: "Failed to load more content", details: err.message }, 500);
  }
});
var content_default = route8;

// server/routes/threads.ts
import { Hono as Hono9 } from "hono";
init_db();
init_dates();
init_unorganized_thread();

// server/utils/space-permissions.ts
init_db();

// src/utils/api-responses.ts
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
function errorResponse(message, code, status = 400) {
  const response = { error: message };
  if (code) {
    response.code = code;
  }
  return jsonResponse(response, status);
}
function notFoundResponse(resource) {
  const message = resource ? `${resource} not found` : "Resource not found";
  return errorResponse(message, "NOT_FOUND", 404);
}
function forbiddenResponse(message = "Forbidden", code) {
  return errorResponse(message, code || "FORBIDDEN", 403);
}

// server/utils/space-permissions.ts
async function requireSpaceAccess(spaceId, userId, requireOwner = false) {
  const space = await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).get();
  if (!space) {
    throw notFoundResponse("Space");
  }
  const isOwner = space.userId === userId;
  if (isOwner) {
    return { role: "owner", space };
  }
  if (requireOwner) {
    throw forbiddenResponse("Only space owners can perform this action");
  }
  const member = await db.select().from(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId))).get();
  if (member) {
    return { role: "member", space };
  }
  throw forbiddenResponse("You do not have access to this space");
}

// server/utils/xp-system.ts
init_db();

// src/utils/season-helpers.ts
function getCurrentSeason() {
  const now = /* @__PURE__ */ new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 3 && month <= 5) return `spring-${year}`;
  if (month >= 6 && month <= 8) return `summer-${year}`;
  if (month >= 9 && month <= 11) return `fall-${year}`;
  if (month === 12) return `winter-${year}`;
  return `winter-${year - 1}`;
}
function getSeasonDisplayName(season) {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split("-");
  const capitalized = seasonName.charAt(0).toUpperCase() + seasonName.slice(1);
  return `${capitalized} ${year}`;
}

// server/utils/xp-system.ts
var XP_VALUES = {
  SESSION_BASE: 15,
  SESSION_MAX: 40,
  CREATION_BONUS: 5,
  CHURCH_ADDED: 50,
  MONTHLY_ATTENDANCE: 25,
  WEEKLY_STREAK_3_4_DAYS: 15,
  WEEKLY_STREAK_5_6_DAYS: 25,
  WEEKLY_STREAK_7_DAYS: 35,
  // Legacy values (kept for backward compatibility)
  THREAD_CREATED: 10,
  NOTE_CREATED: 10,
  SCRIPTURE_NOTE_CREATED: 3,
  NOTE_OPENED: 1,
  FIRST_NOTE_DAILY_BONUS: 5
};
var DAILY_CAPS = {
  SESSIONS: 3,
  // Max 3 sessions per day
  CREATION_BONUS: 20,
  // Max 20 XP/day from creation bonuses
  // Legacy caps
  NOTE_OPENED: 50
  // Max 50 XP per day from opening notes
};
var MIN_CONTENT_LENGTHS = {
  NOTE: 10,
  // Minimum 10 characters for notes
  THREAD: 3
  // Minimum 3 characters for threads
};
var RATE_LIMITS = {
  THREADS_PER_HOUR: 5,
  // Max 5 threads per hour
  NOTES_PER_HOUR: 20
  // Max 20 notes per hour
};
var QUICK_DELETION_WINDOW_MS = 2 * 60 * 1e3;
var ACTIVITY_TYPES = {
  SESSION_COMPLETED: "session_completed",
  CREATION_BONUS: "creation_bonus",
  CHURCH_ADDED: "church_added",
  MONTHLY_ATTENDANCE: "monthly_attendance",
  WEEKLY_STREAK: "weekly_streak",
  // Legacy activity types (kept for backward compatibility)
  THREAD_CREATED: "thread_created",
  NOTE_CREATED: "note_created",
  NOTE_OPENED: "note_opened",
  FIRST_NOTE_DAILY_BONUS: "first_note_daily"
};
function checkContentLength(content, type) {
  const minLength = type === "note" ? MIN_CONTENT_LENGTHS.NOTE : MIN_CONTENT_LENGTHS.THREAD;
  return content.trim().length >= minLength;
}
async function checkRateLimit(userId, activityType, excludeScriptureNotes = false) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1e3);
    const recentXP = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, activityType),
      gte(UserXP.createdAt, oneHourAgo.toISOString())
    ));
    let count3 = recentXP.length;
    if (excludeScriptureNotes && activityType === "note_created") {
      count3 = recentXP.filter((record) => {
        if (!record.metadata) return true;
        try {
          const metadata = JSON.parse(record.metadata);
          return !metadata.isScriptureNote;
        } catch {
          return true;
        }
      }).length;
    }
    const limit = activityType === "thread_created" ? RATE_LIMITS.THREADS_PER_HOUR : RATE_LIMITS.NOTES_PER_HOUR;
    return count3 < limit;
  } catch (error) {
    console.error("Error checking rate limit:", error);
    return true;
  }
}
async function revokeXPOnDeletion(userId, relatedId, itemCreatedAt) {
  try {
    const now = /* @__PURE__ */ new Date();
    const timeDiff = now.getTime() - itemCreatedAt.getTime();
    if (timeDiff > QUICK_DELETION_WINDOW_MS) {
      return 0;
    }
    const xpRecords = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.relatedId, relatedId)
    ));
    let revokedAmount = 0;
    for (const record of xpRecords) {
      revokedAmount += record.xpAmount;
      await db.delete(UserXP).where(eq(UserXP.id, record.id));
    }
    return revokedAmount;
  } catch (error) {
    console.error("Error revoking XP on deletion:", error);
    return 0;
  }
}
async function revokeAllXPForItem(userId, relatedId) {
  try {
    const xpRecords = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.relatedId, relatedId)
    ));
    let revokedAmount = 0;
    for (const record of xpRecords) {
      revokedAmount += record.xpAmount;
      await db.delete(UserXP).where(eq(UserXP.id, record.id));
    }
    return revokedAmount;
  } catch (error) {
    console.error("Error revoking all XP for item:", error);
    return 0;
  }
}
async function awardXP(userId, activityType, xpAmount, relatedId, metadata) {
  try {
    const season = getCurrentSeason();
    const now = /* @__PURE__ */ new Date();
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType,
      xpAmount,
      relatedId: relatedId || null,
      season,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: now.toISOString()
    });
    await updateSeasonalXP(userId, season, xpAmount);
    await updateLifetimeXP(userId, xpAmount);
  } catch (error) {
    console.error("Error awarding XP:", error);
  }
}
async function updateSeasonalXP(userId, season, xpAmount) {
  try {
    const existing = await db.select().from(UserSeasonalXP).where(and(
      eq(UserSeasonalXP.userId, userId),
      eq(UserSeasonalXP.season, season)
    )).limit(1);
    if (existing.length > 0) {
      await db.update(UserSeasonalXP).set({
        totalXP: existing[0].totalXP + xpAmount,
        sessionCount: existing[0].sessionCount + (xpAmount > 0 && existing[0].sessionCount !== void 0 ? 1 : 0),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }).where(eq(UserSeasonalXP.id, existing[0].id));
    } else {
      await db.insert(UserSeasonalXP).values({
        id: `seasonal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        season,
        totalXP: xpAmount,
        sessionCount: 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } catch (error) {
    console.error("Error updating seasonal XP:", error);
  }
}
async function updateLifetimeXP(userId, xpAmount) {
  try {
    const existing = await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(UserLifetimeXP).set({
        totalXP: existing[0].totalXP + xpAmount,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      }).where(eq(UserLifetimeXP.id, existing[0].id));
    } else {
      await db.insert(UserLifetimeXP).values({
        id: `lifetime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        totalXP: xpAmount,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } catch (error) {
    console.error("Error updating lifetime XP:", error);
  }
}
async function getSeasonalXP(userId, season) {
  try {
    const currentSeason = season || getCurrentSeason();
    const seasonal = await db.select().from(UserSeasonalXP).where(and(
      eq(UserSeasonalXP.userId, userId),
      eq(UserSeasonalXP.season, currentSeason)
    )).limit(1);
    return seasonal.length > 0 ? seasonal[0].totalXP : 0;
  } catch (error) {
    console.error("Error getting seasonal XP:", error);
    return 0;
  }
}
async function getLifetimeXP(userId) {
  try {
    const lifetime = await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, userId)).limit(1);
    if (lifetime.length > 0 && lifetime[0].totalXP > 0) {
      return lifetime[0].totalXP;
    }
    const xpRecords = await db.select().from(UserXP).where(eq(UserXP.userId, userId));
    const totalXP = xpRecords.reduce((sum2, record) => sum2 + record.xpAmount, 0);
    if (totalXP > 0 && (lifetime.length === 0 || lifetime[0].totalXP === 0)) {
      if (lifetime.length > 0) {
        await db.update(UserLifetimeXP).set({ totalXP, lastUpdated: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(UserLifetimeXP.userId, userId));
      } else {
        await db.insert(UserLifetimeXP).values({
          id: `lifetime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          totalXP,
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    return totalXP;
  } catch (error) {
    console.error("Error getting lifetime XP:", error);
    return 0;
  }
}
async function getAllSeasonalXP(userId) {
  try {
    const allSeasons = await db.select().from(UserSeasonalXP).where(eq(UserSeasonalXP.userId, userId));
    const seasonOrder = {
      "spring": 1,
      "summer": 2,
      "fall": 3,
      "winter": 4
    };
    const sortedSeasons = allSeasons.filter((record) => record.totalXP > 0).sort((a, b) => {
      const [aSeason, aYear] = a.season.split("-");
      const [bSeason, bYear] = b.season.split("-");
      const aYearNum = parseInt(aYear);
      const bYearNum = parseInt(bYear);
      if (aYearNum !== bYearNum) {
        return bYearNum - aYearNum;
      }
      return (seasonOrder[bSeason] || 0) - (seasonOrder[aSeason] || 0);
    }).map((record) => ({
      season: record.season,
      seasonName: getSeasonDisplayName(record.season),
      totalXP: record.totalXP
    }));
    return sortedSeasons;
  } catch (error) {
    console.error("Error getting all seasonal XP:", error);
    return [];
  }
}
async function awardSessionXP(userId, sessionXP) {
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.SESSION_COMPLETED),
      gte(UserXP.createdAt, today.toISOString())
    ));
    if (todaySessions.length >= DAILY_CAPS.SESSIONS) {
      return false;
    }
    await awardXP(
      userId,
      ACTIVITY_TYPES.SESSION_COMPLETED,
      sessionXP,
      void 0,
      { sessionNumber: todaySessions.length + 1 }
    );
    return true;
  } catch (error) {
    console.error("Error awarding session XP:", error);
    return false;
  }
}
async function awardCreationBonusXP(userId, itemType) {
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayCreationXP = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.CREATION_BONUS),
      gte(UserXP.createdAt, today.toISOString())
    ));
    const todayTotal = todayCreationXP.reduce((sum2, r) => sum2 + r.xpAmount, 0);
    if (todayTotal >= DAILY_CAPS.CREATION_BONUS) {
      return false;
    }
    const xpToAward = Math.min(
      XP_VALUES.CREATION_BONUS,
      DAILY_CAPS.CREATION_BONUS - todayTotal
    );
    if (xpToAward > 0) {
      await awardXP(
        userId,
        ACTIVITY_TYPES.CREATION_BONUS,
        xpToAward,
        void 0,
        { itemType }
      );
    }
    return xpToAward > 0;
  } catch (error) {
    console.error("Error awarding creation bonus XP:", error);
    return false;
  }
}
async function awardChurchAddedXP(userId) {
  try {
    const existing = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.CHURCH_ADDED)
    )).limit(1);
    if (existing.length > 0) {
      return false;
    }
    await awardXP(
      userId,
      ACTIVITY_TYPES.CHURCH_ADDED,
      XP_VALUES.CHURCH_ADDED,
      void 0,
      void 0
    );
    return true;
  } catch (error) {
    console.error("Error awarding church addition XP:", error);
    return false;
  }
}
async function awardMonthlyAttendanceXP(userId) {
  try {
    const now = /* @__PURE__ */ new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const existing = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.MONTHLY_ATTENDANCE),
      gte(UserXP.createdAt, startOfMonth.toISOString())
    )).limit(1);
    if (existing.length > 0) {
      return false;
    }
    await awardXP(
      userId,
      ACTIVITY_TYPES.MONTHLY_ATTENDANCE,
      XP_VALUES.MONTHLY_ATTENDANCE,
      void 0,
      {
        month: now.getMonth() + 1,
        year: now.getFullYear()
      }
    );
    await db.update(UserMetadata).set({ lastMonthlyVisit: now.toISOString() }).where(eq(UserMetadata.userId, userId));
    return true;
  } catch (error) {
    console.error("Error awarding monthly attendance XP:", error);
    return false;
  }
}
async function checkLifetimeMilestones(userId) {
  try {
    const lifetimeXP = await getLifetimeXP(userId);
    const milestones = [];
    if (lifetimeXP >= 100) milestones.push("first_hundred");
    if (lifetimeXP >= 500) milestones.push("five_hundred");
    if (lifetimeXP >= 1e3) milestones.push("thousand");
    if (lifetimeXP >= 5e3) milestones.push("five_thousand");
    if (lifetimeXP >= 1e4) milestones.push("ten_thousand");
    if (lifetimeXP >= 25e3) milestones.push("twenty_five_thousand");
    if (lifetimeXP >= 5e4) milestones.push("fifty_thousand");
    return milestones;
  } catch (error) {
    console.error("Error checking lifetime milestones:", error);
    return [];
  }
}
async function awardThreadCreatedXP(userId, threadId, title, subtitle) {
  try {
    const existingXP = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.THREAD_CREATED),
      eq(UserXP.relatedId, threadId)
    )).limit(1);
    if (existingXP.length > 0) {
      return;
    }
    if (title && !checkContentLength(title, "thread")) {
      return;
    }
    const withinRateLimit = await checkRateLimit(userId, "thread_created", false);
    if (!withinRateLimit) {
      return;
    }
    const metadata = JSON.stringify({
      contentLength: title?.length || 0
    });
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.THREAD_CREATED,
      xpAmount: XP_VALUES.THREAD_CREATED,
      relatedId: threadId,
      metadata,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    console.error("Error awarding thread creation XP:", error);
  }
}
async function awardNoteCreatedXP(userId, noteId, isScriptureNote = false, content) {
  try {
    const existingXP = await db.select().from(UserXP).where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_CREATED),
      eq(UserXP.relatedId, noteId)
    )).limit(1);
    if (existingXP.length > 0) {
      return;
    }
    if (!isScriptureNote && content && !checkContentLength(content, "note")) {
      return;
    }
    if (!isScriptureNote) {
      const withinRateLimit = await checkRateLimit(userId, "note_created", true);
      if (!withinRateLimit) {
        return;
      }
    }
    const xpAmount = isScriptureNote ? XP_VALUES.SCRIPTURE_NOTE_CREATED : XP_VALUES.NOTE_CREATED;
    let isFirstNoteToday = false;
    if (!isScriptureNote) {
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const todayNotes = await db.select().from(Notes).where(and(
        eq(Notes.userId, userId),
        gte(Notes.createdAt, today.toISOString())
      )).limit(1);
      isFirstNoteToday = todayNotes.length === 0;
    }
    const metadata = JSON.stringify({
      isScriptureNote,
      contentLength: content?.length || 0
    });
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.NOTE_CREATED,
      xpAmount,
      relatedId: noteId,
      metadata,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (isFirstNoteToday) {
      const existingBonusXP = await db.select().from(UserXP).where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS),
        eq(UserXP.relatedId, noteId)
      )).limit(1);
      if (existingBonusXP.length === 0) {
        await db.insert(UserXP).values({
          id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_bonus`,
          userId,
          activityType: ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS,
          xpAmount: XP_VALUES.FIRST_NOTE_DAILY_BONUS,
          relatedId: noteId,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  } catch (error) {
    console.error("Error awarding note creation XP:", error);
  }
}
async function getXPBreakdown(userId) {
  try {
    const xpRecords = await db.select().from(UserXP).where(eq(UserXP.userId, userId));
    const breakdown = {
      sessionCompleted: 0,
      creationBonus: 0,
      churchAdded: 0,
      monthlyAttendance: 0,
      weeklyStreak: 0,
      // Legacy
      threadCreated: 0,
      noteCreated: 0,
      noteOpened: 0,
      firstNoteDailyBonus: 0
    };
    xpRecords.forEach((record) => {
      switch (record.activityType) {
        case ACTIVITY_TYPES.SESSION_COMPLETED:
          breakdown.sessionCompleted += record.xpAmount;
          break;
        case ACTIVITY_TYPES.CREATION_BONUS:
          breakdown.creationBonus += record.xpAmount;
          break;
        case ACTIVITY_TYPES.CHURCH_ADDED:
          breakdown.churchAdded += record.xpAmount;
          break;
        case ACTIVITY_TYPES.MONTHLY_ATTENDANCE:
          breakdown.monthlyAttendance += record.xpAmount;
          break;
        case ACTIVITY_TYPES.WEEKLY_STREAK:
          breakdown.weeklyStreak += record.xpAmount;
          break;
        // Legacy activity types
        case ACTIVITY_TYPES.THREAD_CREATED:
          breakdown.threadCreated += record.xpAmount;
          break;
        case ACTIVITY_TYPES.NOTE_CREATED:
          breakdown.noteCreated += record.xpAmount;
          break;
        case ACTIVITY_TYPES.NOTE_OPENED:
          breakdown.noteOpened += record.xpAmount;
          break;
        case ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS:
          breakdown.firstNoteDailyBonus += record.xpAmount;
          break;
      }
    });
    const totalXP = Object.values(breakdown).reduce((sum2, value) => sum2 + value, 0);
    return {
      totalXP,
      breakdown
    };
  } catch (error) {
    console.error("Error getting XP breakdown:", error);
    return {
      totalXP: 0,
      breakdown: {
        sessionCompleted: 0,
        creationBonus: 0,
        churchAdded: 0,
        monthlyAttendance: 0,
        weeklyStreak: 0,
        threadCreated: 0,
        noteCreated: 0,
        noteOpened: 0,
        firstNoteDailyBonus: 0
      }
    };
  }
}
async function cleanupDuplicateXP(userId) {
  try {
    const allXP = await db.select().from(UserXP).where(eq(UserXP.userId, userId));
    const groupedXP = allXP.reduce((acc, record) => {
      const key = `${record.activityType}_${record.relatedId}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    }, {});
    let removedCount = 0;
    const totalCount = allXP.length;
    for (const [key, records] of Object.entries(groupedXP)) {
      if (records.length > 1) {
        const sortedRecords = records.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const toRemove = sortedRecords.slice(1);
        for (const record of toRemove) {
          await db.delete(UserXP).where(eq(UserXP.id, record.id));
          removedCount++;
        }
      }
    }
    return { removed: removedCount, total: totalCount };
  } catch (error) {
    console.error("Error during duplicate XP cleanup:", error);
    return { removed: 0, total: 0 };
  }
}
async function backfillUserXP(userId) {
  try {
    await cleanupDuplicateXP(userId);
    const userThreads = await db.select().from(Threads).where(eq(Threads.userId, userId));
    const userNotes = await db.select().from(Notes).where(eq(Notes.userId, userId));
    for (const thread of userThreads) {
      await awardThreadCreatedXP(userId, thread.id, thread.title, thread.subtitle || null);
    }
    for (const note of userNotes) {
      const isScriptureNote = note.noteType === "scripture";
      await awardNoteCreatedXP(userId, note.id, isScriptureNote, note.content || "");
    }
  } catch (error) {
    console.error("Error during XP backfill:", error);
  }
}

// server/utils/move-scripture-notes-to-thread.ts
init_db();
function sleep2(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function moveScriptureNotesToThread(parentNoteId, threadId, userId) {
  if (threadId === "thread_unorganized") return;
  await sleep2(1e3);
  try {
    try {
      await db.select().from(NoteScriptureReferences).limit(1).get();
    } catch (checkError) {
      if (checkError.message?.includes("SQLITE_BUSY") || checkError.message?.includes("database is locked")) {
        return;
      }
    }
    const scriptureReferences = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).where(eq(NoteScriptureReferences.noteId, parentNoteId)).all();
    if (scriptureReferences.length === 0) return;
    for (const ref of scriptureReferences) {
      const scriptureNoteId = ref.scriptureNoteId;
      try {
        const scriptureNote = await db.select().from(Notes).where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId))).get();
        if (!scriptureNote) continue;
        const existingThreadRelations = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, scriptureNoteId)).all();
        const existingRelation = existingThreadRelations.find((rel) => rel.threadId === threadId);
        if (existingRelation) continue;
        const isInUnorganized = existingThreadRelations.length === 0 || scriptureNote.threadId === "thread_unorganized";
        let retries = 3;
        let inserted = false;
        while (retries > 0 && !inserted) {
          try {
            const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(NoteThreads).values({
              id: noteThreadId,
              noteId: scriptureNoteId,
              threadId,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            inserted = true;
            if (isInUnorganized && threadId !== "thread_unorganized") {
              let updateRetries = 3;
              while (updateRetries > 0) {
                try {
                  await db.update(Notes).set({ threadId }).where(eq(Notes.id, scriptureNoteId));
                  break;
                } catch (updateError) {
                  if (updateError.message?.includes("SQLITE_BUSY") || updateError.message?.includes("database is locked")) {
                    updateRetries--;
                    if (updateRetries > 0) await sleep2(50 * (4 - updateRetries));
                  } else {
                    throw updateError;
                  }
                }
              }
            }
          } catch (insertError) {
            if (insertError.message?.includes("SQLITE_BUSY") || insertError.message?.includes("database is locked")) {
              retries--;
              if (retries > 0) await sleep2(50 * (4 - retries));
              else console.error(`Failed to insert scripture note ${scriptureNoteId} after retries:`, insertError);
            } else {
              throw insertError;
            }
          }
        }
      } catch (error) {
        console.error(`Error moving scripture note ${scriptureNoteId} to thread:`, error);
      }
    }
  } catch (error) {
    console.error(`Error moving scripture notes for parent note ${parentNoteId} to thread:`, error);
  }
}

// server/utils/untitled-naming.ts
init_db();
async function getNextUntitledThreadName(userId) {
  const prefix = "Untitled Thread";
  const existingThreads = await db.select({ title: Threads.title }).from(Threads).where(eq(Threads.userId, userId)).all();
  const usedNumbers = [];
  for (const thread of existingThreads) {
    const title = thread.title;
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    const match = title.match(/^Untitled Thread (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }
  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}
async function getNextUntitledNoteName(userId) {
  const prefix = "Untitled Note";
  const existingNotes = await db.select({ title: Notes.title }).from(Notes).where(eq(Notes.userId, userId)).all();
  const usedNumbers = [];
  for (const note of existingNotes) {
    const title = note.title;
    if (!title) continue;
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    const match = title.match(/^Untitled Note (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }
  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}

// src/utils/validation.ts
function normalizeUrl(url) {
  if (!url || !url.trim()) {
    return url;
  }
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  return `https://${trimmed}`;
}
function extractDomain(url) {
  if (!url || !url.trim()) {
    return null;
  }
  try {
    const normalizedUrl = normalizeUrl(url);
    const urlObj = new URL(normalizedUrl);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
var DOMAIN_FRIENDLY_NAMES = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "vimeo.com": "Vimeo",
  "thegospelcoalition.org": "The Gospel Coalition",
  "desiringgod.org": "Desiring God",
  "ligonier.org": "Ligonier Ministries",
  "christianitytoday.com": "Christianity Today",
  "biblegateway.com": "Bible Gateway",
  "blueletterbible.org": "Blue Letter Bible",
  "gotquestions.org": "Got Questions",
  "ccel.org": "Christian Classics Ethereal Library",
  "crossway.org": "Crossway",
  "logos.com": "Logos",
  "bible.com": "YouVersion",
  "faithlife.com": "Faithlife",
  "spurgeon.org": "Spurgeon",
  "monergism.com": "Monergism",
  "reformedwiki.com": "Reformed Wiki",
  "thirdmill.org": "Third Millennium",
  "biblia.com": "Biblia",
  "bibleproject.com": "BibleProject",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "spotify.com": "Spotify",
  "podcasts.apple.com": "Apple Podcasts",
  "anchor.fm": "Anchor",
  "soundcloud.com": "SoundCloud",
  "twitter.com": "Twitter",
  "x.com": "X",
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "tiktok.com": "TikTok",
  "reddit.com": "Reddit",
  "linkedin.com": "LinkedIn",
  "notion.so": "Notion",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "dropbox.com": "Dropbox",
  "github.com": "GitHub",
  "amazon.com": "Amazon"
};
function getDomainFriendlyName(domain) {
  if (!domain) {
    return null;
  }
  return DOMAIN_FRIENDLY_NAMES[domain.toLowerCase()] || domain;
}
function validateTitle(title, required = true) {
  if (!title || !title.trim()) {
    if (required) {
      return {
        isValid: false,
        error: "Title is required",
        code: "TITLE_REQUIRED"
      };
    }
    return { isValid: true };
  }
  const trimmed = title.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: "Title cannot be empty",
        code: "TITLE_EMPTY"
      };
    }
    return { isValid: true };
  }
  if (trimmed.length > 200) {
    return {
      isValid: false,
      error: "Title must be 200 characters or less",
      code: "TITLE_TOO_LONG"
    };
  }
  return { isValid: true };
}
function validateContent(content, required = true) {
  if (!content || !content.trim()) {
    if (required) {
      return {
        isValid: false,
        error: "Content is required",
        code: "CONTENT_REQUIRED"
      };
    }
    return { isValid: true };
  }
  const trimmed = content.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: "Content cannot be empty",
        code: "CONTENT_EMPTY"
      };
    }
    return { isValid: true };
  }
  if (trimmed.length > 5e4) {
    return {
      isValid: false,
      error: "Content must be 50,000 characters or less",
      code: "CONTENT_TOO_LONG"
    };
  }
  return { isValid: true };
}
function validateColor(color) {
  if (!color) {
    return { isValid: true };
  }
  if (!THREAD_COLORS.includes(color)) {
    return {
      isValid: false,
      error: `Invalid color. Must be one of: ${THREAD_COLORS.join(", ")}`,
      code: "INVALID_COLOR"
    };
  }
  return { isValid: true };
}
function validateNoteType(noteType) {
  if (!noteType) {
    return { isValid: true };
  }
  const validTypes = ["default", "scripture", "resource"];
  if (!validTypes.includes(noteType)) {
    return {
      isValid: false,
      error: `Invalid note type. Must be one of: ${validTypes.join(", ")}`,
      code: "INVALID_NOTE_TYPE"
    };
  }
  return { isValid: true };
}
function validateSpaceId(spaceId) {
  if (!spaceId) {
    return { isValid: true };
  }
  const trimmed = spaceId.trim();
  if (trimmed.length === 0) {
    return { isValid: true };
  }
  if (!trimmed.startsWith("space_")) {
    return {
      isValid: false,
      error: "Invalid space ID format",
      code: "INVALID_SPACE_ID"
    };
  }
  return { isValid: true };
}
function validateThreadId(threadId) {
  if (!threadId) {
    return { isValid: true };
  }
  const trimmed = threadId.trim();
  if (trimmed.length === 0) {
    return { isValid: true };
  }
  if (trimmed !== "thread_unorganized" && !trimmed.startsWith("thread_")) {
    return {
      isValid: false,
      error: "Invalid thread ID format",
      code: "INVALID_THREAD_ID"
    };
  }
  return { isValid: true };
}
function validateName(name, fieldName = "Name", required = true) {
  if (!name || !name.trim()) {
    if (required) {
      return {
        isValid: false,
        error: `${fieldName} is required`,
        code: `${fieldName.toUpperCase().replace(/\s+/g, "_")}_REQUIRED`
      };
    }
    return { isValid: true };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: `${fieldName} cannot be empty`,
        code: `${fieldName.toUpperCase().replace(/\s+/g, "_")}_EMPTY`
      };
    }
    return { isValid: true };
  }
  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: `${fieldName} must be 100 characters or less`,
      code: `${fieldName.toUpperCase().replace(/\s+/g, "_")}_TOO_LONG`
    };
  }
  return { isValid: true };
}
function validateResourceUrl(url) {
  if (!url || !url.trim()) {
    return {
      isValid: false,
      error: "URL is required",
      code: "URL_REQUIRED"
    };
  }
  const trimmed = url.trim();
  if (trimmed.length > 2048) {
    return {
      isValid: false,
      error: "URL is too long",
      code: "URL_TOO_LONG"
    };
  }
  const lowerUrl = trimmed.toLowerCase();
  const dangerousProtocols = ["javascript:", "data:", "file:", "vbscript:", "about:"];
  if (dangerousProtocols.some((proto) => lowerUrl.startsWith(proto))) {
    return {
      isValid: false,
      error: "Invalid URL protocol",
      code: "INVALID_PROTOCOL"
    };
  }
  const normalizedUrl = normalizeUrl(trimmed);
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    return {
      isValid: false,
      error: "Only web URLs are supported",
      code: "UNSUPPORTED_PROTOCOL"
    };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
      code: "INVALID_FORMAT"
    };
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  if (blockedHosts.includes(hostname) || hostname.endsWith(".local")) {
    return {
      isValid: false,
      error: "Local URLs are not supported",
      code: "LOCAL_URL"
    };
  }
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168) {
      return {
        isValid: false,
        error: "Private network URLs are not supported",
        code: "PRIVATE_IP"
      };
    }
  }
  if (!hostname.includes(".") && !ipv4Match) {
    return {
      isValid: false,
      error: "Invalid domain name",
      code: "INVALID_DOMAIN"
    };
  }
  const isPDF = normalizedUrl.toLowerCase().endsWith(".pdf") || normalizedUrl.toLowerCase().includes(".pdf?") || normalizedUrl.toLowerCase().includes(".pdf#");
  return {
    isValid: true,
    normalizedUrl,
    isPDF,
    domain: hostname.replace(/^www\./, "")
  };
}

// src/utils/rate-limit.ts
var rateLimitStore = /* @__PURE__ */ new Map();
var CLEANUP_INTERVAL = 5 * 60 * 1e3;
var cleanupTimer = null;
function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}
if (typeof globalThis !== "undefined") {
  startCleanupTimer();
}
function getRateLimitKey(userId, endpoint, ip) {
  const identifier = userId || ip || "anonymous";
  return `${identifier}:${endpoint}`;
}
function checkRateLimit2(userId, endpoint, config, ip) {
  const key = getRateLimitKey(userId, endpoint, ip);
  const now = Date.now();
  let record = rateLimitStore.get(key);
  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(key, record);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: record.resetTime
    };
  }
  record.count++;
  if (record.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime
  };
}
var RATE_LIMITS2 = {
  // Read operations: 100 requests per minute
  READ: {
    maxRequests: 100,
    windowMs: 60 * 1e3
    // 1 minute
  },
  // Write operations: 20 requests per minute
  WRITE: {
    maxRequests: 20,
    windowMs: 60 * 1e3
    // 1 minute
  },
  // Space invite: higher limit so owners can onboard larger spaces (e.g. 100 members)
  INVITE: {
    maxRequests: 60,
    windowMs: 60 * 1e3
    // 1 minute
  }
};
function rateLimitMiddleware(userId, endpoint, type, ip) {
  const isInviteEndpoint = endpoint.includes("members/invite");
  const config = isInviteEndpoint ? RATE_LIMITS2.INVITE : type === "read" ? RATE_LIMITS2.READ : RATE_LIMITS2.WRITE;
  const result = checkRateLimit2(userId, endpoint, config, ip);
  if (!result.allowed) {
    const message = isInviteEndpoint ? `Rate limit exceeded. Maximum ${config.maxRequests} invites per minute.` : `Rate limit exceeded. Maximum ${config.maxRequests} requests per minute.`;
    return {
      allowed: false,
      error: message,
      remaining: result.remaining,
      resetTime: result.resetTime
    };
  }
  return {
    allowed: true,
    remaining: result.remaining,
    resetTime: result.resetTime
  };
}
function getClientIP(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  return void 0;
}

// server/routes/threads.ts
init_ids();
var route9 = new Hono9();
function parseSelectedNoteIds(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
async function addNotesToThread(noteIds, threadId, userId) {
  for (const noteId of noteIds) {
    try {
      const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, userId))).get();
      if (!note) continue;
      const existingRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, threadId))).get();
      if (existingRelation) continue;
      const existingThreadRelations = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).all();
      const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === "thread_unorganized";
      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: noteThreadId, noteId, threadId, createdAt: nowISO() });
      if (isInUnorganized && threadId !== "thread_unorganized") {
        await db.update(Notes).set({ threadId }).where(eq(Notes.id, noteId));
      }
      moveScriptureNotesToThread(noteId, threadId, userId).catch((error) => {
        console.error(`Error moving scripture notes for note ${noteId} (non-blocking):`, error);
      });
    } catch (error) {
      console.error(`Error adding note ${noteId} to thread:`, error);
    }
  }
}
route9.get("/api/threads/list", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const threads = await getAllThreadsWithCounts(auth.userId);
    const threadOptions = threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      color: thread.color,
      spaceId: thread.spaceId || null,
      noteCount: thread.noteCount,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || "blue")
    }));
    const unorganizedThreadData = await ensureUnorganizedThread(auth.userId);
    const hasUnorganizedThread = threadOptions.some((thread) => thread.id === "thread_unorganized");
    if (!hasUnorganizedThread) {
      threadOptions.unshift({
        id: "thread_unorganized",
        title: "Unorganized",
        color: null,
        spaceId: null,
        noteCount: unorganizedThreadData.noteCount || 0,
        backgroundGradient: getThreadGradientCSS("paper")
      });
    } else {
      const unorganizedIndex = threadOptions.findIndex((thread) => thread.id === "thread_unorganized");
      if (unorganizedIndex !== -1) {
        threadOptions[unorganizedIndex].noteCount = unorganizedThreadData.noteCount || 0;
        threadOptions[unorganizedIndex].spaceId = null;
      }
    }
    return c.json(threadOptions);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/list", action: "list_threads" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.post("/api/threads/create", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/threads/create", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error || "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
    const formData = await c.req.formData();
    const title = formData.get("title");
    const color = formData.get("color");
    const isPublic = formData.get("isPublic") === "true";
    const spaceId = formData.get("spaceId");
    const selectedNoteIds = parseSelectedNoteIds(formData.get("selectedNoteIds"));
    const titleValidation = validateTitle(title, false);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    let finalTitle;
    if (!title || !title.trim()) {
      finalTitle = await getNextUntitledThreadName(auth.userId);
    } else {
      finalTitle = title.trim();
    }
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    let threadColor = color;
    if (color && !THREAD_COLORS.includes(color)) threadColor = getRandomThreadColor();
    else if (!color) threadColor = getRandomThreadColor();
    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) return c.json({ error: spaceIdValidation.error, code: spaceIdValidation.code }, 400);
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== "default_space") finalSpaceId = spaceId;
    const capitalizedTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    const shareToken = isPublic ? generateShareToken() : null;
    const now = nowISO();
    const newThread = await db.insert(Threads).values({
      id: generateThreadId(),
      title: capitalizedTitle,
      subtitle: null,
      spaceId: finalSpaceId,
      userId: auth.userId,
      isPublic,
      color: threadColor,
      isPinned: false,
      shareToken,
      shareTokenCreatedAt: isPublic ? now : null,
      createdAt: now,
      updatedAt: now,
      lastVisited: now
    }).returning().get();
    if (selectedNoteIds.length > 0) {
      await addNotesToThread(selectedNoteIds, newThread.id, auth.userId);
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, newThread.id), eq(Threads.userId, auth.userId)));
    }
    awardCreationBonusXP(auth.userId, "thread").catch(() => {
    });
    return c.json({ success: "Thread created!", thread: newThread });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/create", action: "create_thread" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.post("/api/threads/update", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/threads/update", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error || "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
    const formData = await c.req.formData();
    const threadId = formData.get("id");
    const title = formData.get("title");
    const color = formData.get("color");
    const subtitle = formData.get("subtitle");
    const isPublic = formData.get("isPublic") === "true";
    const selectedNoteIds = parseSelectedNoteIds(formData.get("selectedNoteIds"));
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    const currentThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!currentThread) return c.json({ error: "Thread not found or access denied" }, 404);
    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const normalizedSubtitle = subtitle || null;
    const titleChanged = currentThread.title !== capitalizedTitle;
    const subtitleChanged = (currentThread.subtitle || null) !== normalizedSubtitle;
    const isPublicChanged = currentThread.isPublic !== isPublic;
    const onlyColorChanged = !titleChanged && !subtitleChanged && !isPublicChanged;
    const updateData = {
      title: capitalizedTitle,
      subtitle: normalizedSubtitle,
      isPublic,
      color
    };
    if (!onlyColorChanged) {
      updateData.updatedAt = nowISO();
    }
    const updatedThread = await db.update(Threads).set(updateData).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).returning().get();
    if (selectedNoteIds.length > 0) {
      await addNotesToThread(selectedNoteIds, threadId, auth.userId);
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    }
    return c.json({ success: "Thread updated!", thread: updatedThread });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/update", action: "update_thread" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.delete("/api/threads/delete", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/threads/delete", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const threadId = c.req.query("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const existingThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!existingThread) return c.json({ error: "Thread not found or access denied" }, 404);
    if (threadId === "thread_unorganized") return c.json({ error: "Cannot delete the unorganized thread" }, 400);
    const threadCreatedAt = existingThread.createdAt;
    await revokeXPOnDeletion(auth.userId, threadId, new Date(threadCreatedAt));
    await revokeAllXPForItem(auth.userId, threadId);
    const affectedNotes = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads).where(eq(NoteThreads.threadId, threadId)).all();
    await db.delete(NoteThreads).where(eq(NoteThreads.threadId, threadId));
    if (affectedNotes.length > 0) {
      for (const { noteId } of affectedNotes) {
        await db.update(Notes).set({ threadId: "thread_unorganized" }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      }
    }
    await db.delete(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    return c.json({ success: "Thread erased! Notes have been moved to the Unorganized thread.", threadId });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/delete", action: "delete_thread" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.post("/api/threads/ensure-unorganized", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const existingThread = await db.select().from(Threads).where(and(eq(Threads.userId, auth.userId), eq(Threads.id, "thread_unorganized"))).get();
    if (existingThread) {
      return c.json({ success: true, message: "Unorganized thread already exists", thread: existingThread });
    }
    const now = nowISO();
    const unorganizedThread = {
      id: "thread_unorganized",
      userId: auth.userId,
      title: "Unorganized",
      subtitle: "Individual notes and unassigned content",
      color: null,
      spaceId: null,
      isPublic: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now
    };
    try {
      await db.insert(Threads).values(unorganizedThread);
      return c.json({ success: true, message: "Unorganized thread created", thread: unorganizedThread }, 201);
    } catch (insertError) {
      if (insertError.code === "SQLITE_CONSTRAINT" || insertError.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || insertError.rawCode === 1555 || insertError.message?.includes("UNIQUE constraint failed")) {
        const createdThread = await db.select().from(Threads).where(and(eq(Threads.userId, auth.userId), eq(Threads.id, "thread_unorganized"))).get();
        if (createdThread) return c.json({ success: true, message: "Unorganized thread already exists", thread: createdThread });
      }
      throw insertError;
    }
  } catch (error) {
    console.error("Error ensuring unorganized thread:", error);
    return c.json({ error: "Failed to ensure unorganized thread exists" }, 500);
  }
});
route9.delete("/api/threads/erase-with-notes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/threads/erase-with-notes", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const threadId = c.req.query("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const existingThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!existingThread) return c.json({ error: "Thread not found or access denied" }, 404);
    if (threadId === "thread_unorganized") return c.json({ error: "Cannot erase the unorganized thread" }, 400);
    const threadCreatedAt = existingThread.createdAt;
    const affectedNotes = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads).where(eq(NoteThreads.threadId, threadId)).all();
    const noteIds = affectedNotes.map((n) => n.noteId);
    for (const noteId of noteIds) {
      const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
      if (note) {
        await revokeXPOnDeletion(auth.userId, noteId, new Date(note.createdAt));
        await revokeAllXPForItem(auth.userId, noteId);
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.noteId, noteId));
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.scriptureNoteId, noteId));
      }
    }
    await db.delete(NoteThreads).where(eq(NoteThreads.threadId, threadId));
    for (const noteId of noteIds) {
      await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }
    await revokeXPOnDeletion(auth.userId, threadId, new Date(threadCreatedAt));
    await revokeAllXPForItem(auth.userId, threadId);
    await db.delete(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    return c.json({ success: "Thread and all notes erased!", threadId, notesDeleted: noteIds.length });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/erase-with-notes", action: "erase_thread_with_notes" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.get("/api/threads/:threadId/prefetch", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.param("threadId");
    if (!threadId) return c.json({ error: "Thread ID required" }, 400);
    const [thread, notesResult, noteTypeCounts] = await Promise.all([
      getThreadWithCount(threadId, auth.userId),
      getNotesForThread(threadId, auth.userId),
      getThreadNoteTypeCounts(threadId, auth.userId)
    ]);
    if (!thread) return c.json({ error: "Thread not found" }, 404);
    const notes = Array.isArray(notesResult) ? [] : notesResult.notes;
    return c.json({
      thread: {
        id: thread.id,
        title: thread.title,
        subtitle: thread.subtitle,
        color: thread.color,
        noteCount: thread.noteCount,
        backgroundGradient: thread.backgroundGradient,
        userId: thread.userId
      },
      notes,
      noteTypeCounts
    }, 200, {
      "Cache-Control": "private, max-age=120, stale-while-revalidate=300"
    });
  } catch (error) {
    console.error("[prefetch] Error fetching thread data:", error);
    return c.json({ error: "Failed to fetch thread data", details: error.message }, 500);
  }
});
route9.get("/api/threads/:threadId/note-type-counts", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.param("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const noteTypeCounts = await getThreadNoteTypeCounts(threadId, auth.userId);
    return c.json({ noteTypeCounts });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: "/api/threads/[threadId]/note-type-counts",
      action: "get_thread_note_type_counts",
      threadId: c.req.param("threadId")
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.get("/api/threads/:threadId/notes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.param("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const limit = parseInt(c.req.query("limit") || "20", 10);
    let result = await getNotesForThread(threadId, auth.userId, limit, offset);
    if (Array.isArray(result)) {
      result = { notes: [], hasMore: false };
    }
    if (result.notes.length === 0 && offset === 0) {
      const thread = await db.select().from(Threads).where(eq(Threads.id, threadId)).get();
      if (thread?.spaceId) {
        let memberNotesResult = null;
        try {
          const { space } = await requireSpaceAccess(thread.spaceId, auth.userId);
          memberNotesResult = await getNotesForThreadForMember(threadId, space.userId, limit, offset);
        } catch {
          const spaceRow = await db.select().from(Spaces).where(eq(Spaces.id, thread.spaceId)).get();
          const memberRow = await db.select().from(Members).where(and(eq(Members.spaceId, thread.spaceId), eq(Members.userId, auth.userId))).get();
          if (spaceRow && memberRow) {
            memberNotesResult = await getNotesForThreadForMember(threadId, spaceRow.userId, limit, offset);
          }
        }
        if (memberNotesResult) result = memberNotesResult;
      }
    }
    return c.json({ notes: result.notes, hasMore: result.hasMore, offset, limit });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/[threadId]/notes", action: "get_thread_notes", threadId: c.req.param("threadId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.get("/api/threads/:threadId/share", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.param("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const thread = await db.select({
      id: Threads.id,
      isPublic: Threads.isPublic,
      shareToken: Threads.shareToken,
      shareTokenCreatedAt: Threads.shareTokenCreatedAt,
      userId: Threads.userId
    }).from(Threads).where(eq(Threads.id, threadId)).get();
    if (!thread) return c.json({ error: "Thread not found" }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: "You do not have permission to access this thread" }, 403);
    const origin = new URL(c.req.url).origin;
    return c.json({
      isPublic: thread.isPublic,
      shareToken: thread.shareToken,
      shareUrl: thread.shareToken ? `${origin}/shared/thread/${thread.shareToken}` : null,
      shareTokenCreatedAt: thread.shareTokenCreatedAt
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/[threadId]/share", action: "get_share_status", threadId: c.req.param("threadId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.post("/api/threads/:threadId/share", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.param("threadId");
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    const { action } = await c.req.json();
    if (!action || !["enable", "disable", "refresh"].includes(action)) {
      return c.json({ error: "Invalid action. Must be enable, disable, or refresh" }, 400);
    }
    const thread = await db.select({
      id: Threads.id,
      isPublic: Threads.isPublic,
      shareToken: Threads.shareToken,
      userId: Threads.userId
    }).from(Threads).where(eq(Threads.id, threadId)).get();
    if (!thread) return c.json({ error: "Thread not found" }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: "You do not have permission to modify this thread" }, 403);
    const now = nowISO();
    let newShareToken = null;
    let isPublic = thread.isPublic;
    if (action === "enable") {
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Threads).set({ isPublic: true, shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    } else if (action === "disable") {
      newShareToken = null;
      isPublic = false;
      await db.update(Threads).set({ isPublic: false, shareToken: null, shareTokenCreatedAt: null, updatedAt: now }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    } else if (action === "refresh") {
      if (!thread.isPublic) return c.json({ error: "Cannot refresh share link for a private thread" }, 400);
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Threads).set({ shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    }
    const origin = new URL(c.req.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/thread/${newShareToken}` : null;
    return c.json({ success: true, isPublic, shareToken: newShareToken, shareUrl, shareTokenCreatedAt: action !== "disable" ? now : null });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/[threadId]/share", action: "update_share_status", threadId: c.req.param("threadId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route9.get("/api/threads/:threadId/referenced-scripture-notes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteIdsParam = c.req.query("noteIds");
    if (!noteIdsParam) return c.json({ scriptureNoteIds: [] });
    const noteIds = noteIdsParam.split(",").filter((id) => id);
    if (noteIds.length === 0) return c.json({ scriptureNoteIds: [] });
    const references = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id)).where(and(inArray(NoteScriptureReferences.noteId, noteIds), eq(Notes.userId, auth.userId), eq(Notes.noteType, "scripture"))).all();
    const scriptureNoteIds = [...new Set(references.map((r) => r.scriptureNoteId))];
    return c.json({ scriptureNoteIds });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/threads/[threadId]/referenced-scripture-notes", action: "get_referenced_scripture_notes", threadId: c.req.param("threadId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var threads_default = route9;

// server/routes/notes.ts
import { Hono as Hono10 } from "hono";
init_db();
init_dates();
init_ids();

// src/utils/keyword-trie.ts
var MAX_PHRASE_WORDS = 5;
function buildKeywordTrie(keywords) {
  const root = { children: /* @__PURE__ */ new Map() };
  for (const keyword of keywords) {
    if (keyword.category !== "book" && keyword.category !== "character") continue;
    const mainPhrase = keyword.name.toLowerCase().trim();
    if (mainPhrase) insertPhrase(root, mainPhrase, keyword, false);
    for (const syn of keyword.synonyms) {
      const phrase = syn.toLowerCase().trim();
      if (phrase) insertPhrase(root, phrase, keyword, true);
    }
  }
  return { _root: root };
}
function insertPhrase(root, phrase, keyword, isSynonym) {
  const words = phrase.split(/\s+/).filter(Boolean);
  let node = root;
  for (const word of words) {
    let next = node.children.get(word);
    if (!next) {
      next = { children: /* @__PURE__ */ new Map() };
      node.children.set(word, next);
    }
    node = next;
  }
  if (!node.matches) node.matches = [];
  node.matches.push({ keyword, isSynonym });
}
function tokenize(text2) {
  if (!text2 || !text2.trim()) return [];
  return text2.toLowerCase().match(/\b[\w']+\b/g) ?? [];
}
function findWordBoundMatches(trie, title, content) {
  const root = trie._root;
  const result = /* @__PURE__ */ new Map();
  function scanText(text2, inTitle) {
    const words = tokenize(text2);
    for (let i = 0; i < words.length; i++) {
      for (let len = 1; len <= Math.min(MAX_PHRASE_WORDS, words.length - i); len++) {
        const phraseWords = words.slice(i, i + len);
        const stats = lookupPhrase(root, phraseWords);
        if (!stats) continue;
        for (const { keyword, isSynonym } of stats) {
          const conf = isSynonym ? keyword.confidence * 0.8 : keyword.confidence;
          const existing = result.get(keyword);
          if (!existing) {
            result.set(keyword, {
              confidence: conf,
              inTitle,
              inContent: !inTitle,
              frequency: 1
            });
          } else {
            existing.frequency += 1;
            if (inTitle) existing.inTitle = true;
            else existing.inContent = true;
            existing.confidence = Math.max(existing.confidence, conf);
          }
        }
      }
    }
  }
  if (title?.trim()) scanText(title.trim(), true);
  if (content?.trim()) scanText(content.trim(), false);
  return result;
}
function lookupPhrase(root, words) {
  let node = root;
  for (const word of words) {
    node = node?.children.get(word);
    if (!node) return null;
  }
  return node.matches ?? null;
}

// src/utils/bible-study-keywords.ts
var BIBLE_STUDY_KEYWORDS = [
  // Biblical Books
  { name: "Genesis", category: "book", synonyms: ["gen", "first book"], confidence: 0.9 },
  { name: "Exodus", category: "book", synonyms: ["exo", "second book"], confidence: 0.9 },
  { name: "Leviticus", category: "book", synonyms: ["lev", "third book"], confidence: 0.9 },
  { name: "Numbers", category: "book", synonyms: ["num", "fourth book"], confidence: 0.9 },
  { name: "Deuteronomy", category: "book", synonyms: ["deut", "fifth book"], confidence: 0.9 },
  { name: "Joshua", category: "book", synonyms: ["josh"], confidence: 0.9 },
  { name: "Judges", category: "book", synonyms: ["judg"], confidence: 0.9 },
  { name: "Ruth", category: "book", synonyms: [], confidence: 0.9 },
  { name: "1 Samuel", category: "book", synonyms: ["1 sam", "first samuel"], confidence: 0.9 },
  { name: "2 Samuel", category: "book", synonyms: ["2 sam", "second samuel"], confidence: 0.9 },
  { name: "1 Kings", category: "book", synonyms: ["1 kgs", "first kings"], confidence: 0.9 },
  { name: "2 Kings", category: "book", synonyms: ["2 kgs", "second kings"], confidence: 0.9 },
  { name: "1 Chronicles", category: "book", synonyms: ["1 chron", "first chronicles"], confidence: 0.9 },
  { name: "2 Chronicles", category: "book", synonyms: ["2 chron", "second chronicles"], confidence: 0.9 },
  { name: "Ezra", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Nehemiah", category: "book", synonyms: ["neh"], confidence: 0.9 },
  { name: "Esther", category: "book", synonyms: ["esth"], confidence: 0.9 },
  { name: "Job", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Psalms", category: "book", synonyms: ["psalm", "ps"], confidence: 0.9 },
  { name: "Proverbs", category: "book", synonyms: ["prov", "proverb"], confidence: 0.9 },
  { name: "Ecclesiastes", category: "book", synonyms: ["eccl", "ecc"], confidence: 0.9 },
  { name: "Song of Songs", category: "book", synonyms: ["song of solomon", "sos"], confidence: 0.9 },
  { name: "Isaiah", category: "book", synonyms: ["isa"], confidence: 0.9 },
  { name: "Jeremiah", category: "book", synonyms: ["jer"], confidence: 0.9 },
  { name: "Lamentations", category: "book", synonyms: ["lam"], confidence: 0.9 },
  { name: "Ezekiel", category: "book", synonyms: ["ezek"], confidence: 0.9 },
  { name: "Daniel", category: "book", synonyms: ["dan"], confidence: 0.9 },
  { name: "Hosea", category: "book", synonyms: ["hos"], confidence: 0.9 },
  { name: "Joel", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Amos", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Obadiah", category: "book", synonyms: ["obad"], confidence: 0.9 },
  { name: "Jonah", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Micah", category: "book", synonyms: ["mic"], confidence: 0.9 },
  { name: "Nahum", category: "book", synonyms: ["nah"], confidence: 0.9 },
  { name: "Habakkuk", category: "book", synonyms: ["hab"], confidence: 0.9 },
  { name: "Zephaniah", category: "book", synonyms: ["zeph"], confidence: 0.9 },
  { name: "Haggai", category: "book", synonyms: ["hag"], confidence: 0.9 },
  { name: "Zechariah", category: "book", synonyms: ["zech"], confidence: 0.9 },
  { name: "Malachi", category: "book", synonyms: ["mal"], confidence: 0.9 },
  { name: "Matthew", category: "book", synonyms: ["matt", "mt"], confidence: 0.9 },
  { name: "Mark", category: "book", synonyms: ["mk", "mr"], confidence: 0.9 },
  { name: "Luke", category: "book", synonyms: ["lk"], confidence: 0.9 },
  { name: "John", category: "book", synonyms: ["jn"], confidence: 0.9 },
  { name: "Acts", category: "book", synonyms: ["acts of the apostles"], confidence: 0.9 },
  { name: "Romans", category: "book", synonyms: ["rom"], confidence: 0.9 },
  { name: "1 Corinthians", category: "book", synonyms: ["1 cor", "first corinthians"], confidence: 0.9 },
  { name: "2 Corinthians", category: "book", synonyms: ["2 cor", "second corinthians"], confidence: 0.9 },
  { name: "Galatians", category: "book", synonyms: ["gal"], confidence: 0.9 },
  { name: "Ephesians", category: "book", synonyms: ["eph"], confidence: 0.9 },
  { name: "Philippians", category: "book", synonyms: ["phil"], confidence: 0.9 },
  { name: "Colossians", category: "book", synonyms: ["col"], confidence: 0.9 },
  { name: "1 Thessalonians", category: "book", synonyms: ["1 thess", "first thessalonians"], confidence: 0.9 },
  { name: "2 Thessalonians", category: "book", synonyms: ["2 thess", "second thessalonians"], confidence: 0.9 },
  { name: "1 Timothy", category: "book", synonyms: ["1 tim", "first timothy"], confidence: 0.9 },
  { name: "2 Timothy", category: "book", synonyms: ["2 tim", "second timothy"], confidence: 0.9 },
  { name: "Titus", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Philemon", category: "book", synonyms: ["phlm"], confidence: 0.9 },
  { name: "Hebrews", category: "book", synonyms: ["heb"], confidence: 0.9 },
  { name: "James", category: "book", synonyms: ["jas"], confidence: 0.9 },
  { name: "1 Peter", category: "book", synonyms: ["1 pet", "first peter"], confidence: 0.9 },
  { name: "2 Peter", category: "book", synonyms: ["2 pet", "second peter"], confidence: 0.9 },
  { name: "1 John", category: "book", synonyms: ["1 jn", "first john"], confidence: 0.9 },
  { name: "2 John", category: "book", synonyms: ["2 jn", "second john"], confidence: 0.9 },
  { name: "3 John", category: "book", synonyms: ["3 jn", "third john"], confidence: 0.9 },
  { name: "Jude", category: "book", synonyms: [], confidence: 0.9 },
  { name: "Revelation", category: "book", synonyms: ["rev", "apocalypse"], confidence: 0.9 },
  // Biblical Characters
  { name: "Jesus", category: "character", synonyms: ["christ", "jesus christ", "lord", "savior", "messiah"], confidence: 0.95 },
  { name: "God", category: "character", synonyms: ["lord", "father", "almighty", "creator"], confidence: 0.95 },
  { name: "Holy Spirit", category: "character", synonyms: ["spirit", "holy ghost", "comforter"], confidence: 0.9 },
  { name: "Moses", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Abraham", category: "character", synonyms: ["abram"], confidence: 0.9 },
  { name: "David", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Paul", category: "character", synonyms: ["apostle paul", "saul"], confidence: 0.9 },
  { name: "Peter", category: "character", synonyms: ["simon peter", "simon"], confidence: 0.9 },
  { name: "John", category: "character", synonyms: ["apostle john", "john the apostle"], confidence: 0.9 },
  { name: "Mary", category: "character", synonyms: ["virgin mary", "mary mother of jesus"], confidence: 0.9 },
  { name: "Noah", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Adam", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Eve", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Joseph", category: "character", synonyms: ["joseph son of jacob", "joseph of egypt"], confidence: 0.9 },
  { name: "Jacob", category: "character", synonyms: ["israel"], confidence: 0.9 },
  { name: "Isaac", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Sarah", category: "character", synonyms: ["sarah wife of abraham"], confidence: 0.9 },
  { name: "Elijah", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Elisha", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Daniel", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Esther", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Ruth", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Samson", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Samuel", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Solomon", category: "character", synonyms: [], confidence: 0.9 },
  { name: "Isaiah", category: "character", synonyms: ["prophet isaiah"], confidence: 0.9 },
  { name: "Jeremiah", category: "character", synonyms: ["prophet jeremiah"], confidence: 0.9 },
  { name: "Ezekiel", category: "character", synonyms: ["prophet ezekiel"], confidence: 0.9 },
  { name: "Daniel", category: "character", synonyms: ["prophet daniel"], confidence: 0.9 },
  { name: "Jonah", category: "character", synonyms: ["prophet jonah"], confidence: 0.9 },
  { name: "John the Baptist", category: "character", synonyms: ["john baptist", "baptist"], confidence: 0.9 },
  { name: "Mary Magdalene", category: "character", synonyms: ["magdalene"], confidence: 0.9 },
  { name: "Thomas", category: "character", synonyms: ["doubting thomas"], confidence: 0.9 },
  { name: "Judas", category: "character", synonyms: ["judas iscariot"], confidence: 0.9 },
  { name: "Pilate", category: "character", synonyms: ["pontius pilate"], confidence: 0.9 },
  // Biblical Places
  { name: "Jerusalem", category: "place", synonyms: ["holy city", "zion"], confidence: 0.9 },
  { name: "Bethlehem", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Nazareth", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Galilee", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Capernaum", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Gethsemane", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Golgotha", category: "place", synonyms: ["calvary"], confidence: 0.9 },
  { name: "Garden of Eden", category: "place", synonyms: ["eden"], confidence: 0.9 },
  { name: "Mount Sinai", category: "place", synonyms: ["sinai"], confidence: 0.9 },
  { name: "Red Sea", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Jordan River", category: "place", synonyms: ["jordan"], confidence: 0.9 },
  { name: "Dead Sea", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Mount of Olives", category: "place", synonyms: ["olives"], confidence: 0.9 },
  { name: "Temple", category: "place", synonyms: ["jerusalem temple", "holy temple"], confidence: 0.9 },
  { name: "Rome", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Corinth", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Ephesus", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Philippi", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Thessalonica", category: "place", synonyms: [], confidence: 0.9 },
  { name: "Antioch", category: "place", synonyms: [], confidence: 0.9 },
  // Spiritual Themes
  { name: "Prayer", category: "spiritual", synonyms: ["praying", "intercession", "petition"], confidence: 0.8 },
  { name: "Faith", category: "spiritual", synonyms: ["belief", "trust", "confidence"], confidence: 0.8 },
  { name: "Love", category: "spiritual", synonyms: ["charity", "agape", "compassion"], confidence: 0.8 },
  { name: "Hope", category: "spiritual", synonyms: ["expectation", "anticipation"], confidence: 0.8 },
  { name: "Grace", category: "spiritual", synonyms: ["favor", "mercy", "unmerited favor"], confidence: 0.8 },
  { name: "Mercy", category: "spiritual", synonyms: ["compassion", "forgiveness", "pity"], confidence: 0.8 },
  { name: "Forgiveness", category: "spiritual", synonyms: ["pardon", "absolution", "reconciliation"], confidence: 0.8 },
  { name: "Salvation", category: "spiritual", synonyms: ["redemption", "deliverance", "rescue"], confidence: 0.8 },
  { name: "Repentance", category: "spiritual", synonyms: ["turning", "conversion", "change of heart"], confidence: 0.8 },
  { name: "Worship", category: "spiritual", synonyms: ["praise", "adoration", "reverence"], confidence: 0.8 },
  { name: "Praise", category: "spiritual", synonyms: ["worship", "glorify", "exalt"], confidence: 0.8 },
  { name: "Thanksgiving", category: "spiritual", synonyms: ["gratitude", "thankfulness"], confidence: 0.8 },
  { name: "Peace", category: "spiritual", synonyms: ["tranquility", "serenity", "shalom"], confidence: 0.8 },
  { name: "Joy", category: "spiritual", synonyms: ["gladness", "happiness", "rejoicing"], confidence: 0.8 },
  { name: "Patience", category: "spiritual", synonyms: ["endurance", "perseverance", "longsuffering"], confidence: 0.8 },
  { name: "Kindness", category: "spiritual", synonyms: ["gentleness", "goodness", "compassion"], confidence: 0.8 },
  { name: "Goodness", category: "spiritual", synonyms: ["virtue", "righteousness", "moral excellence"], confidence: 0.8 },
  { name: "Faithfulness", category: "spiritual", synonyms: ["loyalty", "reliability", "steadfastness"], confidence: 0.8 },
  { name: "Gentleness", category: "spiritual", synonyms: ["meekness", "humility", "mildness"], confidence: 0.8 },
  { name: "Self-control", category: "spiritual", synonyms: ["temperance", "discipline", "restraint"], confidence: 0.8 },
  // Biblical Themes
  { name: "Covenant", category: "biblical", synonyms: ["agreement", "promise", "pact"], confidence: 0.8 },
  { name: "Redemption", category: "biblical", synonyms: ["salvation", "deliverance", "ransom"], confidence: 0.8 },
  { name: "Atonement", category: "biblical", synonyms: ["reconciliation", "propitiation"], confidence: 0.8 },
  { name: "Resurrection", category: "biblical", synonyms: ["rising", "new life"], confidence: 0.8 },
  { name: "Incarnation", category: "biblical", synonyms: ["god becoming man", "enfleshment"], confidence: 0.8 },
  { name: "Trinity", category: "biblical", synonyms: ["godhead", "three in one"], confidence: 0.8 },
  { name: "Kingdom of God", category: "biblical", synonyms: ["kingdom of heaven", "god's kingdom"], confidence: 0.8 },
  { name: "Gospel", category: "biblical", synonyms: ["good news", "evangel"], confidence: 0.8 },
  { name: "Discipleship", category: "biblical", synonyms: ["following christ", "being a disciple"], confidence: 0.8 },
  { name: "Mission", category: "biblical", synonyms: ["evangelism", "witnessing", "sharing faith"], confidence: 0.8 },
  { name: "Parables", category: "biblical", synonyms: ["stories", "teachings"], confidence: 0.8 },
  { name: "Miracles", category: "biblical", synonyms: ["wonders", "signs"], confidence: 0.8 },
  { name: "Prophecy", category: "biblical", synonyms: ["prophecies", "foretelling"], confidence: 0.8 },
  { name: "Law", category: "biblical", synonyms: ["commandments", "statutes"], confidence: 0.8 },
  { name: "Sacrifice", category: "biblical", synonyms: ["offering", "giving up"], confidence: 0.8 },
  { name: "Temple", category: "biblical", synonyms: ["sanctuary", "holy place"], confidence: 0.8 },
  { name: "Sabbath", category: "biblical", synonyms: ["rest", "day of rest"], confidence: 0.8 },
  { name: "Baptism", category: "biblical", synonyms: ["immersion", "washing"], confidence: 0.8 },
  { name: "Communion", category: "biblical", synonyms: ["lord's supper", "eucharist"], confidence: 0.8 },
  { name: "Marriage", category: "biblical", synonyms: ["wedding", "union"], confidence: 0.8 },
  // Life Themes
  { name: "Family", category: "life", synonyms: ["relatives", "household"], confidence: 0.7 },
  { name: "Marriage", category: "life", synonyms: ["wedding", "union", "relationship"], confidence: 0.7 },
  { name: "Parenting", category: "life", synonyms: ["childrearing", "raising children"], confidence: 0.7 },
  { name: "Friendship", category: "life", synonyms: ["companionship", "fellowship"], confidence: 0.7 },
  { name: "Work", category: "life", synonyms: ["labor", "employment", "vocation"], confidence: 0.7 },
  { name: "Money", category: "life", synonyms: ["finances", "wealth", "prosperity"], confidence: 0.7 },
  { name: "Health", category: "life", synonyms: ["wellness", "healing"], confidence: 0.7 },
  { name: "Suffering", category: "life", synonyms: ["pain", "trial", "hardship"], confidence: 0.7 },
  { name: "Death", category: "life", synonyms: ["dying", "mortality"], confidence: 0.7 },
  { name: "Grief", category: "life", synonyms: ["mourning", "sorrow", "loss"], confidence: 0.7 },
  { name: "Fear", category: "life", synonyms: ["anxiety", "worry", "concern"], confidence: 0.7 },
  { name: "Anger", category: "life", synonyms: ["wrath", "rage", "fury"], confidence: 0.7 },
  { name: "Pride", category: "life", synonyms: ["arrogance", "conceit", "vanity"], confidence: 0.7 },
  { name: "Humility", category: "life", synonyms: ["meekness", "modesty"], confidence: 0.7 },
  { name: "Wisdom", category: "life", synonyms: ["understanding", "insight"], confidence: 0.7 },
  { name: "Knowledge", category: "life", synonyms: ["learning", "education"], confidence: 0.7 },
  { name: "Truth", category: "life", synonyms: ["honesty", "veracity"], confidence: 0.7 },
  { name: "Justice", category: "life", synonyms: ["righteousness", "fairness"], confidence: 0.7 },
  { name: "Peace", category: "life", synonyms: ["harmony", "tranquility"], confidence: 0.7 },
  { name: "Hope", category: "life", synonyms: ["optimism", "expectation"], confidence: 0.7 }
];
var keywordTrie = null;
function getKeywordTrie() {
  if (!keywordTrie) keywordTrie = buildKeywordTrie(BIBLE_STUDY_KEYWORDS);
  return keywordTrie;
}
function findKeywordsInTextWithPriority(fullText, title, content) {
  const foundKeywords = [];
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  const trie = getKeywordTrie();
  const wordBoundMatches = findWordBoundMatches(trie, title, content);
  for (const [keyword, stats] of wordBoundMatches) {
    const titleBoost = stats.inTitle ? 0.2 : 0;
    const frequencyBoost = stats.frequency > 1 ? Math.min(0.5, (stats.frequency - 1) * 0.1) : 0;
    foundKeywords.push({
      keyword,
      confidence: Math.min(1, stats.confidence + titleBoost + frequencyBoost)
    });
  }
  for (const keyword of BIBLE_STUDY_KEYWORDS) {
    if (keyword.category === "book" || keyword.category === "character") continue;
    let found = false;
    let confidence = keyword.confidence;
    let foundInTitle = false;
    let foundInContent = false;
    let frequency = 0;
    const keywordLower = keyword.name.toLowerCase();
    if (titleLower?.includes(keywordLower)) {
      foundInTitle = true;
      found = true;
      confidence = keyword.confidence;
      frequency += titleLower.split(keywordLower).length - 1;
    }
    if (contentLower?.includes(keywordLower)) {
      foundInContent = true;
      found = true;
      confidence = keyword.confidence;
      frequency += contentLower.split(keywordLower).length - 1;
    }
    for (const synonym of keyword.synonyms) {
      const synonymLower = synonym.toLowerCase();
      if (titleLower?.includes(synonymLower)) {
        foundInTitle = true;
        found = true;
        confidence = Math.max(confidence, keyword.confidence * 0.8);
        frequency += titleLower.split(synonymLower).length - 1;
      }
      if (contentLower?.includes(synonymLower)) {
        foundInContent = true;
        found = true;
        confidence = Math.max(confidence, keyword.confidence * 0.8);
        frequency += contentLower.split(synonymLower).length - 1;
      }
    }
    if (found) {
      const titleBoost = foundInTitle ? 0.2 : 0;
      const frequencyBoost = frequency > 1 ? Math.min(0.5, (frequency - 1) * 0.1) : 0;
      foundKeywords.push({
        keyword,
        confidence: Math.min(1, confidence + titleBoost + frequencyBoost)
      });
    }
  }
  return foundKeywords.sort((a, b) => b.confidence - a.confidence);
}

// src/data/bible-chapters.json
var bible_chapters_default = [
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 67
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 55
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 57
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 43,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 44,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 45,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 46,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 47,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 48,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 49,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Genesis",
    bookOrder: 1,
    testament: "old",
    chapter: 50,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Exodus",
    bookOrder: 2,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 59
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 57
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 55
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Leviticus",
    bookOrder: 3,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 54
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 89
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 45
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 65
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 54
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 56
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Numbers",
    bookOrder: 4,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 68
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Deuteronomy",
    bookOrder: 5,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 63
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 45
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Joshua",
    bookOrder: 6,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 57
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 48
  },
  {
    book: "Judges",
    bookOrder: 7,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Ruth",
    bookOrder: 8,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ruth",
    bookOrder: 8,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ruth",
    bookOrder: 8,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ruth",
    bookOrder: 8,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 58
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Samuel",
    bookOrder: 9,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "2 Samuel",
    bookOrder: 10,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 53
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 66
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "1 Kings",
    bookOrder: 11,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 53
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "2 Kings",
    bookOrder: 12,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 54
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 55
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 81
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 Chronicles",
    bookOrder: 13,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "2 Chronicles",
    bookOrder: 14,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 70
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Ezra",
    bookOrder: 15,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 73
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Nehemiah",
    bookOrder: 16,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Esther",
    bookOrder: 17,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 3
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Job",
    bookOrder: 18,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 43,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 44,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 45,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 46,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 47,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 48,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 49,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 50,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 51,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 52,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 53,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 54,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 55,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 56,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 57,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 58,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 59,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 60,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 61,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 62,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 63,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 64,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 65,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 66,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 67,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 68,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 69,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 70,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 71,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 72,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 73,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 74,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 75,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 76,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 77,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 78,
    startVerse: 1,
    endVerse: 72
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 79,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 80,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 81,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 82,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 83,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 84,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 85,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 86,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 87,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 88,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 89,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 90,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 91,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 92,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 93,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 94,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 95,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 96,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 97,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 98,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 99,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 100,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 101,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 102,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 103,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 104,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 105,
    startVerse: 1,
    endVerse: 45
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 106,
    startVerse: 1,
    endVerse: 48
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 107,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 108,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 109,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 110,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 111,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 112,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 113,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 114,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 115,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 116,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 117,
    startVerse: 1,
    endVerse: 2
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 118,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 119,
    startVerse: 1,
    endVerse: 176
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 120,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 121,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 122,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 123,
    startVerse: 1,
    endVerse: 4
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 124,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 125,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 126,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 127,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 128,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 129,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 130,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 131,
    startVerse: 1,
    endVerse: 3
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 132,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 133,
    startVerse: 1,
    endVerse: 3
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 134,
    startVerse: 1,
    endVerse: 3
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 135,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 136,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 137,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 138,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 139,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 140,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 141,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 142,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 143,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 144,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 145,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 146,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 147,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 148,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 149,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Psalms",
    bookOrder: 19,
    testament: "old",
    chapter: 150,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Proverbs",
    bookOrder: 20,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Ecclesiastes",
    bookOrder: 21,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Song of Solomon",
    bookOrder: 22,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 43,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 44,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 45,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 46,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 47,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 48,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 49,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 50,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 51,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 52,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 53,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 54,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 55,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 56,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 57,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 58,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 59,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 60,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 61,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 62,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 63,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 64,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 65,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Isaiah",
    bookOrder: 23,
    testament: "old",
    chapter: 66,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 43,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 44,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 45,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 46,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 47,
    startVerse: 1,
    endVerse: 7
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 48,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 49,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 50,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 51,
    startVerse: 1,
    endVerse: 64
  },
  {
    book: "Jeremiah",
    bookOrder: 24,
    testament: "old",
    chapter: 52,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Lamentations",
    bookOrder: 25,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Lamentations",
    bookOrder: 25,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Lamentations",
    bookOrder: 25,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 66
  },
  {
    book: "Lamentations",
    bookOrder: 25,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Lamentations",
    bookOrder: 25,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 15,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 16,
    startVerse: 1,
    endVerse: 63
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 17,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 18,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 19,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 20,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 21,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 22,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 23,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 24,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 25,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 26,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 27,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 28,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 29,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 30,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 31,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 32,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 33,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 34,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 35,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 36,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 37,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 38,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 39,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 40,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 41,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 42,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 43,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 44,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 45,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 46,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 47,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ezekiel",
    bookOrder: 26,
    testament: "old",
    chapter: 48,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 45
  },
  {
    book: "Daniel",
    bookOrder: 27,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 5
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Hosea",
    bookOrder: 28,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Joel",
    bookOrder: 29,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Joel",
    bookOrder: 29,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Joel",
    bookOrder: 29,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Amos",
    bookOrder: 30,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Obadiah",
    bookOrder: 31,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Jonah",
    bookOrder: 32,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Jonah",
    bookOrder: 32,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Jonah",
    bookOrder: 32,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Jonah",
    bookOrder: 32,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Micah",
    bookOrder: 33,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Nahum",
    bookOrder: 34,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Nahum",
    bookOrder: 34,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Nahum",
    bookOrder: 34,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Habakkuk",
    bookOrder: 35,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Habakkuk",
    bookOrder: 35,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Habakkuk",
    bookOrder: 35,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Zephaniah",
    bookOrder: 36,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Zephaniah",
    bookOrder: 36,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Zephaniah",
    bookOrder: 36,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Haggai",
    bookOrder: 37,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Haggai",
    bookOrder: 37,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 5,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 6,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 7,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 8,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 9,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 10,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 11,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 12,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 13,
    startVerse: 1,
    endVerse: 9
  },
  {
    book: "Zechariah",
    bookOrder: 38,
    testament: "old",
    chapter: 14,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Malachi",
    bookOrder: 39,
    testament: "old",
    chapter: 1,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Malachi",
    bookOrder: 39,
    testament: "old",
    chapter: 2,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Malachi",
    bookOrder: 39,
    testament: "old",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Malachi",
    bookOrder: 39,
    testament: "old",
    chapter: 4,
    startVerse: 1,
    endVerse: 6
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 48
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 58
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 17,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 18,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 19,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 20,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 21,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 22,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 23,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 24,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 25,
    startVerse: 1,
    endVerse: 46
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 26,
    startVerse: 1,
    endVerse: 75
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 27,
    startVerse: 1,
    endVerse: 66
  },
  {
    book: "Matthew",
    bookOrder: 40,
    testament: "new",
    chapter: 28,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 45
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 56
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 72
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Mark",
    bookOrder: 41,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 80
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 49
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 56
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 62
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 54
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 59
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 17,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 18,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 19,
    startVerse: 1,
    endVerse: 48
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 20,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 21,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 22,
    startVerse: 1,
    endVerse: 71
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 23,
    startVerse: 1,
    endVerse: 56
  },
  {
    book: "Luke",
    bookOrder: 42,
    testament: "new",
    chapter: 24,
    startVerse: 1,
    endVerse: 53
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 51
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 54
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 71
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 53
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 59
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 57
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 50
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 17,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 18,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 19,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 20,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "John",
    bookOrder: 43,
    testament: "new",
    chapter: 21,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 47
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 37
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 42
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 60
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 43
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 48
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 52
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 17,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 18,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 19,
    startVerse: 1,
    endVerse: 41
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 20,
    startVerse: 1,
    endVerse: 38
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 21,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 22,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 23,
    startVerse: 1,
    endVerse: 35
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 24,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 25,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 26,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 27,
    startVerse: 1,
    endVerse: 44
  },
  {
    book: "Acts",
    bookOrder: 44,
    testament: "new",
    chapter: 28,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 36
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Romans",
    bookOrder: 45,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 34
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 58
  },
  {
    book: "1 Corinthians",
    bookOrder: 46,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Corinthians",
    bookOrder: 47,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 31
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "Galatians",
    bookOrder: 48,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 32
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 33
  },
  {
    book: "Ephesians",
    bookOrder: 49,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Philippians",
    bookOrder: 50,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Philippians",
    bookOrder: 50,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 30
  },
  {
    book: "Philippians",
    bookOrder: 50,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Philippians",
    bookOrder: 50,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Colossians",
    bookOrder: 51,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Colossians",
    bookOrder: 51,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 23
  },
  {
    book: "Colossians",
    bookOrder: 51,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Colossians",
    bookOrder: 51,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "1 Thessalonians",
    bookOrder: 52,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "1 Thessalonians",
    bookOrder: 52,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "1 Thessalonians",
    bookOrder: 52,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "1 Thessalonians",
    bookOrder: 52,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "1 Thessalonians",
    bookOrder: 52,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "2 Thessalonians",
    bookOrder: 53,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 12
  },
  {
    book: "2 Thessalonians",
    bookOrder: 53,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "2 Thessalonians",
    bookOrder: 53,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Timothy",
    bookOrder: 54,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Timothy",
    bookOrder: 55,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "2 Timothy",
    bookOrder: 55,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "2 Timothy",
    bookOrder: 55,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "2 Timothy",
    bookOrder: 55,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Titus",
    bookOrder: 56,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Titus",
    bookOrder: 56,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Titus",
    bookOrder: 56,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Philemon",
    bookOrder: 57,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 16
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 28
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 39
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 40
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Hebrews",
    bookOrder: 58,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "James",
    bookOrder: 59,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "James",
    bookOrder: 59,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 26
  },
  {
    book: "James",
    bookOrder: 59,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "James",
    bookOrder: 59,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "James",
    bookOrder: 59,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "1 Peter",
    bookOrder: 60,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Peter",
    bookOrder: 60,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "1 Peter",
    bookOrder: 60,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "1 Peter",
    bookOrder: 60,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "1 Peter",
    bookOrder: 60,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "2 Peter",
    bookOrder: 61,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 Peter",
    bookOrder: 61,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "2 Peter",
    bookOrder: 61,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "1 John",
    bookOrder: 62,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 10
  },
  {
    book: "1 John",
    bookOrder: 62,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "1 John",
    bookOrder: 62,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "1 John",
    bookOrder: 62,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "1 John",
    bookOrder: 62,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "2 John",
    bookOrder: 63,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "3 John",
    bookOrder: 64,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Jude",
    bookOrder: 65,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 25
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 1,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 2,
    startVerse: 1,
    endVerse: 29
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 3,
    startVerse: 1,
    endVerse: 22
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 4,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 5,
    startVerse: 1,
    endVerse: 14
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 6,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 7,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 8,
    startVerse: 1,
    endVerse: 13
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 9,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 10,
    startVerse: 1,
    endVerse: 11
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 11,
    startVerse: 1,
    endVerse: 19
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 12,
    startVerse: 1,
    endVerse: 17
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 13,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 14,
    startVerse: 1,
    endVerse: 20
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 15,
    startVerse: 1,
    endVerse: 8
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 16,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 17,
    startVerse: 1,
    endVerse: 18
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 18,
    startVerse: 1,
    endVerse: 24
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 19,
    startVerse: 1,
    endVerse: 21
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 20,
    startVerse: 1,
    endVerse: 15
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 21,
    startVerse: 1,
    endVerse: 27
  },
  {
    book: "Revelation",
    bookOrder: 66,
    testament: "new",
    chapter: 22,
    startVerse: 1,
    endVerse: 21
  }
];

// src/utils/scripture-detector.ts
var BIBLE_CHAPTERS_MAP = null;
function buildBibleChaptersMap() {
  if (BIBLE_CHAPTERS_MAP) {
    return BIBLE_CHAPTERS_MAP;
  }
  const map = /* @__PURE__ */ new Map();
  const data = bible_chapters_default;
  for (const chapter of data) {
    const bookName = chapter.book;
    if (!map.has(bookName)) {
      map.set(bookName, /* @__PURE__ */ new Map());
    }
    const bookMap = map.get(bookName);
    bookMap.set(chapter.chapter, {
      startVerse: chapter.startVerse,
      endVerse: chapter.endVerse
    });
  }
  BIBLE_CHAPTERS_MAP = map;
  return map;
}
function getChapterVerseRange(book, chapter) {
  const map = buildBibleChaptersMap();
  const bookMap = map.get(book);
  if (!bookMap) {
    return null;
  }
  const chapterData = bookMap.get(chapter);
  if (!chapterData) {
    return null;
  }
  return { start: chapterData.startVerse, end: chapterData.endVerse };
}
function validateVerseNumber(book, chapter, verse) {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  return verse >= range.start && verse <= range.end;
}
function validateVerseRange(book, chapter, startVerse, endVerse) {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  return startVerse >= range.start && startVerse <= range.end && endVerse >= range.start && endVerse <= range.end && startVerse <= endVerse;
}
var getBookNameVariations = () => {
  const variations = [];
  BIBLE_STUDY_KEYWORDS.filter((k) => k.category === "book").forEach((k) => {
    variations.push(k.name);
    variations.push(...k.synonyms);
  });
  return variations;
};
var normalizeText = (text2) => {
  return text2.toLowerCase().replace(/[.,;:!?'"()\-–—]/g, "").replace(/\s+/g, " ").trim();
};
function validateAndWarn(ref) {
  const { book, chapter, verse } = ref;
  if (Array.isArray(verse)) {
    const [start, end] = verse;
    if (!validateVerseRange(book, chapter, start, end)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        console.warn(`Invalid verse range: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        console.warn(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  } else {
    if (!validateVerseNumber(book, chapter, verse)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        console.warn(`Invalid verse number: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        console.warn(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  }
  return ref;
}
var parseReference = (match) => {
  const patterns = [
    // Comma-separated verse groups: "Book 1:2-3, 5-7, 10" or "Book 1:2 - 3, 5 - 7, 10"
    /^(.+?)\s+(\d+):((?:\d+(?:\s*[-–—]\s*\d+)?)(?:,\s*\d+(?:\s*[-–—]\s*\d+)?)*)$/,
    // Single range: "Book 1:2-3" or "Book 1:2 - 3"
    /^(.+?)\s+(\d+):(\d+)\s*[-–—]\s*(\d+)$/,
    // Single verse: "Book 1:2"
    /^(.+?)\s+(\d+):(\d+)$/,
    // Chapter only: "Book 1" (treat as chapter 1, verse 1)
    /^(.+?)\s+(\d+)$/
  ];
  const bookNames = getBookNameVariations();
  const normalizedMatch = match.trim();
  for (const pattern of patterns) {
    const matchResult = normalizedMatch.match(pattern);
    if (!matchResult) continue;
    let bookPart = matchResult[1].trim();
    const chapter = parseInt(matchResult[2]);
    for (const bookName of bookNames) {
      const normalizedBookName = normalizeText(bookName);
      const normalizedBookPart = normalizeText(bookPart);
      if (normalizedBookPart === normalizedBookName || normalizedBookPart.startsWith(normalizedBookName) || normalizedBookName.startsWith(normalizedBookPart)) {
        const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
          (k) => k.category === "book" && (k.name.toLowerCase() === bookName.toLowerCase() || k.synonyms.some((s) => s.toLowerCase() === bookName.toLowerCase()))
        )?.name || bookName;
        if (matchResult.length === 4 && matchResult[3].includes(",")) {
          const verseGroups = matchResult[3].trim();
          const allVerses = [];
          verseGroups.split(",").forEach((group) => {
            const trimmed = group.trim();
            if (/[-–—]/.test(trimmed)) {
              const [start, end] = trimmed.split(/[-–—]/).map((v) => parseInt(v.trim()));
              if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let v = start; v <= end; v++) {
                  allVerses.push(v);
                }
              } else if (!isNaN(start) && !isNaN(end) && start > end) {
                allVerses.push(start);
              }
            } else {
              allVerses.push(parseInt(trimmed));
            }
          });
          const verseStart = Math.min(...allVerses);
          const verseEnd = Math.max(...allVerses);
          let cleanVerseGroups = verseGroups.replace(/,\s+/g, ",");
          cleanVerseGroups = cleanVerseGroups.replace(/\s*-\s*/g, "-");
          return validateAndWarn({
            book: canonicalBook,
            chapter,
            verse: [verseStart, verseEnd],
            reference: `${canonicalBook} ${chapter}:${cleanVerseGroups}`
          });
        } else if (matchResult.length === 5) {
          const verseStart = parseInt(matchResult[3]);
          const verseEnd = parseInt(matchResult[4]);
          if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart <= verseEnd) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [verseStart, verseEnd],
              reference: `${canonicalBook} ${chapter}:${verseStart}-${verseEnd}`
            });
          } else if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart > verseEnd) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: verseStart,
              reference: `${canonicalBook} ${chapter}:${verseStart}`
            });
          }
        } else if (matchResult.length === 4 && !matchResult[3].includes(",") && /[-–—]/.test(matchResult[3])) {
          const versePart = matchResult[3].trim();
          const [start, end] = versePart.split(/\s*[-–—]\s*/).map((v) => parseInt(v.trim()));
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [start, end],
              reference: `${canonicalBook} ${chapter}:${start}-${end}`
            });
          } else if (!isNaN(start) && !isNaN(end) && start > end) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: start,
              reference: `${canonicalBook} ${chapter}:${start}`
            });
          }
        } else if (matchResult.length === 4 && !matchResult[3].includes(",") && !/[-–—]/.test(matchResult[3])) {
          const verse = parseInt(matchResult[3]);
          if (!isNaN(verse)) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse,
              reference: `${canonicalBook} ${chapter}:${verse}`
            });
          }
        } else if (matchResult.length === 3) {
          return validateAndWarn({
            book: canonicalBook,
            chapter,
            verse: 1,
            reference: `${canonicalBook} ${chapter}:1`
          });
        }
      }
    }
  }
  return null;
};
function isValidScriptureContext(text2, matchIndex, matchLength) {
  const before = text2.substring(Math.max(0, matchIndex - 30), matchIndex).trim();
  const after = text2.substring(matchIndex + matchLength, matchIndex + matchLength + 30).trim();
  const invalidAfterPattern = /\b(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\s+(ago|later|before|after)\b/i;
  if (invalidAfterPattern.test(after)) {
    return false;
  }
  const falsePositivePattern = /^\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\b/i;
  if (falsePositivePattern.test(after)) {
    const refText = text2.substring(matchIndex, matchIndex + matchLength);
    if (!refText.includes(":") && falsePositivePattern.test(after)) {
      return false;
    }
  }
  const firstCharAfter = after.charAt(0);
  if (!firstCharAfter) {
    return true;
  }
  const validAfterChars = /^[.,;:!?\s\n]/;
  if (validAfterChars.test(firstCharAfter)) {
    return true;
  }
  if (/^[a-z]/.test(after)) {
    const commonWordsAfter = /^(is|are|was|were|has|have|had|will|would|can|could|should|may|might)\b/i;
    if (commonWordsAfter.test(after)) {
      return true;
    }
  }
  const invalidBefore = /\b(about|around|over|under|near|from|to|at|in|on|for|with|by)\s+$/i;
  if (invalidBefore.test(before)) {
    return false;
  }
  return true;
}
var detectScriptureReferences = (text2) => {
  const references = [];
  const bookNames = getBookNameVariations();
  const escapedBookNames = bookNames.map(
    (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const dashPattern = "[-\u2013\u2014]";
  const referencePattern = new RegExp(
    `\\b(${escapedBookNames.join("|")})\\s+(\\d+):(\\d+(?:\\s*${dashPattern}\\s*\\d+)?(?:,\\s*\\d+(?:\\s*${dashPattern}\\s*\\d+)?)*)(?=\\s|$|[^\\d\\w])`,
    "gi"
  );
  const chapterRangePattern = new RegExp(
    `\\b(${escapedBookNames.join("|")})\\s+(\\d+)\\s*${dashPattern}\\s*(\\d+)(?!:)(?!\\d)`,
    "gi"
  );
  const chapterOnlyPattern = new RegExp(
    `\\b(${escapedBookNames.join("|")})\\s+(\\d+)(?!:)(?!\\s*${dashPattern}\\s*\\d)(?!\\d)(?!\\s+\\d\\s)`,
    "gi"
  );
  let match;
  while ((match = referencePattern.exec(text2)) !== null) {
    let fullMatch = match[0];
    const originalMatchEnd = match.index + fullMatch.length;
    let adjustedLastIndex = originalMatchEnd;
    const versePartMatch = fullMatch.match(/:\s*([^:]+)$/);
    if (versePartMatch && versePartMatch[1].includes(",")) {
      const verseGroups = versePartMatch[1];
      const lastCommaIndex = verseGroups.lastIndexOf(",");
      if (lastCommaIndex >= 0) {
        const afterLastComma = verseGroups.substring(lastCommaIndex + 1).trim();
        if (/^\d+$/.test(afterLastComma)) {
          const textAfterMatch = text2.substring(originalMatchEnd);
          const wordAfterSpace = textAfterMatch.match(/^\s+(\w+)/)?.[1];
          if (wordAfterSpace) {
            const potentialBookName = `${afterLastComma} ${wordAfterSpace}`;
            const matchesBookName = bookNames.some((bookName) => {
              const normalizedBook = normalizeText(bookName);
              const normalizedPotential = normalizeText(potentialBookName);
              return normalizedBook === normalizedPotential || normalizedBook.startsWith(normalizedPotential) || normalizedPotential.startsWith(normalizedBook);
            });
            if (matchesBookName) {
              const trimmedLength = verseGroups.length - lastCommaIndex;
              fullMatch = fullMatch.substring(0, fullMatch.length - trimmedLength);
              adjustedLastIndex = match.index + fullMatch.length;
            }
          }
        }
      }
    }
    const extracted = parseReference(fullMatch);
    if (extracted) {
      if (!isValidScriptureContext(text2, match.index, fullMatch.length)) {
        continue;
      }
      const versePartInMatch = fullMatch.match(/:\s*(\d+)/);
      if (versePartInMatch) {
        const verseInMatch = parseInt(versePartInMatch[1]);
        if (Array.isArray(extracted.verse)) {
          if (extracted.verse[0] !== verseInMatch && extracted.verse[0] < verseInMatch) {
            if (DEBUG) {
              console.warn("[Scripture Detection] Verse mismatch detected:", {
                originalMatch: fullMatch,
                parsedVerse: extracted.verse[0],
                matchVerse: verseInMatch
              });
            }
            const correctedVerse = verseInMatch;
            extracted.verse = correctedVerse;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${correctedVerse}`;
          }
        } else {
          if (extracted.verse !== verseInMatch && extracted.verse < verseInMatch) {
            extracted.verse = verseInMatch;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${verseInMatch}`;
          }
        }
      }
      extracted.reference = fullMatch;
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some((ref) => {
        const normalizedRef = normalizeScriptureReference(ref.reference);
        return normalizedRef === normalizedExtracted;
      });
      if (!isDuplicate) {
        references.push(extracted);
      }
    }
    if (adjustedLastIndex !== originalMatchEnd) {
      referencePattern.lastIndex = adjustedLastIndex;
    }
  }
  while ((match = chapterRangePattern.exec(text2)) !== null) {
    if (!isValidScriptureContext(text2, match.index, match[0].length)) {
      continue;
    }
    const bookPart = match[1].trim();
    const chapterStart = parseInt(match[2]);
    const chapterEnd = parseInt(match[3]);
    const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
      (k) => k.category === "book" && (k.name.toLowerCase() === bookPart.toLowerCase() || k.synonyms.some((s) => s.toLowerCase() === bookPart.toLowerCase()))
    )?.name || bookPart;
    const startRange = getChapterVerseRange(canonicalBook, chapterStart);
    const endRange = getChapterVerseRange(canonicalBook, chapterEnd);
    if (startRange && endRange && chapterStart <= chapterEnd) {
      const reference = {
        book: canonicalBook,
        chapter: chapterStart,
        // Primary chapter for API calls
        verse: [startRange.start, endRange.end],
        reference: `${canonicalBook} ${chapterStart}-${chapterEnd}`
        // Keep chapter range format
      };
      const normalizedRef = `${canonicalBook} ${chapterStart}-${chapterEnd}`;
      const isDuplicate = references.some(
        (ref) => normalizeScriptureReference(ref.reference) === normalizedRef
      );
      if (!isDuplicate) {
        references.push(reference);
      }
    }
  }
  while ((match = chapterOnlyPattern.exec(text2)) !== null) {
    if (!isValidScriptureContext(text2, match.index, match[0].length)) {
      continue;
    }
    const bookPart = match[1].trim();
    const chapter = parseInt(match[2]);
    const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
      (k) => k.category === "book" && (k.name.toLowerCase() === bookPart.toLowerCase() || k.synonyms.some((s) => s.toLowerCase() === bookPart.toLowerCase()))
    )?.name || bookPart;
    const range = getChapterVerseRange(canonicalBook, chapter);
    if (range) {
      const reference = {
        book: canonicalBook,
        chapter,
        verse: [range.start, range.end],
        reference: `${canonicalBook} ${chapter}`
        // Keep chapter-only format
      };
      const isDuplicate = references.some((ref) => {
        if (ref.book === canonicalBook && ref.chapter === chapter) {
          return true;
        }
        return false;
      });
      if (!isDuplicate) {
        references.push(reference);
      }
    }
  }
  return references;
};
var parseScriptureReference = (reference) => {
  const parsed = parseReference(reference);
  if (!parsed) return null;
  return {
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse
  };
};
var detectScripture = async (text2) => {
  if (!text2 || text2.trim().length === 0) {
    return {
      isScripture: false,
      type: null,
      references: [],
      confidence: 0
    };
  }
  const plainText = text2.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const references = detectScriptureReferences(plainText);
  if (references.length > 0) {
    return {
      isScripture: true,
      type: "reference",
      references,
      confidence: 0.9,
      detectedText: plainText
    };
  }
  return {
    isScripture: false,
    type: null,
    references: [],
    confidence: 0
  };
};
var getPrimaryReference = (detection) => {
  if (detection.references.length > 0) {
    return detection.references[0].reference;
  }
  return null;
};
var normalizeScriptureReference = (reference) => {
  if (!reference || typeof reference !== "string") {
    return reference;
  }
  const parsed = parseReference(reference.trim());
  if (parsed) {
    return parsed.reference;
  }
  let normalized = reference.replace(/:\s+/g, ":");
  normalized = normalized.replace(/,\s+/g, ",");
  normalized = normalized.replace(/(\d+)\s*[-–—]\s*(\d+)/g, "$1-$2");
  normalized = normalized.trim();
  return normalized;
};
var parseVerseGroups = (reference) => {
  const match = reference.match(/:\s*([^:]+)$/);
  if (!match) return [];
  const versePart = match[1].trim();
  const normalized = versePart.replace(/\s+\|\s+/g, ",").replace(/,\s+/g, ",");
  const groups = [];
  normalized.split(",").forEach((group) => {
    const trimmed = group.trim();
    if (/[-–—]/.test(trimmed)) {
      const [start, end] = trimmed.split(/[-–—]/).map((v) => parseInt(v.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        groups.push({ start, end });
      }
    } else {
      const verse = parseInt(trimmed);
      if (!isNaN(verse)) {
        groups.push({ start: verse, end: verse });
      }
    }
  });
  return groups;
};

// src/utils/tiptap-helpers.ts
function stripNoteLinksToNoteId(htmlContent, targetNoteId) {
  if (!htmlContent || !targetNoteId) {
    return htmlContent;
  }
  const escaped = targetNoteId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<span[^>]*data-note-id\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)</span>`,
    "gi"
  );
  return htmlContent.replace(pattern, (_, inner) => inner ?? "");
}

// server/utils/auto-tag-generator.ts
init_db();
function isTagOverlapping(newTag, existingTag) {
  const newLower = newTag.toLowerCase();
  const existingLower = existingTag.toLowerCase();
  if (newLower === existingLower) return true;
  if (newLower.includes(existingLower) || existingLower.includes(newLower)) return true;
  const overlappingPairs = [
    ["goodness", "righteousness"],
    ["grace", "mercy"],
    ["love", "mercy"],
    ["faith", "belief"],
    ["hope", "faith"],
    ["peace", "joy"],
    ["kingdom of god", "heaven"],
    ["resurrection", "eternal life"],
    ["eternal life", "everlasting life"],
    ["holy spirit", "spirit"],
    ["jesus", "christ"],
    ["jesus", "lord"],
    ["god", "father"],
    ["god", "lord"]
  ];
  for (const [tag1, tag2] of overlappingPairs) {
    if (newLower === tag1 && existingLower === tag2 || newLower === tag2 && existingLower === tag1) return true;
  }
  return false;
}
async function generateAutoTags(noteTitle, noteContent, userId, confidenceThreshold = 0.7) {
  try {
    if (!userId) {
      console.error("Auto-tag generation failed: userId is required");
      return { suggestions: [], totalFound: 0, highConfidence: 0 };
    }
    const { stripHtml: stripHtml3 } = await Promise.resolve().then(() => (init_html_stripper(), html_stripper_exports));
    const cleanTitle2 = (noteTitle || "").trim();
    const cleanContent = stripHtml3(noteContent || "").trim();
    const fullText = `${cleanTitle2} ${cleanContent}`.trim();
    if (!fullText) return { suggestions: [], totalFound: 0, highConfidence: 0 };
    let foundKeywords = [];
    try {
      foundKeywords = findKeywordsInTextWithPriority(fullText, cleanTitle2, cleanContent);
    } catch (keywordError) {
      console.error("Keyword detection error:", keywordError instanceof Error ? keywordError.message : String(keywordError));
      foundKeywords = [];
    }
    let existingTags = [];
    try {
      if (!db) throw new Error("Database connection not available");
      existingTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
    } catch (dbError) {
      console.error("Database error fetching existing tags:", dbError instanceof Error ? dbError.message : String(dbError));
      existingTags = [];
    }
    const existingTagNames = new Set(existingTags.map((tag) => tag.name.toLowerCase()));
    const suggestions = [];
    let highConfidence = 0;
    for (const { keyword, confidence } of foundKeywords) {
      if (keyword.name.toLowerCase() === "god") continue;
      if (keyword.name.includes(" ")) continue;
      if (confidence >= confidenceThreshold) {
        const isOverlapping = suggestions.some((existing) => isTagOverlapping(keyword.name, existing.keyword));
        if (isOverlapping) continue;
        const isExisting = existingTagNames.has(keyword.name.toLowerCase());
        const existingTag = isExisting ? existingTags.filter((t) => t.name.toLowerCase() === keyword.name.toLowerCase()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] : void 0;
        suggestions.push({ keyword: keyword.name, category: keyword.category, confidence, isExisting, tagId: existingTag?.id });
        if (confidence >= 0.8) highConfidence++;
      }
    }
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const bibleStudyCategories = ["spiritual", "biblical", "character", "book", "theme"];
    const enhancedSuggestions = suggestions.map((suggestion) => {
      const isBibleStudy = bibleStudyCategories.includes(suggestion.category);
      if (isBibleStudy) {
        return { ...suggestion, confidence: Math.min(1, suggestion.confidence + 0.05) };
      }
      return suggestion;
    });
    enhancedSuggestions.sort((a, b) => b.confidence - a.confidence);
    const topSuggestions = enhancedSuggestions.slice(0, 8);
    return { suggestions: topSuggestions, totalFound: suggestions.length, highConfidence };
  } catch (error) {
    console.error("Error generating auto tags:", error instanceof Error ? error.message : String(error));
    return { suggestions: [], totalFound: 0, highConfidence: 0 };
  }
}
async function applyAutoTags(noteId, suggestions, userId) {
  const errors = [];
  let applied = 0;
  if (!noteId || !userId) {
    const error = "Missing required parameters: noteId or userId";
    console.error("applyAutoTags validation failed:", error);
    return { applied: 0, errors: [error] };
  }
  for (const suggestion of suggestions) {
    try {
      let tagId = suggestion.tagId;
      if (!tagId) {
        try {
          const allUserTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
          const existingTag = allUserTags.find((t) => t.name.toLowerCase() === suggestion.keyword.toLowerCase());
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            const newTagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(Tags).values({
              id: newTagId,
              name: suggestion.keyword,
              color: getColorForCategory(suggestion.category),
              category: suggestion.category,
              userId,
              isSystem: true,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            tagId = newTagId;
          }
        } catch (tagError) {
          console.error(`Error handling tag ${suggestion.keyword}:`, tagError);
          errors.push(`Failed to handle tag "${suggestion.keyword}": ${tagError}`);
          continue;
        }
      }
      const existingRelation = await db.select().from(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId))).get();
      if (existingRelation) continue;
      const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteTags).values({
        id: relationId,
        noteId,
        tagId,
        isAutoGenerated: true,
        confidence: suggestion.confidence,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      applied++;
    } catch (error) {
      console.error(`Error applying tag ${suggestion.keyword}:`, error);
      errors.push(`Failed to apply tag "${suggestion.keyword}": ${error}`);
    }
  }
  return { applied, errors };
}
function getColorForCategory(category) {
  const colorMap = {
    "spiritual": "#006eff",
    "biblical": "#28a745",
    "character": "#ffc107",
    "place": "#17a2b8",
    "book": "#6f42c1",
    "theme": "#fd7e14",
    "life": "#e83e8c"
  };
  return colorMap[category] || "#006eff";
}
async function removeAutoTags(noteId) {
  try {
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.isAutoGenerated, true)));
    return 1;
  } catch (error) {
    console.error("Error removing auto tags:", error);
    return 0;
  }
}
async function regenerateAutoTags(noteId, noteTitle, noteContent, userId) {
  try {
    await removeAutoTags(noteId);
    const result = await generateAutoTags(noteTitle, noteContent, userId);
    return await applyAutoTags(noteId, result.suggestions, userId);
  } catch (error) {
    console.error("Error regenerating auto tags:", error);
    return { applied: 0, errors: [`Failed to regenerate tags: ${error}`] };
  }
}

// server/utils/process-scripture-references.ts
init_db();

// src/utils/scripture-highlighter.ts
function stripNoteLinkScriptureSpans(content) {
  if (!content) return content;
  let result = content;
  const noteLinkRegex = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>|<span[^>]*data-note-id\s*=\s*["'][^"']+["'][^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  result = result.replace(noteLinkRegex, (match, inner1, inner2) => {
    const innerContent = inner1 || inner2 || "";
    const plainText = innerContent.replace(/<[^>]*>/g, "").trim();
    const scriptureRefs = detectScriptureReferences(plainText);
    if (scriptureRefs.length > 0) {
      return innerContent;
    }
    return match;
  });
  return result;
}
function stripBrokenPillSpans(content) {
  if (!content) return content;
  let result = content;
  const spanRegex = /<span[^>]*data-scripture-reference\s*=\s*["'][^"']+["'][^>]*>([\s\S]*?)<\/span>/gi;
  result = result.replace(spanRegex, (match, innerContent) => {
    const noteIdMatch = match.match(/data-note-id\s*=\s*["']([^"']+)["']/);
    let hasValidNoteId = false;
    if (noteIdMatch) {
      const noteIdValue = noteIdMatch[1];
      hasValidNoteId = noteIdValue && noteIdValue !== "pending" && noteIdValue !== "null" && noteIdValue !== "";
    }
    return hasValidNoteId ? match : innerContent;
  });
  return result;
}
function highlightScriptureReferences(content, references) {
  if (!content || references.length === 0) {
    return content;
  }
  let updatedContent = stripNoteLinkScriptureSpans(content);
  updatedContent = stripBrokenPillSpans(updatedContent);
  for (const { reference, noteId } of references) {
    const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokens = escapedReference.match(/\S+|\s+/g) || [];
    const flexiblePattern = tokens.map((token) => {
      if (/^\s+$/.test(token)) {
        return `\\s*(?:<[^>]+>)*\\s*`;
      } else {
        return `(?:<[^>]+>)*${token}(?:<[^>]+>)*`;
      }
    }).join("");
    const pattern = new RegExp(`(${flexiblePattern})`, "gi");
    const matches = [];
    let match;
    while ((match = pattern.exec(updatedContent)) !== null) {
      const cleanText = match[0].replace(/<[^>]+>/g, "").trim();
      if (cleanText.toLowerCase() === reference.toLowerCase()) {
        matches.push({
          match: match[0],
          index: match.index,
          cleanText: reference
          // Use original reference (always plain text, no formatting)
        });
      }
    }
    for (let i = matches.length - 1; i >= 0; i--) {
      const { match: matchText, index: index2, cleanText } = matches[i];
      const beforeMatch = updatedContent.substring(0, index2);
      const matchEnd = index2 + matchText.length;
      let searchPos = index2;
      let foundCompletePillSpan = false;
      while (searchPos > 0) {
        const lastSpanOpen = beforeMatch.lastIndexOf("<span", searchPos - 1);
        if (lastSpanOpen === -1) break;
        const spanTagEnd = updatedContent.indexOf(">", lastSpanOpen);
        if (spanTagEnd === -1 || spanTagEnd >= index2) {
          searchPos = lastSpanOpen - 1;
          continue;
        }
        const spanTag = updatedContent.substring(lastSpanOpen, spanTagEnd + 1);
        const hasScriptureRef = spanTag.includes("data-scripture-reference");
        const noteIdMatch = spanTag.match(/data-note-id\s*=\s*["']([^"']+)["']/);
        const noteIdValue = noteIdMatch ? noteIdMatch[1] : null;
        const hasValidNoteId = noteIdValue && noteIdValue !== "pending" && noteIdValue !== "null" && noteIdValue !== "";
        const isCompletePillSpan = hasScriptureRef && hasValidNoteId;
        const spanCloseAfter = updatedContent.indexOf("</span>", spanTagEnd + 1);
        if (spanCloseAfter !== -1 && spanCloseAfter < index2) {
          searchPos = lastSpanOpen - 1;
          continue;
        }
        if (isCompletePillSpan) {
          const spanCloseAfterMatch = updatedContent.indexOf("</span>", matchEnd);
          if (spanCloseAfterMatch !== -1) {
            foundCompletePillSpan = true;
            break;
          }
        }
        searchPos = lastSpanOpen - 1;
      }
      if (foundCompletePillSpan) {
        continue;
      }
      const openSpansBefore = (beforeMatch.match(/<span[^>]*class="note-link"[^>]*>/gi) || []).length;
      const closeSpansBefore = (beforeMatch.match(/<\/span>/gi) || []).length;
      if (openSpansBefore > closeSpansBefore) {
        continue;
      }
      const contextBefore = beforeMatch.substring(Math.max(0, beforeMatch.length - 100));
      const contextAfter = updatedContent.substring(matchEnd, Math.min(matchEnd + 100, updatedContent.length));
      const fullContext = contextBefore + matchText + contextAfter;
      if (fullContext.includes(`data-note-id="${noteId}"`)) {
        continue;
      }
      const cleanMatchText = matchText.replace(/<[^>]+>/g, "");
      const leadingSpaces = cleanMatchText.match(/^\s*/)?.[0] || "";
      const trailingSpaces = cleanMatchText.match(/\s*$/)?.[0] || "";
      const wrapped = `<span data-scripture-reference="${cleanText}" data-note-id="${noteId}" class="scripture-pill scripture-pill-clickable" style="background-color: var(--color-paper); border-radius: 12px; padding: 0px 8px; display: inline-flex; align-items: baseline; height: auto; min-height: 28px; gap: 4px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 600; font-style: normal; font-size: 16px; color: var(--color-deep-grey); vertical-align: baseline; line-height: 1.6; user-select: none; white-space: normal; cursor: pointer;">${cleanText}</span>`;
      updatedContent = updatedContent.substring(0, index2) + leadingSpaces + wrapped + trailingSpaces + updatedContent.substring(index2 + matchText.length);
    }
  }
  return updatedContent;
}

// server/utils/process-scripture-references.ts
init_ids();

// src/utils/fetch-helpers.ts
async function fetchWithTimeout(url, options = {}) {
  const {
    timeout = 1e4,
    // 10 seconds default
    retries = 2,
    retryTimeout = 5e3,
    // 5 seconds for retries
    ...fetchOptions
  } = options;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const currentTimeout = attempt === 0 ? timeout : retryTimeout;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, currentTimeout);
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: abortController.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (error.name === "AbortError" || abortController.signal.aborted) {
        if (attempt === retries) {
          throw new Error(
            `Request timeout after ${currentTimeout}ms (attempt ${attempt + 1} of ${retries + 1})`
          );
        }
        continue;
      }
      if (attempt === retries) {
        throw new Error(
          `Network error: ${error.message || "Failed to fetch"}`
        );
      }
    }
  }
  throw lastError || new Error("Unknown error occurred");
}

// server/utils/process-scripture-references.ts
async function processScriptureReferences(noteId, userId, threadId, contentOverride) {
  const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, userId))).get();
  if (!note) {
    throw new Error("Note not found");
  }
  let noteContent = contentOverride || note.content;
  let actualThreadId = threadId || "thread_unorganized";
  if (!threadId) {
    const threadRelation = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).limit(1).get();
    if (threadRelation) {
      actualThreadId = threadRelation.threadId;
    }
  }
  const existingReferences = /* @__PURE__ */ new Map();
  const pendingPills = /* @__PURE__ */ new Map();
  const pillPattern1 = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pillPattern1.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      existingReferences.set(normalizedRef, pillNoteId);
    }
  }
  const pillPattern2 = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const pendingPillPattern = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pendingPillPattern.exec(noteContent)) !== null) {
    const fullMatch = match[0];
    const reference = match[1];
    const noteIdMatch = fullMatch.match(/data-note-id\s*=\s*["']([^"']+)["']/);
    if (noteIdMatch) {
      const noteIdValue = noteIdMatch[1];
      if (noteIdValue && noteIdValue !== "pending" && noteIdValue !== "null" && noteIdValue !== "") {
        continue;
      }
    }
    const normalizedRef = normalizeScriptureReference(reference);
    if (!existingReferences.has(normalizedRef) && !pendingPills.has(normalizedRef)) {
      pendingPills.set(normalizedRef, {
        reference: match[1],
        fullMatch: match[0],
        startIndex: match.index || 0
      });
    }
  }
  const pillPattern3 = /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern3.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const noteLinkPattern = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const innerContent = match[2].replace(/<[^>]*>/g, "").trim();
      const innerRefs = detectScriptureReferences(innerContent);
      if (innerRefs.length > 0) {
        const normalizedRef = normalizeScriptureReference(innerRefs[0].reference);
        if (!existingReferences.has(normalizedRef)) {
          existingReferences.set(normalizedRef, pillNoteId);
        }
      }
    }
  }
  const noteLinkPattern2 = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const innerContent = match[2].replace(/<[^>]*>/g, "").trim();
      const innerRefs = detectScriptureReferences(innerContent);
      if (innerRefs.length > 0) {
        const normalizedRef = normalizeScriptureReference(innerRefs[0].reference);
        if (!existingReferences.has(normalizedRef)) {
          existingReferences.set(normalizedRef, pillNoteId);
        }
      }
    }
  }
  const pillPattern6 = /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern6.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const pillPattern7 = /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern7.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const pillPattern8 = /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern8.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const pillPattern9 = /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern9.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    if (pillNoteId && pillNoteId !== "pending" && pillNoteId !== "null" && pillNoteId !== "") {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  const plainText = noteContent.replace(/<span[^>]*data-scripture-reference[^>]*>([\s\S]*?)<\/span>/gi, "$1").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const detectedReferences = detectScriptureReferences(plainText);
  const results = [];
  const referenceMap = /* @__PURE__ */ new Map();
  const normalizedScriptureMap = /* @__PURE__ */ new Map();
  const allUserScripture = await db.select({
    noteId: ScriptureMetadata.noteId,
    reference: ScriptureMetadata.reference
  }).from(ScriptureMetadata).innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id)).where(eq(Notes.userId, userId)).all();
  for (const scripture of allUserScripture) {
    const normalizedStored = normalizeScriptureReference(scripture.reference);
    if (!normalizedScriptureMap.has(normalizedStored)) {
      normalizedScriptureMap.set(normalizedStored, {
        noteId: scripture.noteId,
        reference: scripture.reference
      });
    }
  }
  const processedReferences = /* @__PURE__ */ new Set();
  for (const detectedRef of detectedReferences) {
    const reference = detectedRef.reference;
    const normalizedReference = normalizeScriptureReference(reference);
    if (processedReferences.has(normalizedReference)) {
      continue;
    }
    processedReferences.add(normalizedReference);
    if (existingReferences.has(normalizedReference)) {
      const existingNoteId = existingReferences.get(normalizedReference);
      referenceMap.set(reference, existingNoteId);
      continue;
    }
    try {
      let existingScripture = await db.select({
        noteId: ScriptureMetadata.noteId,
        reference: ScriptureMetadata.reference
      }).from(ScriptureMetadata).innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id)).where(
        and(
          eq(ScriptureMetadata.reference, normalizedReference),
          eq(Notes.userId, userId)
        )
      ).limit(1).get();
      if (!existingScripture) {
        const matchedScripture = normalizedScriptureMap.get(normalizedReference);
        if (matchedScripture) {
          existingScripture = {
            noteId: matchedScripture.noteId,
            reference: matchedScripture.reference
          };
        }
      }
      if (!existingScripture) {
        try {
          let verseText = "";
          try {
            const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
            const verseResponse = await fetchWithTimeout(apiUrl, {
              timeout: 1e4,
              // 10 seconds for initial attempt
              retries: 2,
              // 2 retries
              retryTimeout: 5e3
              // 5 seconds for retries
            });
            if (verseResponse.ok) {
              const verses = await verseResponse.json();
              if (Array.isArray(verses) && verses.length > 0) {
                verseText = verses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(" ");
              }
            } else {
              console.error(`Bible.org API returned error for ${reference}: ${verseResponse.status} ${verseResponse.statusText}`);
            }
          } catch (verseError) {
            console.error(`Error fetching verse for ${reference}:`, verseError.message || verseError);
          }
          let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
          if (!userMetadata) {
            const existingNotes = await db.select({
              simpleNoteId: Notes.simpleNoteId
            }).from(Notes).where(and(
              eq(Notes.userId, userId),
              isNotNull(Notes.simpleNoteId)
            )).orderBy(desc(Notes.simpleNoteId)).limit(1);
            const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
            const season = getCurrentSeason();
            await db.insert(UserMetadata).values({
              id: `user_metadata_${userId}`,
              userId,
              highestSimpleNoteId: highestExistingId,
              userColor: "paper",
              currentSeason: season,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            userMetadata = {
              id: `user_metadata_${userId}`,
              userId,
              highestSimpleNoteId: highestExistingId,
              userColor: "paper",
              email: null,
              firstName: null,
              lastName: null,
              profileImageUrl: null,
              clerkDataUpdatedAt: null,
              churchName: null,
              churchCity: null,
              churchState: null,
              churchCountry: null,
              currentSeason: season,
              lastMonthlyVisit: null,
              churchAddedAt: null,
              referralBonusNotes: 0,
              referralCode: null,
              lockPinSalt: null,
              lockPinHash: null,
              createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: null
            };
          }
          const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
          const capitalizedContent = (verseText || reference).charAt(0).toUpperCase() + (verseText || reference).slice(1);
          const capitalizedTitle = reference.charAt(0).toUpperCase() + reference.slice(1);
          const { ensureUnorganizedThread: ensureUnorganizedThread2 } = await Promise.resolve().then(() => (init_unorganized_thread(), unorganized_thread_exports));
          await ensureUnorganizedThread2(userId);
          const now = (/* @__PURE__ */ new Date()).toISOString();
          const shareToken = generateShareToken();
          const scriptureNote = await db.insert(Notes).values({
            id: generateNoteId(),
            content: capitalizedContent,
            title: capitalizedTitle,
            threadId: "thread_unorganized",
            spaceId: null,
            simpleNoteId: nextSimpleNoteId,
            noteType: "scripture",
            userId,
            isPublic: true,
            shareToken,
            shareTokenCreatedAt: now,
            addedBy: "harvous",
            createdAt: now,
            lastVisited: now
            // Set lastVisited so newly created notes appear at top
          }).returning().get();
          await db.update(UserMetadata).set({
            highestSimpleNoteId: nextSimpleNoteId,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }).where(eq(UserMetadata.userId, userId));
          const parsed = parseScriptureReference(normalizedReference);
          if (parsed) {
            const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
            const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : void 0;
            await db.insert(ScriptureMetadata).values({
              id: `scripture_${scriptureNote.id}_${Date.now()}`,
              noteId: scriptureNote.id,
              reference: normalizedReference,
              // Store normalized reference
              book: parsed.book,
              chapter: parsed.chapter,
              verse: verseStart,
              verseEnd: verseEnd || null,
              translation: "NET",
              originalText: capitalizedContent,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          await awardNoteCreatedXP(userId, scriptureNote.id, true, capitalizedContent);
          try {
            const autoTagResult = await generateAutoTags(
              capitalizedTitle || "",
              capitalizedContent,
              userId,
              0.8
              // Generate high-confidence tags
            );
            if (autoTagResult.suggestions.length > 0) {
              await applyAutoTags(
                scriptureNote.id,
                autoTagResult.suggestions,
                userId
              );
            }
          } catch (error) {
            console.error("Auto-tagging failed for scripture note (non-critical):", error);
          }
          if (actualThreadId !== "thread_unorganized") {
            try {
              await db.insert(NoteThreads).values({
                id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId: scriptureNote.id,
                threadId: actualThreadId,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            } catch (error) {
            }
          }
          referenceMap.set(reference, scriptureNote.id);
          try {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${scriptureNote.id}-${Date.now()}`,
              noteId,
              // The note containing the reference
              scriptureNoteId: scriptureNote.id,
              // The scripture note being referenced
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          } catch (junctionError) {
            if (!junctionError?.message?.includes("UNIQUE constraint failed")) {
              console.error(`[processScriptureReferences] Failed to create junction for new scripture (noteId=${noteId}, scriptureNoteId=${scriptureNote.id}, reference=${reference}):`, junctionError?.message ?? junctionError);
            }
          }
          results.push({
            action: "created",
            noteId: scriptureNote.id,
            reference
          });
        } catch (error) {
          console.error(`Error creating scripture note for ${reference}:`, error);
        }
      } else {
        const existingNoteId = existingScripture.noteId;
        referenceMap.set(reference, existingNoteId);
        try {
          const existingJunction = await db.select().from(NoteScriptureReferences).where(
            and(
              eq(NoteScriptureReferences.noteId, noteId),
              eq(NoteScriptureReferences.scriptureNoteId, existingNoteId)
            )
          ).limit(1).get();
          if (!existingJunction) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${existingNoteId}-${Date.now()}`,
              noteId,
              // The note containing the reference
              scriptureNoteId: existingNoteId,
              // The scripture note being referenced
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        } catch (junctionError) {
          if (!junctionError?.message?.includes("UNIQUE constraint failed")) {
            console.error(`[processScriptureReferences] Failed to create junction for existing scripture (noteId=${noteId}, scriptureNoteId=${existingNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
          }
        }
        let inThread = false;
        if (actualThreadId) {
          const threadRelation = await db.select().from(NoteThreads).where(
            and(
              eq(NoteThreads.noteId, existingNoteId),
              eq(NoteThreads.threadId, actualThreadId)
            )
          ).limit(1).get();
          inThread = !!threadRelation;
        }
        const threadCount = await db.select({ count: count() }).from(NoteThreads).where(eq(NoteThreads.noteId, existingNoteId)).get();
        const inUnorganized = !threadCount || threadCount.count === 0;
        if (inThread) {
          results.push({
            action: "skipped",
            noteId: existingNoteId,
            reference
          });
        } else if (actualThreadId !== "thread_unorganized") {
          try {
            await db.insert(NoteThreads).values({
              id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              noteId: existingNoteId,
              threadId: actualThreadId,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            if (inUnorganized) {
              await db.update(Notes).set({ threadId: actualThreadId }).where(eq(Notes.id, existingNoteId));
            }
            await db.update(Threads).set({ updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(and(eq(Threads.id, actualThreadId), eq(Threads.userId, userId)));
            results.push({
              action: "added",
              noteId: existingNoteId,
              reference
            });
          } catch (error) {
            results.push({
              action: "skipped",
              noteId: existingNoteId,
              reference
            });
          }
        } else {
          results.push({
            action: "unorganized",
            noteId: existingNoteId,
            reference
          });
        }
      }
    } catch (error) {
      console.error(`Error processing scripture reference ${reference}:`, error);
    }
  }
  const referencesForHighlighting = Array.from(referenceMap.entries()).map(([reference, noteId2]) => ({
    reference,
    noteId: noteId2
  }));
  for (const [normalizedRef, existingScriptureNoteId] of existingReferences.entries()) {
    const matchingRef = detectedReferences.find((d) => normalizeScriptureReference(d.reference) === normalizedRef);
    const referenceForHighlight = matchingRef?.reference ?? normalizedRef;
    if (!referenceMap.has(referenceForHighlight)) {
      referenceMap.set(referenceForHighlight, existingScriptureNoteId);
      referencesForHighlighting.push({ reference: referenceForHighlight, noteId: existingScriptureNoteId });
    }
    try {
      const existingJunction = await db.select().from(NoteScriptureReferences).where(
        and(
          eq(NoteScriptureReferences.noteId, noteId),
          eq(NoteScriptureReferences.scriptureNoteId, existingScriptureNoteId)
        )
      ).limit(1).get();
      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${existingScriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId,
          scriptureNoteId: existingScriptureNoteId,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (junctionError) {
      if (!junctionError?.message?.includes("UNIQUE constraint failed")) {
        console.error(`[processScriptureReferences] Failed to create junction for existing ref (noteId=${noteId}, scriptureNoteId=${existingScriptureNoteId}):`, junctionError?.message ?? junctionError);
      }
    }
  }
  const allExistingPills = /* @__PURE__ */ new Map();
  function collectPill(scriptureNoteId, reference) {
    if (scriptureNoteId && scriptureNoteId !== "pending" && scriptureNoteId !== "null" && scriptureNoteId !== "" && !allExistingPills.has(scriptureNoteId)) {
      allExistingPills.set(scriptureNoteId, reference);
    }
  }
  const allPillPatterns = [
    { re: /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
    { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 }
  ];
  let pillMatch;
  for (const { re, refIdx, noteIdIdx } of allPillPatterns) {
    re.lastIndex = 0;
    while ((pillMatch = re.exec(noteContent)) !== null) {
      collectPill(pillMatch[noteIdIdx], pillMatch[refIdx]);
    }
  }
  for (const [scriptureNoteId, reference] of allExistingPills.entries()) {
    try {
      const scriptureNote = await db.select().from(Notes).where(
        and(
          eq(Notes.id, scriptureNoteId),
          eq(Notes.userId, userId),
          eq(Notes.noteType, "scripture")
        )
      ).limit(1).get();
      if (!scriptureNote) {
        console.log(`Scripture note ${scriptureNoteId} not found for reference ${reference}, creating new one`);
        const normalizedRef = normalizeScriptureReference(reference);
        const existingScriptureByRef = await db.select({
          noteId: ScriptureMetadata.noteId,
          reference: ScriptureMetadata.reference
        }).from(ScriptureMetadata).innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id)).where(
          and(
            eq(ScriptureMetadata.reference, normalizedRef),
            eq(Notes.userId, userId)
          )
        ).limit(1).get();
        if (existingScriptureByRef) {
          const actualNoteId = existingScriptureByRef.noteId;
          const existingJunction2 = await db.select().from(NoteScriptureReferences).where(
            and(
              eq(NoteScriptureReferences.noteId, noteId),
              eq(NoteScriptureReferences.scriptureNoteId, actualNoteId)
            )
          ).limit(1).get();
          if (!existingJunction2) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${actualNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              noteId,
              scriptureNoteId: actualNoteId,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          noteContent = noteContent.replace(
            new RegExp(`data-note-id=["']${scriptureNoteId}["']`, "g"),
            `data-note-id="${actualNoteId}"`
          );
        } else {
          try {
            let verseText = "";
            try {
              const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
              const verseResponse = await fetchWithTimeout(apiUrl, {
                timeout: 1e4,
                retries: 2,
                retryTimeout: 5e3
              });
              if (verseResponse.ok) {
                const verses = await verseResponse.json();
                if (Array.isArray(verses) && verses.length > 0) {
                  verseText = verses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(" ");
                }
              }
            } catch (verseError) {
              console.error(`Error fetching verse for ${reference}:`, verseError.message || verseError);
            }
            let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
            if (!userMetadata) {
              const existingNotes = await db.select({
                simpleNoteId: Notes.simpleNoteId
              }).from(Notes).where(and(
                eq(Notes.userId, userId),
                isNotNull(Notes.simpleNoteId)
              )).orderBy(desc(Notes.simpleNoteId)).limit(1);
              const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
              const season = getCurrentSeason();
              await db.insert(UserMetadata).values({
                id: `user_metadata_${userId}`,
                userId,
                highestSimpleNoteId: highestExistingId,
                userColor: "paper",
                currentSeason: season,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
              userMetadata = {
                id: `user_metadata_${userId}`,
                userId,
                highestSimpleNoteId: highestExistingId,
                userColor: "paper",
                email: null,
                firstName: null,
                lastName: null,
                profileImageUrl: null,
                clerkDataUpdatedAt: null,
                churchName: null,
                churchCity: null,
                churchState: null,
                churchCountry: null,
                currentSeason: season,
                lastMonthlyVisit: null,
                churchAddedAt: null,
                referralBonusNotes: 0,
                referralCode: null,
                lockPinSalt: null,
                lockPinHash: null,
                createdAt: (/* @__PURE__ */ new Date()).toISOString(),
                updatedAt: null
              };
            }
            const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
            const capitalizedContent = (verseText || reference).charAt(0).toUpperCase() + (verseText || reference).slice(1);
            const capitalizedTitle = reference.charAt(0).toUpperCase() + reference.slice(1);
            const { ensureUnorganizedThread: ensureUnorganizedThread2 } = await Promise.resolve().then(() => (init_unorganized_thread(), unorganized_thread_exports));
            await ensureUnorganizedThread2(userId);
            const now = (/* @__PURE__ */ new Date()).toISOString();
            const shareToken = generateShareToken();
            const newScriptureNote = await db.insert(Notes).values({
              id: generateNoteId(),
              content: capitalizedContent,
              title: capitalizedTitle,
              threadId: "thread_unorganized",
              spaceId: null,
              simpleNoteId: nextSimpleNoteId,
              noteType: "scripture",
              userId,
              isPublic: true,
              shareToken,
              shareTokenCreatedAt: now,
              addedBy: "harvous",
              createdAt: now,
              lastVisited: now
            }).returning().get();
            await db.update(UserMetadata).set({
              highestSimpleNoteId: nextSimpleNoteId,
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            }).where(eq(UserMetadata.userId, userId));
            const parsed = parseScriptureReference(normalizedRef);
            if (parsed) {
              const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
              const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : void 0;
              await db.insert(ScriptureMetadata).values({
                id: `scripture_${newScriptureNote.id}_${Date.now()}`,
                noteId: newScriptureNote.id,
                reference: normalizedRef,
                book: parsed.book,
                chapter: parsed.chapter,
                verse: verseStart,
                verseEnd: verseEnd || null,
                translation: "NET",
                originalText: capitalizedContent,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            await awardNoteCreatedXP(userId, newScriptureNote.id, true, capitalizedContent);
            try {
              const autoTagResult = await generateAutoTags(capitalizedTitle || "", capitalizedContent, userId, 0.8);
              if (autoTagResult.suggestions.length > 0) {
                await applyAutoTags(newScriptureNote.id, autoTagResult.suggestions, userId);
              }
            } catch (tagError) {
              console.error(`Error auto-generating tags for scripture note ${newScriptureNote.id}:`, tagError);
            }
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${newScriptureNote.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              noteId,
              scriptureNoteId: newScriptureNote.id,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            noteContent = noteContent.replace(
              new RegExp(`data-note-id=["']${scriptureNoteId}["']`, "g"),
              `data-note-id="${newScriptureNote.id}"`
            );
            results.push({
              action: "created",
              noteId: newScriptureNote.id,
              reference
            });
          } catch (createError2) {
            console.error(`Error creating scripture note for pasted pill ${reference}:`, createError2);
          }
        }
        continue;
      }
      const existingJunction = await db.select().from(NoteScriptureReferences).where(
        and(
          eq(NoteScriptureReferences.noteId, noteId),
          eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
        )
      ).limit(1).get();
      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${scriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId,
          scriptureNoteId,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (junctionError) {
      if (!junctionError?.message?.includes("UNIQUE constraint failed")) {
        console.error(`[processScriptureReferences] Failed to create junction for pill (noteId=${noteId}, scriptureNoteId=${scriptureNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
      }
    }
  }
  const updatedContent = highlightScriptureReferences(noteContent, referencesForHighlighting);
  await db.update(Notes).set({
    content: updatedContent,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).where(eq(Notes.id, noteId));
  return {
    results,
    updatedContent
  };
}

// server/utils/subscription.ts
init_db();
var FREE_TIER_LIMIT = 200;
var UNLIMITED_PLAN_ID = process.env.CLERK_UNLIMITED_PLAN_ID || "cplan_37aJweoipC2wY2Pa94o7zMdoIyw";
async function getUserNoteCount(userId) {
  try {
    const userMetadata = await db.select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    return userMetadata?.highestSimpleNoteId || 0;
  } catch (error) {
    console.error("Error getting user note count:", error);
    return 0;
  }
}
async function getReferralBonusNotes(userId) {
  try {
    const row = await db.select({ referralBonusNotes: UserMetadata.referralBonusNotes }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    return row?.referralBonusNotes ?? 0;
  } catch (error) {
    console.error("Error getting referral bonus notes:", error);
    return 0;
  }
}
function hasUnlimitedNotes(auth) {
  return auth.has({ feature: "unlimited_notes" });
}
async function canCreateNote(userId, auth) {
  try {
    const hasUnlimited = hasUnlimitedNotes(auth);
    if (hasUnlimited) {
      return { allowed: true };
    }
    const [noteCount, referralBonusNotes] = await Promise.all([
      getUserNoteCount(userId),
      getReferralBonusNotes(userId)
    ]);
    const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;
    if (noteCount >= effectiveLimit) {
      return {
        allowed: false,
        reason: `You've used all ${effectiveLimit} notes. Upgrade for unlimited.`,
        currentCount: noteCount,
        limit: effectiveLimit,
        upgradeUrl: "/upgrade"
      };
    }
    return {
      allowed: true,
      currentCount: noteCount,
      limit: effectiveLimit
    };
  } catch (error) {
    console.error("Error checking if user can create note:", error);
    return { allowed: true };
  }
}
async function getSubscriptionInfo(userId, auth) {
  const hasUnlimited = hasUnlimitedNotes(auth);
  const [currentCount, referralBonusNotes] = await Promise.all([
    getUserNoteCount(userId),
    getReferralBonusNotes(userId)
  ]);
  const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;
  return {
    hasUnlimited,
    currentCount,
    limit: hasUnlimited ? null : effectiveLimit,
    referralBonusNotes
  };
}

// server/routes/notes.ts
init_unorganized_thread();

// server/utils/remove-scripture-notes-from-thread.ts
init_db();
function sleep3(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function removeScriptureNotesFromThread(parentNoteId, threadId, userId) {
  if (threadId === "thread_unorganized") return;
  await sleep3(1e3);
  try {
    try {
      await db.select().from(NoteScriptureReferences).limit(1).get();
    } catch (checkError) {
      if (checkError.message?.includes("SQLITE_BUSY") || checkError.message?.includes("database is locked")) {
        return;
      }
    }
    const scriptureReferences = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId }).from(NoteScriptureReferences).where(eq(NoteScriptureReferences.noteId, parentNoteId)).all();
    if (scriptureReferences.length === 0) return;
    const notesInThread = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads).where(eq(NoteThreads.threadId, threadId)).all();
    const noteIdsInThread = new Set(notesInThread.map((n) => n.noteId));
    for (const ref of scriptureReferences) {
      const scriptureNoteId = ref.scriptureNoteId;
      try {
        const scriptureNote = await db.select().from(Notes).where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId))).get();
        if (!scriptureNote) continue;
        const scriptureNoteInThread = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, scriptureNoteId), eq(NoteThreads.threadId, threadId))).get();
        if (!scriptureNoteInThread) continue;
        let stillReferenced = false;
        for (const noteId of noteIdsInThread) {
          const referenceCheck = await db.select().from(NoteScriptureReferences).where(and(
            eq(NoteScriptureReferences.noteId, noteId),
            eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
          )).limit(1).get();
          if (referenceCheck) {
            stillReferenced = true;
            break;
          }
        }
        if (!stillReferenced) {
          let retries = 3;
          let deleted = false;
          while (retries > 0 && !deleted) {
            try {
              await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, scriptureNoteId), eq(NoteThreads.threadId, threadId)));
              deleted = true;
              const remainingThreads = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, scriptureNoteId)).all();
              if (remainingThreads.length === 0) {
                let updateRetries = 3;
                while (updateRetries > 0) {
                  try {
                    await db.update(Notes).set({ threadId: "thread_unorganized" }).where(eq(Notes.id, scriptureNoteId));
                    break;
                  } catch (updateError) {
                    if (updateError.message?.includes("SQLITE_BUSY") || updateError.message?.includes("database is locked")) {
                      updateRetries--;
                      if (updateRetries > 0) await sleep3(50 * (4 - updateRetries));
                    } else {
                      throw updateError;
                    }
                  }
                }
              }
            } catch (deleteError) {
              if (deleteError.message?.includes("SQLITE_BUSY") || deleteError.message?.includes("database is locked")) {
                retries--;
                if (retries > 0) await sleep3(50 * (4 - retries));
                else console.error(`Failed to remove scripture note ${scriptureNoteId} from thread after retries:`, deleteError);
              } else {
                throw deleteError;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error removing scripture note ${scriptureNoteId} from thread:`, error);
      }
    }
  } catch (error) {
    console.error(`Error removing scripture notes for parent note ${parentNoteId} from thread:`, error);
  }
}

// src/utils/content-extractor.ts
import { extract } from "@extractus/article-extractor";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
function htmlToCleanParagraphs(html) {
  const { document: document2 } = parseHTML(`<div>${html}</div>`);
  const root = document2.querySelector("div");
  if (!root) return "";
  const output2 = [];
  function extractText(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return node.textContent || "";
    }
    const tagName = node.tagName?.toLowerCase() || "";
    if (["script", "style", "noscript", "svg", "canvas", "video", "audio", "iframe", "img", "picture", "figure"].includes(tagName)) {
      return "";
    }
    if (tagName === "br") {
      return "<br>";
    }
    let text2 = "";
    for (const child of node.childNodes || []) {
      text2 += extractText(child);
    }
    if (tagName === "strong" || tagName === "b") {
      return `<strong>${text2}</strong>`;
    }
    if (tagName === "em" || tagName === "i") {
      return `<em>${text2}</em>`;
    }
    return text2;
  }
  function isMediaMetadata(text2) {
    const lower = text2.toLowerCase().trim();
    return (
      // Common prefixes
      lower.startsWith("image:") || lower.startsWith("photo:") || lower.startsWith("video:") || lower.startsWith("credit:") || lower.startsWith("source:") || lower.startsWith("watch:") || lower.startsWith("listen:") || // Dimensions like "1920x1080"
      /^\d+x\d+/.test(lower) || // File extensions
      /^(jpg|jpeg|png|gif|webp|mp4|mov|avi)/i.test(lower) || // Timestamps like "5:19" or "1:23:45"
      /^\d{1,2}:\d{2}(:\d{2})?$/.test(lower) || // Common video/media caption patterns
      lower === "play" || lower === "pause" || lower === "mute" || lower === "unmute" || lower.includes("transcript") || lower.includes("download") || // If it's just "intro to X" or "episode X" by itself, likely a video title
      /^(intro|episode|part|chapter)\s+(to\s+)?\w/i.test(lower) && lower.length < 60
    );
  }
  function isInsideMediaCaption(node) {
    let current = node;
    let depth = 0;
    while (current && depth < 10) {
      const tagName = current.tagName?.toLowerCase() || "";
      if (tagName === "figcaption") {
        return true;
      }
      if (tagName === "figure") {
        const hasMedia = current.querySelector?.("video, audio, img, picture, iframe");
        if (hasMedia) return true;
      }
      const id = (current.id || "").toLowerCase();
      const className = (current.className || "").toLowerCase();
      if (id.includes("caption") || className.includes("caption")) {
        return true;
      }
      current = current.parentElement;
      depth++;
    }
    return false;
  }
  function isSiblingOfMedia(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    let hasMediaSibling = false;
    for (const sibling of parent.children || []) {
      if (sibling === node) continue;
      const tag = sibling.tagName?.toLowerCase();
      if (["video", "audio", "img", "picture", "iframe", "canvas"].includes(tag)) {
        hasMediaSibling = true;
        break;
      }
    }
    if (!hasMediaSibling) return false;
    const tagName = node.tagName?.toLowerCase() || "";
    const id = (node.id || "").toLowerCase();
    const className = (node.className || "").toLowerCase();
    const looksCaptiony = tagName === "figcaption" || id.includes("caption") || className.includes("caption") || id.includes("credit") || className.includes("credit") || id.includes("source") || className.includes("source");
    return looksCaptiony;
  }
  function processBlock2(node) {
    if (!node) return;
    const tagName = node.tagName?.toLowerCase() || "";
    if (["script", "style", "noscript", "svg", "canvas", "video", "audio", "iframe", "img", "picture", "figure", "figcaption"].includes(tagName)) {
      return;
    }
    if (isInsideMediaCaption(node)) {
      return;
    }
    if (isSiblingOfMedia(node)) {
      const textContent = (node.textContent || "").trim();
      if (textContent.length < 200) {
        return;
      }
    }
    if (isCalloutElement(node) || tagName === "aside") {
      const calloutContent = processCallout(node, extractText, isMediaMetadata);
      if (calloutContent.length > 0) {
        output2.push(`<blockquote>
${calloutContent.join("\n")}
</blockquote>`);
      }
      return;
    }
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
      const text2 = extractText(node).replace(/\s+/g, " ").trim();
      if (text2 && !isMediaMetadata(text2)) {
        output2.push(`<${tagName}>${text2}</${tagName}>`);
      }
      return;
    }
    if (tagName === "ul" || tagName === "ol") {
      const listItems = [];
      for (const child of node.childNodes || []) {
        if (child.tagName?.toLowerCase() === "li") {
          const text2 = extractText(child).replace(/\s+/g, " ").trim();
          if (text2 && !isMediaMetadata(text2)) {
            listItems.push(`<li>${text2}</li>`);
          }
        }
      }
      if (listItems.length > 0) {
        output2.push(`<${tagName}>${listItems.join("")}</${tagName}>`);
      }
      return;
    }
    if (tagName === "blockquote") {
      const text2 = extractText(node).replace(/\s+/g, " ").trim();
      if (text2 && !isMediaMetadata(text2)) {
        output2.push(`<blockquote>${text2}</blockquote>`);
      }
      return;
    }
    if (tagName === "details") {
      expandDetailsContent(node, extractText, isMediaMetadata);
      return;
    }
    if (tagName === "p" || tagName === "div") {
      if (isCalloutElement(node)) {
        const calloutContent = processCallout(node, extractText, isMediaMetadata);
        if (calloutContent.length > 0) {
          output2.push(`<blockquote>
${calloutContent.join("\n")}
</blockquote>`);
        }
        return;
      }
      const hasBlockChildren = Array.from(node.childNodes || []).some((child) => {
        const childTag = child.tagName?.toLowerCase();
        return ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "aside", "details"].includes(childTag);
      });
      if (hasBlockChildren) {
        for (const child of node.childNodes || []) {
          if (child.nodeType === 1) {
            processBlock2(child);
          }
        }
      } else {
        const text2 = extractText(node).replace(/\s+/g, " ").trim();
        if (text2 && !isMediaMetadata(text2)) {
          output2.push(`<p>${text2}</p>`);
        }
      }
      return;
    }
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        processBlock2(child);
      } else if (child.nodeType === 3) {
        const text2 = (child.textContent || "").replace(/\s+/g, " ").trim();
        if (text2 && text2.length > 20 && !isMediaMetadata(text2)) {
          output2.push(`<p>${text2}</p>`);
        }
      }
    }
  }
  for (const child of root.childNodes || []) {
    if (child.nodeType === 1) {
      processBlock2(child);
    } else if (child.nodeType === 3) {
      const text2 = (child.textContent || "").replace(/\s+/g, " ").trim();
      if (text2 && text2.length > 20 && !isMediaMetadata(text2)) {
        output2.push(`<p>${text2}</p>`);
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const uniqueOutput = output2.filter((item) => {
    const normalized = item.replace(/<[^>]+>/g, "").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  return uniqueOutput.join("\n");
}
function isCalloutElement(node) {
  const tagName = node.tagName?.toLowerCase() || "";
  const className = (node.className || "").toLowerCase();
  if (tagName === "aside") return true;
  const calloutPatterns = ["callout", "highlight", "featured", "big-idea", "key-point", "pull-quote", "note-box", "info-box"];
  return calloutPatterns.some((pattern) => className.includes(pattern));
}
function processCallout(node, extractText, isMediaMetadata) {
  const output2 = [];
  function processCalloutChild(child) {
    if (!child) return;
    const tagName = child.tagName?.toLowerCase() || "";
    if (["script", "style", "noscript", "svg", "canvas", "video", "audio", "iframe", "img", "picture", "figure", "figcaption"].includes(tagName)) {
      return;
    }
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
      const text3 = extractText(child).replace(/\s+/g, " ").trim();
      if (text3 && !isMediaMetadata(text3)) {
        output2.push(`<h4>${text3}</h4>`);
      }
      return;
    }
    if (tagName === "p") {
      const text3 = extractText(child).replace(/\s+/g, " ").trim();
      if (text3 && !isMediaMetadata(text3)) {
        output2.push(`<p>${text3}</p>`);
      }
      return;
    }
    if (tagName === "ul" || tagName === "ol") {
      const listItems = [];
      for (const li of child.childNodes || []) {
        if (li.tagName?.toLowerCase() === "li") {
          const text3 = extractText(li).replace(/\s+/g, " ").trim();
          if (text3 && !isMediaMetadata(text3)) {
            listItems.push(`<li>${text3}</li>`);
          }
        }
      }
      if (listItems.length > 0) {
        output2.push(`<${tagName}>${listItems.join("")}</${tagName}>`);
      }
      return;
    }
    if (tagName === "details") {
      expandDetailsInCallout(child, extractText, isMediaMetadata, output2);
      return;
    }
    if (tagName === "div" || tagName === "section" || !tagName) {
      for (const grandchild of child.childNodes || []) {
        if (grandchild.nodeType === 1) {
          processCalloutChild(grandchild);
        } else if (grandchild.nodeType === 3) {
          const text3 = (grandchild.textContent || "").trim();
          if (text3 && text3.length > 10 && !isMediaMetadata(text3)) {
            output2.push(`<p>${text3}</p>`);
          }
        }
      }
      return;
    }
    const text2 = extractText(child).replace(/\s+/g, " ").trim();
    if (text2 && !isMediaMetadata(text2)) {
      output2.push(`<p>${text2}</p>`);
    }
  }
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      processCalloutChild(child);
    } else if (child.nodeType === 3) {
      const text2 = (child.textContent || "").trim();
      if (text2 && text2.length > 10 && !isMediaMetadata(text2)) {
        output2.push(`<p>${text2}</p>`);
      }
    }
  }
  return output2;
}
function expandDetailsContent(node, extractText, isMediaMetadata) {
  if (!node) return;
  let summaryText = "";
  let hasSummary = false;
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      const childTag = child.tagName?.toLowerCase() || "";
      if (childTag === "summary") {
        hasSummary = true;
        summaryText = extractText(child).replace(/\s+/g, " ").trim();
        if (summaryText && !isMediaMetadata(summaryText)) {
          output.push(`<h4>${summaryText}</h4>`);
        }
        continue;
      }
      processBlock(child);
    } else if (child.nodeType === 3) {
      const text2 = (child.textContent || "").trim();
      if (text2 && text2.length > 20 && !isMediaMetadata(text2)) {
        output.push(`<p>${text2}</p>`);
      }
    }
  }
  if (!hasSummary) {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        processBlock(child);
      } else if (child.nodeType === 3) {
        const text2 = (child.textContent || "").trim();
        if (text2 && text2.length > 20 && !isMediaMetadata(text2)) {
          output.push(`<p>${text2}</p>`);
        }
      }
    }
  }
}
function expandDetailsInCallout(node, extractText, isMediaMetadata, output2) {
  if (!node) return;
  let summaryText = "";
  let hasSummary = false;
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      const childTag = child.tagName?.toLowerCase() || "";
      if (childTag === "summary") {
        hasSummary = true;
        summaryText = extractText(child).replace(/\s+/g, " ").trim();
        if (summaryText && !isMediaMetadata(summaryText)) {
          output2.push(`<h4>${summaryText}</h4>`);
        }
        continue;
      }
      if (childTag === "details") {
        expandDetailsInCallout(child, extractText, isMediaMetadata, output2);
        continue;
      }
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(childTag)) {
        const text3 = extractText(child).replace(/\s+/g, " ").trim();
        if (text3 && !isMediaMetadata(text3)) {
          output2.push(`<h4>${text3}</h4>`);
        }
        continue;
      }
      if (childTag === "p") {
        const text3 = extractText(child).replace(/\s+/g, " ").trim();
        if (text3 && !isMediaMetadata(text3)) {
          output2.push(`<p>${text3}</p>`);
        }
        continue;
      }
      if (childTag === "ul" || childTag === "ol") {
        const listItems = [];
        for (const li of child.childNodes || []) {
          if (li.tagName?.toLowerCase() === "li") {
            const text3 = extractText(li).replace(/\s+/g, " ").trim();
            if (text3 && !isMediaMetadata(text3)) {
              listItems.push(`<li>${text3}</li>`);
            }
          }
        }
        if (listItems.length > 0) {
          output2.push(`<${childTag}>${listItems.join("")}</${childTag}>`);
        }
        continue;
      }
      if (childTag === "blockquote") {
        const text3 = extractText(child).replace(/\s+/g, " ").trim();
        if (text3 && !isMediaMetadata(text3)) {
          output2.push(`<blockquote>${text3}</blockquote>`);
        }
        continue;
      }
      if (childTag === "div" || childTag === "section" || !childTag) {
        for (const grandchild of child.childNodes || []) {
          if (grandchild.nodeType === 1) {
            if (grandchild.tagName?.toLowerCase() === "details") {
              expandDetailsInCallout(grandchild, extractText, isMediaMetadata, output2);
            } else {
              const text3 = extractText(grandchild).replace(/\s+/g, " ").trim();
              if (text3 && text3.length > 10 && !isMediaMetadata(text3)) {
                output2.push(`<p>${text3}</p>`);
              }
            }
          } else if (grandchild.nodeType === 3) {
            const text3 = (grandchild.textContent || "").trim();
            if (text3 && text3.length > 10 && !isMediaMetadata(text3)) {
              output2.push(`<p>${text3}</p>`);
            }
          }
        }
        continue;
      }
      const text2 = extractText(child).replace(/\s+/g, " ").trim();
      if (text2 && text2.length > 10 && !isMediaMetadata(text2)) {
        output2.push(`<p>${text2}</p>`);
      }
    } else if (child.nodeType === 3) {
      const text2 = (child.textContent || "").trim();
      if (text2 && text2.length > 10 && !isMediaMetadata(text2)) {
        output2.push(`<p>${text2}</p>`);
      }
    }
  }
  if (!hasSummary) {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        const childTag = child.tagName?.toLowerCase() || "";
        if (childTag === "details") {
          expandDetailsInCallout(child, extractText, isMediaMetadata, output2);
        } else {
          const text2 = extractText(child).replace(/\s+/g, " ").trim();
          if (text2 && text2.length > 10 && !isMediaMetadata(text2)) {
            output2.push(`<p>${text2}</p>`);
          }
        }
      } else if (child.nodeType === 3) {
        const text2 = (child.textContent || "").trim();
        if (text2 && text2.length > 10 && !isMediaMetadata(text2)) {
          output2.push(`<p>${text2}</p>`);
        }
      }
    }
  }
}
function extractCalloutsWithContext(html) {
  const callouts = [];
  const { document: document2 } = parseHTML(`<div>${html}</div>`);
  const calloutSelectors = [
    "aside",
    '[class*="callout"]',
    '[class*="highlight"]',
    '[class*="featured"]',
    '[class*="big-idea"]',
    '[class*="key-point"]',
    '[class*="summary"]',
    '[class*="note-box"]',
    '[class*="info-box"]',
    '[class*="pullquote"]',
    '[class*="pull-quote"]'
  ];
  function getTextContent(node) {
    if (!node) return "";
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }
  function formatCalloutContent(node) {
    const parts = [];
    const headingSelectors = ["h1", "h2", "h3", "h4", "h5", "h6", '[class*="title"]', '[class*="heading"]', '[class*="header"]', "strong:first-child"];
    for (const sel of headingSelectors) {
      try {
        const heading = node.querySelector?.(sel);
        if (heading) {
          const text2 = getTextContent(heading);
          if (text2 && text2.length > 2 && text2.length < 100) {
            parts.push(`<h4>${text2}</h4>`);
            break;
          }
        }
      } catch {
      }
    }
    function processNode(n, skipHeadings = false) {
      if (!n) return;
      const tag = n.tagName?.toLowerCase() || "";
      const className = (n.className || "").toLowerCase();
      if (["script", "style", "img", "video", "audio", "svg", "figure", "button"].includes(tag)) return;
      if (skipHeadings && ["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) return;
      if (skipHeadings && (className.includes("title") || className.includes("heading") || className.includes("header"))) return;
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
        const text2 = getTextContent(n);
        if (text2 && text2.length > 2) parts.push(`<h4>${text2}</h4>`);
        return;
      }
      if (tag === "p") {
        const text2 = getTextContent(n);
        if (text2 && text2.length > 5) parts.push(`<p>${text2}</p>`);
        return;
      }
      if (tag === "ul" || tag === "ol") {
        const items = [];
        for (const li of n.querySelectorAll?.("li") || []) {
          const text2 = getTextContent(li);
          if (text2) items.push(`<li>${text2}</li>`);
        }
        if (items.length) parts.push(`<${tag}>${items.join("")}</${tag}>`);
        return;
      }
      for (const child of n.childNodes || []) {
        if (child.nodeType === 1) {
          processNode(child, true);
        } else if (child.nodeType === 3) {
          const text2 = (child.textContent || "").trim();
          if (text2 && text2.length > 20) parts.push(`<p>${text2}</p>`);
        }
      }
    }
    processNode(node, parts.length > 0);
    return parts.join("\n");
  }
  function findPrecedingText(el) {
    let sibling = el.previousElementSibling;
    let attempts = 0;
    while (sibling && attempts < 5) {
      const tag = sibling.tagName?.toLowerCase() || "";
      if (!["script", "style", "aside", "nav", "header", "footer"].includes(tag)) {
        const text2 = getTextContent(sibling);
        if (text2 && text2.length > 30) {
          return text2.substring(0, 150);
        }
      }
      sibling = sibling.previousElementSibling;
      attempts++;
    }
    let parent = el.parentElement;
    let parentAttempts = 0;
    while (parent && parentAttempts < 3) {
      sibling = parent.previousElementSibling;
      attempts = 0;
      while (sibling && attempts < 5) {
        const tag = sibling.tagName?.toLowerCase() || "";
        if (!["script", "style", "aside", "nav", "header", "footer"].includes(tag)) {
          const text2 = getTextContent(sibling);
          if (text2 && text2.length > 30) {
            return text2.substring(0, 150);
          }
        }
        sibling = sibling.previousElementSibling;
        attempts++;
      }
      parent = parent.parentElement;
      parentAttempts++;
    }
    return "";
  }
  for (const selector of calloutSelectors) {
    try {
      const elements = document2.querySelectorAll(selector);
      for (const el of elements) {
        const content = formatCalloutContent(el);
        if (!content || content.length < 20) continue;
        const contextBefore = findPrecedingText(el);
        const contentStart = content.substring(0, 50).toLowerCase().replace(/<[^>]+>/g, "");
        if (!callouts.some((c) => c.content.toLowerCase().includes(contentStart))) {
          callouts.push({ content, contextBefore });
        }
      }
    } catch {
    }
  }
  return callouts;
}
function expandAccordionsInContent(content) {
  if (!content || !content.includes("<details")) {
    return content;
  }
  const { document: document2 } = parseHTML(`<div>${content}</div>`);
  const root = document2.querySelector("div");
  if (!root) return content;
  let hasDetails = true;
  let iterations = 0;
  const maxIterations = 10;
  while (hasDetails && iterations < maxIterations) {
    iterations++;
    const detailsElements = Array.from(root.querySelectorAll("details"));
    hasDetails = detailsElements.length > 0;
    for (const detailsEl of detailsElements) {
      let summaryText = "";
      let hasSummary = false;
      const expandedNodes = [];
      for (const child of Array.from(detailsEl.childNodes || [])) {
        if (child.nodeType === 1) {
          const childTag = child.tagName?.toLowerCase() || "";
          if (childTag === "summary") {
            hasSummary = true;
            summaryText = (child.textContent || "").replace(/\s+/g, " ").trim();
            continue;
          }
          expandedNodes.push(child.cloneNode(true));
        } else if (child.nodeType === 3) {
          const text2 = (child.textContent || "").trim();
          if (text2 && text2.length > 0) {
            const p = document2.createElement("p");
            p.textContent = text2;
            expandedNodes.push(p);
          }
        }
      }
      const fragment = document2.createDocumentFragment();
      if (hasSummary && summaryText) {
        const heading = document2.createElement("h4");
        heading.textContent = summaryText;
        fragment.appendChild(heading);
      }
      for (const node of expandedNodes) {
        fragment.appendChild(node);
      }
      if (detailsEl.parentNode) {
        detailsEl.parentNode.replaceChild(fragment, detailsEl);
      }
    }
  }
  return root.innerHTML;
}
function removeImagesAndCaptions(content) {
  const { document: document2 } = parseHTML(`<div>${content}</div>`);
  const root = document2.querySelector("div");
  if (!root) return content;
  const imageElements = root.querySelectorAll('img, picture, figure, figcaption, [class*="image"], [class*="photo"], [class*="caption"], [id*="image"], [id*="photo"], [id*="caption"]');
  imageElements.forEach((el) => el.remove());
  const allElements = root.querySelectorAll("*");
  allElements.forEach((el) => {
    const tagName = el.tagName?.toLowerCase() || "";
    const className = (el.className || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const textContent = (el.textContent || "").trim();
    if (className.includes("caption") || className.includes("credit") || className.includes("source") || className.includes("image-credit") || id.includes("caption") || id.includes("credit") || id.includes("source") || // Remove very short paragraphs that might be captions (but keep headings)
    tagName === "p" && textContent.length < 50 && (textContent.toLowerCase().includes("credit") || textContent.toLowerCase().includes("photo") || textContent.toLowerCase().includes("image") || /^(photo|image|credit|source):/i.test(textContent))) {
      el.remove();
    }
  });
  return root.innerHTML;
}
async function extractArticleContent(html, url) {
  try {
    const callouts = extractCalloutsWithContext(html);
    let cleanedContent = null;
    try {
      const extracted = await extract(url, {
        html,
        fetchOptions: {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)"
          }
        }
      });
      if (extracted && extracted.content) {
        cleanedContent = typeof extracted.content === "string" ? extracted.content : String(extracted.content);
        cleanedContent = expandAccordionsInContent(cleanedContent);
      }
    } catch (error) {
    }
    if (!cleanedContent || cleanedContent.replace(/<[^>]+>/g, "").trim().length < 200) {
      const { document: document2 } = parseHTML(html);
      const reader = new Readability(document2, {
        debug: false,
        maxElemsToParseToMainContent: 0,
        // No limit
        nbTopCandidates: 5,
        charThreshold: 500
        // Minimum characters to consider it an article
      });
      const article = reader.parse();
      if (article && article.content) {
        const readabilityContent = htmlToCleanParagraphs(article.content);
        if (readabilityContent && readabilityContent.replace(/<[^>]+>/g, "").trim().length > (cleanedContent?.replace(/<[^>]+>/g, "").trim().length || 0)) {
          cleanedContent = readabilityContent;
        }
      }
      if (!cleanedContent || cleanedContent.replace(/<[^>]+>/g, "").trim().length < 200) {
        const { document: fallbackDoc } = parseHTML(html);
        const mainContent = fallbackDoc.querySelector('main, article, [role="main"]');
        if (mainContent) {
          const fallbackContent = htmlToCleanParagraphs(mainContent.innerHTML);
          if (fallbackContent && fallbackContent.replace(/<[^>]+>/g, "").trim().length > (cleanedContent?.replace(/<[^>]+>/g, "").trim().length || 0)) {
            cleanedContent = fallbackContent;
          }
        }
      }
    }
    if (!cleanedContent) {
      return null;
    }
    cleanedContent = removeImagesAndCaptions(cleanedContent);
    for (const callout of callouts) {
      const plainCalloutText = callout.content.replace(/<[^>]+>/g, "").substring(0, 50).toLowerCase();
      if (cleanedContent.toLowerCase().includes(plainCalloutText)) {
        continue;
      }
      if (callout.contextBefore) {
        const contextLower = callout.contextBefore.toLowerCase();
        const contentLower = cleanedContent.toLowerCase();
        const searchContext = contextLower.substring(0, 50);
        const contextIndex = contentLower.indexOf(searchContext);
        if (contextIndex !== -1) {
          const afterContext = cleanedContent.substring(contextIndex);
          const nextBlockEnd = afterContext.search(/<\/(p|h[1-6]|ul|ol|blockquote)>/);
          if (nextBlockEnd !== -1) {
            const insertPoint = contextIndex + nextBlockEnd + afterContext.match(/<\/(p|h[1-6]|ul|ol|blockquote)>/)[0].length;
            cleanedContent = cleanedContent.substring(0, insertPoint) + `
<blockquote>
${callout.content}
</blockquote>` + cleanedContent.substring(insertPoint);
            continue;
          }
        }
      }
      cleanedContent += `
<blockquote>
${callout.content}
</blockquote>`;
    }
    return cleanedContent || null;
  } catch (error) {
    return null;
  }
}

// server/routes/notes.ts
init_html_stripper();
var route10 = new Hono10();
var TITLE_HARD_LIMIT = 50;
var truncateAndCapitalizeTitle = (title) => {
  const truncated = title.slice(0, TITLE_HARD_LIMIT);
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};
route10.post("/api/notes/create", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteLimitCheck = await canCreateNote(auth.userId, auth);
    if (!noteLimitCheck.allowed) {
      return c.json({
        error: noteLimitCheck.reason || "You've used all your notes. Upgrade for unlimited.",
        code: "NOTE_LIMIT_EXCEEDED",
        currentCount: noteLimitCheck.currentCount,
        limit: noteLimitCheck.limit,
        upgradeUrl: noteLimitCheck.upgradeUrl
      }, 403);
    }
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/create", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error || "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const formData = await c.req.formData();
    const content = formData.get("content");
    const title = formData.get("title");
    const threadId = formData.get("threadId");
    const noteType = formData.get("noteType");
    const scriptureReference = formData.get("scriptureReference");
    const scriptureVersion = formData.get("scriptureVersion");
    const resourceUrl = formData.get("resourceUrl");
    const resourceMetadataStr = formData.get("resourceMetadata");
    const spaceId = formData.get("spaceId");
    const contentEncrypted = formData.get("contentEncrypted") === "true";
    let prefetchedResourceMetadata = null;
    if (resourceMetadataStr) {
      try {
        prefetchedResourceMetadata = JSON.parse(resourceMetadataStr);
      } catch {
      }
    }
    const noteTypeValidation = validateNoteType(noteType);
    if (!noteTypeValidation.isValid) return c.json({ error: noteTypeValidation.error, code: noteTypeValidation.code }, 400);
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : "default";
    const contentRequired = finalNoteType !== "resource";
    const contentValidation = validateContent(content, contentRequired);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);
    const threadIdValidation = validateThreadId(threadId);
    if (!threadIdValidation.isValid) return c.json({ error: threadIdValidation.error, code: threadIdValidation.code }, 400);
    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) return c.json({ error: spaceIdValidation.error, code: spaceIdValidation.code }, 400);
    let validatedResourceUrl = null;
    let isPDF = false;
    if (finalNoteType === "resource") {
      if (!resourceUrl || !resourceUrl.trim()) return c.json({ error: "Resource URL is required", code: "URL_REQUIRED" }, 400);
      const urlValidation = validateResourceUrl(resourceUrl);
      if (!urlValidation.isValid) return c.json({ error: urlValidation.error, code: urlValidation.code || "INVALID_URL" }, 400);
      validatedResourceUrl = urlValidation.normalizedUrl;
      isPDF = urlValidation.isPDF || false;
    }
    const capitalizedContent = content && content.length > 0 ? content.charAt(0).toUpperCase() + content.slice(1) : content || "";
    let capitalizedTitle;
    if (!title || !title.trim()) {
      capitalizedTitle = await getNextUntitledNoteName(auth.userId);
    } else {
      capitalizedTitle = truncateAndCapitalizeTitle(title);
    }
    await ensureUnorganizedThread(auth.userId);
    const finalThreadId = "thread_unorganized";
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        userColor: "paper",
        currentSeason: season,
        createdAt: nowISO()
      });
      userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    }
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== "default_space") finalSpaceId = spaceId;
    const now = nowISO();
    const isScriptureNote = finalNoteType === "scripture";
    const shouldAutoShare = isScriptureNote && !contentEncrypted;
    const shareToken = shouldAutoShare ? generateShareToken() : null;
    const newNote = await db.insert(Notes).values({
      id: generateNoteId(),
      content: capitalizedContent,
      title: capitalizedTitle,
      threadId: finalThreadId,
      spaceId: finalSpaceId,
      simpleNoteId: nextSimpleNoteId,
      noteType: finalNoteType,
      userId: auth.userId,
      isPublic: shouldAutoShare,
      shareToken,
      shareTokenCreatedAt: shouldAutoShare ? now : null,
      contentEncrypted,
      createdAt: now,
      lastVisited: now
    }).returning().get();
    await db.update(UserMetadata).set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    let noteStaysInUnorganized = true;
    if (threadId && threadId.trim() !== "" && threadId !== "thread_unorganized" && !threadId.startsWith("thread_onboarding_")) {
      try {
        const targetThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
        if (targetThread) {
          const junctionId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(NoteThreads).values({ id: junctionId, noteId: newNote.id, threadId, createdAt: nowISO() });
          await db.update(Notes).set({ threadId }).where(eq(Notes.id, newNote.id));
          await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
          noteStaysInUnorganized = false;
        }
      } catch (error) {
        console.error("[api/notes/create] Error adding note to specific thread:", error);
      }
    }
    if (noteStaysInUnorganized) {
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, auth.userId)));
    }
    try {
      await awardCreationBonusXP(auth.userId, "note");
    } catch {
    }
    const finalNote = await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get();
    if (finalNote) Object.assign(newNote, finalNote);
    if (finalNoteType !== "resource" && !contentEncrypted) {
      (async () => {
        try {
          const r = await generateAutoTags(capitalizedTitle || "", capitalizedContent, auth.userId, 0.8);
          if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
        } catch {
        }
      })().catch(() => {
      });
    }
    if (finalNoteType === "scripture" && scriptureReference) {
      try {
        const normalizedReference = normalizeScriptureReference(scriptureReference);
        const parsed = parseScriptureReference(normalizedReference);
        if (parsed) {
          const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
          const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : void 0;
          await db.insert(ScriptureMetadata).values({
            id: `scripture_${newNote.id}_${Date.now()}`,
            noteId: newNote.id,
            reference: normalizedReference,
            book: parsed.book,
            chapter: parsed.chapter,
            verse: verseStart,
            verseEnd: verseEnd || null,
            translation: scriptureVersion || "NET",
            originalText: capitalizedContent,
            createdAt: nowISO()
          });
        }
      } catch (error) {
        console.error("Error creating ScriptureMetadata (non-critical):", error);
      }
    }
    if (finalNoteType === "resource" && validatedResourceUrl) {
      try {
        let resourceMetadata = { ...prefetchedResourceMetadata };
        if (!isPDF) {
          try {
            const htmlResponse = await fetch(validatedResourceUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)", Accept: "text/html,application/xhtml+xml" },
              signal: AbortSignal.timeout(15e3)
            });
            if (htmlResponse.ok) {
              const html = await htmlResponse.text();
              const articleContent = await extractArticleContent(html, validatedResourceUrl);
              if (articleContent) resourceMetadata = { ...resourceMetadata, articleContent };
            }
          } catch {
          }
        }
        await db.insert(ResourceMetadata).values({
          id: `resource_${newNote.id}_${Date.now()}`,
          noteId: newNote.id,
          sourceUrl: validatedResourceUrl,
          sourceDomain: extractDomain(validatedResourceUrl),
          sourceName: resourceMetadata?.siteName || null,
          sourceTitle: resourceMetadata?.title || null,
          sourceDescription: resourceMetadata?.description || null,
          sourceImage: resourceMetadata?.image || null,
          createdAt: nowISO()
        });
        if (resourceMetadata) {
          const updateData = { updatedAt: nowISO() };
          if (resourceMetadata.title) updateData.title = truncateAndCapitalizeTitle(resourceMetadata.title);
          if (resourceMetadata.articleContent) updateData.content = resourceMetadata.articleContent;
          else if (resourceMetadata.description) updateData.content = resourceMetadata.description;
          if (updateData.title || updateData.content) {
            await db.update(Notes).set(updateData).where(eq(Notes.id, newNote.id));
            const updatedNote = await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get();
            if (updatedNote) {
              Object.assign(newNote, updatedNote);
              if (updateData.title) capitalizedTitle = updateData.title;
            }
          }
          try {
            const contentForTagging = updateData.content || newNote.content || "";
            const titleForTagging = updateData.title || capitalizedTitle || "";
            const r = await generateAutoTags(titleForTagging, contentForTagging, auth.userId, 0.8);
            if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
          } catch {
          }
        }
      } catch (error) {
        console.error("Error creating ResourceMetadata (non-critical):", error);
      }
    }
    if (!contentEncrypted) {
      (async () => {
        try {
          const actualThreadId = threadId && threadId !== "thread_unorganized" ? threadId : "thread_unorganized";
          const latestNote = finalNoteType === "resource" ? await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get() : null;
          const contentToProcess = latestNote?.content || newNote.content;
          await processScriptureReferences(newNote.id, auth.userId, actualThreadId, contentToProcess);
        } catch {
        }
      })().catch(() => {
      });
    }
    return c.json({ success: "Note created!", note: newNote, scriptureResults: [] });
  } catch (error) {
    console.error("[api/notes/create] Error:", error);
    return c.json({ error: error.message || "Failed to create note" }, 500);
  }
});
route10.put("/api/notes/update", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/update", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const body = await c.req.json();
    const { noteId, title, content, resourceImage, contentEncrypted } = body;
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);
    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: "Note not found" }, 404);
    const isEncrypted = contentEncrypted === true;
    const capitalizedContent = isEncrypted ? content : content.charAt(0).toUpperCase() + content.slice(1);
    const capitalizedTitle = title ? title.charAt(0).toUpperCase() + title.slice(1) : title;
    const updateData = { title: capitalizedTitle, content: capitalizedContent, updatedAt: nowISO() };
    if (typeof contentEncrypted === "boolean") {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) {
        updateData.isPublic = false;
        updateData.shareToken = null;
        updateData.shareTokenCreatedAt = null;
      }
    }
    const updatedNote = await db.update(Notes).set(updateData).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).returning().get();
    if (!updatedNote) return c.json({ error: "Failed to update note" }, 500);
    const noteThreads = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).all();
    for (const nt of noteThreads) {
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, nt.threadId), eq(Threads.userId, auth.userId)));
    }
    if (!isEncrypted) {
      (async () => {
        try {
          await removeAutoTags(noteId);
          const r = await generateAutoTags(capitalizedTitle || "", capitalizedContent, auth.userId, 0.8);
          if (r.suggestions.length > 0) await applyAutoTags(noteId, r.suggestions, auth.userId);
        } catch {
        }
      })().catch(() => {
      });
    }
    if (existingNote.noteType === "resource" && resourceImage !== void 0) {
      try {
        const rm = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).get();
        if (rm) await db.update(ResourceMetadata).set({ sourceImage: resourceImage || null }).where(eq(ResourceMetadata.noteId, noteId));
      } catch {
      }
    }
    let scriptureResults = [];
    let processedContent = null;
    if (!isEncrypted) {
      try {
        let actualThreadId = "thread_unorganized";
        const threadRelation = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).limit(1).get();
        if (threadRelation) actualThreadId = threadRelation.threadId;
        const scriptureResult = await processScriptureReferences(noteId, auth.userId, actualThreadId, capitalizedContent);
        scriptureResults = scriptureResult.results || [];
        processedContent = scriptureResult.updatedContent || null;
      } catch (error) {
        console.error("[api/notes/update] Scripture processing failed:", error?.message);
      }
    }
    return c.json({ success: "Note updated!", note: updatedNote, scriptureResults, processedContent });
  } catch (error) {
    return c.json({ error: error.message || "Failed to update note" }, 500);
  }
});
route10.delete("/api/notes/delete", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/delete", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const noteId = c.req.query("noteId");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: "Note not found or access denied" }, 404);
    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;
    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    try {
      const notesWithLinks = await db.select({ id: Notes.id, content: Notes.content }).from(Notes).where(and(eq(Notes.userId, auth.userId), not(eq(Notes.contentEncrypted, true)), like(Notes.content, "%data-note-id=%"))).all();
      for (const note of notesWithLinks) {
        if (!note.content?.includes("data-note-id")) continue;
        const stripped = stripNoteLinksToNoteId(note.content, noteId);
        if (stripped !== note.content) {
          await db.update(Notes).set({ content: stripped, updatedAt: nowISO() }).where(and(eq(Notes.id, note.id), eq(Notes.userId, auth.userId)));
        }
      }
    } catch {
    }
    (async () => {
      try {
        await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt));
        await revokeAllXPForItem(auth.userId, noteId);
      } catch {
      }
    })().catch(() => {
    });
    return c.json({ success: "Note erased!", noteId, threadId });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/delete", action: "delete_note" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.get("/api/notes/next-id", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        currentSeason: season,
        createdAt: nowISO()
      });
      userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    }
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    const formattedId = `N${nextSimpleNoteId.toString().padStart(3, "0")}`;
    return c.json({ nextNoteId: nextSimpleNoteId, formattedId });
  } catch (error) {
    console.error("Error getting next note ID:", error);
    return c.json({ error: error.message || "Failed to get next note ID" }, 500);
  }
});
route10.get("/api/notes/recent", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const maxLimit = Math.max(1, limit);
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      contentEncrypted: Notes.contentEncrypted,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited
    }).from(Notes).where(eq(Notes.userId, auth.userId)).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).limit(maxLimit);
    const formattedNotes = notes.map((note) => ({
      ...note,
      title: note.title || "Untitled Note",
      contentEncrypted: note.contentEncrypted || false,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt
    }));
    return c.json(formattedNotes);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/recent", action: "get_recent_notes" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.post("/api/notes/auto-tags", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const { noteId, noteTitle, noteContent, action = "generate" } = await c.req.json();
    if (!noteId || !noteTitle || !noteContent) return c.json({ error: "Note ID, title, and content are required" }, 400);
    let result;
    switch (action) {
      case "generate":
        result = await generateAutoTags(noteTitle, noteContent, auth.userId);
        break;
      case "apply": {
        const suggestions = await generateAutoTags(noteTitle, noteContent, auth.userId);
        const applied = await applyAutoTags(noteId, suggestions.suggestions, auth.userId);
        result = { ...suggestions, applied };
        break;
      }
      case "regenerate":
        result = await regenerateAutoTags(noteId, noteTitle, noteContent, auth.userId);
        break;
      default:
        return c.json({ error: "Invalid action" }, 400);
    }
    return c.json({ success: true, result });
  } catch (error) {
    console.error("Error with auto tags:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
route10.post("/api/notes/cleanup-upgrade-note", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/cleanup-upgrade-note", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const { noteId, simpleNoteId } = await c.req.json();
    if (!noteId || !simpleNoteId) return c.json({ error: "Note ID and simple note ID are required" }, 400);
    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: "Note not found or access denied" }, 404);
    if (existingNote.simpleNoteId !== simpleNoteId) return c.json({ error: "Simple note ID mismatch" }, 400);
    const noteCreatedAt = existingNote.createdAt;
    await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    await db.delete(Comments).where(eq(Comments.noteId, noteId));
    await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
    await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt));
    await revokeAllXPForItem(auth.userId, noteId);
    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    const userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (userMetadata) {
      if (userMetadata.highestSimpleNoteId === simpleNoteId) {
        await db.update(UserMetadata).set({ highestSimpleNoteId: simpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      } else if (userMetadata.highestSimpleNoteId > simpleNoteId) {
        const existing = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
        const newHighestId = existing.length > 0 ? existing[0].simpleNoteId || 0 : 0;
        await db.update(UserMetadata).set({ highestSimpleNoteId: newHighestId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      }
    }
    return c.json({ success: true, message: "Note cleaned up and highestSimpleNoteId reset" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/cleanup-upgrade-note", action: "cleanup_upgrade_note" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.delete("/api/notes/delete-all-unorganized", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    await db.delete(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.threadId, "thread_unorganized")));
    return c.json({ success: true, message: "All notes deleted from unorganized thread" });
  } catch (error) {
    console.error("Error deleting unorganized thread notes:", error);
    return c.json({ error: "Failed to erase notes from unorganized thread" }, 500);
  }
});
route10.post("/api/notes/suggest-threads", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const { title, content } = await c.req.json();
    if (!title && !content) return c.json({ error: "Title or content is required", code: "MISSING_CONTENT" }, 400);
    const noteText = `${title || ""} ${content || ""}`.trim();
    if (!noteText) return c.json({ error: "Note text is required", code: "EMPTY_CONTENT" }, 400);
    const extractKeywords = (text2) => text2.toLowerCase().split(/\s+/).filter((w) => w.length > 3).filter((w) => !["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "let", "put", "say", "she", "too", "use"].includes(w));
    const calculateSimilarity = (t1, t2) => {
      const w1 = new Set(t1.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
      const w2 = new Set(t2.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
      const intersection = new Set([...w1].filter((w) => w2.has(w)));
      const union = /* @__PURE__ */ new Set([...w1, ...w2]);
      return union.size === 0 ? 0 : intersection.size / union.size;
    };
    const suggestions = [];
    const recentThreadRelations = await db.select({ threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt }).from(NoteThreads).innerJoin(Notes, eq(NoteThreads.noteId, Notes.id)).where(eq(Notes.userId, auth.userId)).orderBy(desc(NoteThreads.createdAt)).limit(50);
    const recentThreadIds = [...new Set(recentThreadRelations.map((r) => r.threadId))].filter((id) => id !== "thread_unorganized").slice(0, 10);
    if (recentThreadIds.length > 0) {
      const recentThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color }).from(Threads).where(and(inArray(Threads.id, recentThreadIds), eq(Threads.userId, auth.userId))).all();
      recentThreads.forEach((thread, idx) => {
        suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score: 0.3 * (1 - idx / recentThreads.length), reason: "Recently used" });
      });
    }
    const keywords = extractKeywords(noteText);
    if (keywords.length > 0) {
      const allThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color }).from(Threads).where(eq(Threads.userId, auth.userId)).all();
      allThreads.forEach((thread) => {
        if (thread.id === "thread_unorganized") return;
        const threadKeywords = extractKeywords(thread.title);
        const matching = keywords.filter((kw) => threadKeywords.some((tk) => tk.includes(kw) || kw.includes(tk)));
        if (matching.length > 0) {
          const score = 0.5 * (matching.length / keywords.length);
          const existing = suggestions.findIndex((s) => s.threadId === thread.id);
          if (existing >= 0) {
            suggestions[existing].score = Math.max(suggestions[existing].score, score);
            suggestions[existing].reason = "Similar keywords";
          } else suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score, reason: "Similar keywords" });
        }
      });
    }
    const allUserNotes = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content }).from(Notes).where(eq(Notes.userId, auth.userId)).limit(100);
    const similarNotes = [];
    allUserNotes.forEach((note) => {
      const t = `${note.title || ""} ${note.content || ""}`.trim();
      if (t) {
        const s = calculateSimilarity(noteText, t);
        if (s > 0.2) similarNotes.push({ noteId: note.id, similarity: s });
      }
    });
    similarNotes.sort((a, b) => b.similarity - a.similarity);
    const topSimilarNoteIds = similarNotes.slice(0, 10).map((n) => n.noteId);
    if (topSimilarNoteIds.length > 0) {
      const similarNoteThreads = await db.select({ threadId: NoteThreads.threadId, noteId: NoteThreads.noteId }).from(NoteThreads).where(inArray(NoteThreads.noteId, topSimilarNoteIds)).all();
      const threadSimMap = {};
      similarNoteThreads.forEach((nt) => {
        if (nt.threadId === "thread_unorganized") return;
        const ns = similarNotes.find((n) => n.noteId === nt.noteId)?.similarity || 0;
        threadSimMap[nt.threadId] = Math.max(threadSimMap[nt.threadId] || 0, ns);
      });
      const simThreadIds = Object.keys(threadSimMap);
      if (simThreadIds.length > 0) {
        const threads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color }).from(Threads).where(and(inArray(Threads.id, simThreadIds), eq(Threads.userId, auth.userId))).all();
        threads.forEach((thread) => {
          const score = 0.7 * threadSimMap[thread.id];
          const existing = suggestions.findIndex((s) => s.threadId === thread.id);
          if (existing >= 0) {
            suggestions[existing].score = Math.max(suggestions[existing].score, score);
            suggestions[existing].reason = "Similar to your notes";
          } else suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score, reason: "Similar to your notes" });
        });
      }
    }
    const unique = suggestions.reduce((acc, curr) => {
      const ex = acc.find((s) => s.threadId === curr.threadId);
      if (!ex) acc.push(curr);
      else if (curr.score > ex.score) acc[acc.indexOf(ex)] = curr;
      return acc;
    }, []);
    unique.sort((a, b) => b.score - a.score);
    const top = unique.slice(0, 5);
    return c.json({
      success: true,
      suggestedThreadIds: top.map((s) => s.threadId),
      suggestedThreads: top.map((s) => ({ id: s.threadId, title: s.title, color: s.color, reason: s.reason }))
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/suggest-threads", action: "suggest_threads" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.get("/api/notes/:id/details", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteId = c.req.param("id");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    let note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    let isMemberView = false;
    if (!note) {
      const noteById = await db.select().from(Notes).where(eq(Notes.id, noteId)).get();
      if (!noteById || !noteById.spaceId) return c.json({ error: "Note not found or access denied" }, 404);
      try {
        await requireSpaceAccess(noteById.spaceId, auth.userId);
      } catch (err) {
        if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
        throw err;
      }
      note = noteById;
      isMemberView = true;
    }
    let version;
    if (note.noteType === "scripture") {
      try {
        const sm = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId)).get();
        version = sm?.translation;
      } catch {
        version = void 0;
      }
    }
    let resourceTitle = null, resourceDescription = null, resourceImage = null;
    if (note.noteType === "resource") {
      try {
        const rm = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).get();
        resourceTitle = rm?.sourceTitle || null;
        resourceDescription = rm?.sourceDescription || null;
        resourceImage = rm?.sourceImage || null;
      } catch {
      }
    }
    const allUserThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color, isPublic: Threads.isPublic, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt }).from(Threads).where(eq(Threads.userId, auth.userId)).all();
    let allThreads = [];
    try {
      const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt }).from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id)).where(and(eq(NoteThreads.noteId, noteId), eq(Threads.userId, auth.userId))).all();
      allThreads = junctionThreads.filter((t) => t.title !== "Unorganized");
    } catch {
      allThreads = [];
    }
    const formattedThreads = await Promise.all(allThreads.map(async (thread) => {
      const junctionCountResult = await db.select({ count: count() }).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.userId, auth.userId))).get();
      return { ...thread, subtitle: thread.subtitle || "Thread", count: junctionCountResult?.count || 0 };
    }));
    const comments = await db.select({ id: Comments.id, content: Comments.content, createdAt: Comments.createdAt, updatedAt: Comments.updatedAt }).from(Comments).where(and(eq(Comments.noteId, noteId), eq(Comments.userId, auth.userId))).orderBy(Comments.createdAt);
    const noteTags = await db.select({ id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem, isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence }).from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id)).where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, auth.userId))).orderBy(Tags.name);
    let referencingNotes = [];
    if (note.noteType === "scripture") {
      try {
        let junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id)).where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId))).orderBy(desc(Notes.updatedAt)).all();
        if (junctionEntries.length === 0) {
          try {
            const notesWithPill = await db.select({ id: Notes.id }).from(Notes).where(and(eq(Notes.userId, auth.userId), ne(Notes.noteType, "scripture"), like(Notes.content, `%data-note-id="${noteId}"%`))).all();
            for (const refNote of notesWithPill) {
              try {
                const ex = await db.select().from(NoteScriptureReferences).where(and(eq(NoteScriptureReferences.noteId, refNote.id), eq(NoteScriptureReferences.scriptureNoteId, noteId))).limit(1).get();
                if (!ex) await db.insert(NoteScriptureReferences).values({ id: `note-scripture-${refNote.id}-${noteId}-${Date.now()}`, noteId: refNote.id, scriptureNoteId: noteId, createdAt: nowISO() });
              } catch {
              }
            }
            if (notesWithPill.length > 0) {
              junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt }).from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id)).where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId))).orderBy(desc(Notes.updatedAt)).all();
            }
          } catch {
          }
        }
        const resourceNoteIds = junctionEntries.filter((e) => e.noteType === "resource").map((e) => e.id);
        let resourceMetadataMap = {};
        if (resourceNoteIds.length > 0) {
          try {
            const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
            resourceMetadataMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
          } catch {
          }
        }
        referencingNotes = junctionEntries.map((entry) => {
          const rm = entry.noteType === "resource" ? resourceMetadataMap[entry.id] : null;
          return { ...entry, noteType: entry.noteType || "default", resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null };
        });
      } catch {
        referencingNotes = [];
      }
    }
    return c.json({
      success: true,
      note: { ...note, contentEncrypted: note.contentEncrypted || false, noteType: note.noteType || "default", addedBy: note.addedBy || "user", version, resourceTitle, resourceDescription, resourceImage },
      threads: formattedThreads,
      allUserThreads: allUserThreads.map((t) => ({ id: t.id, title: t.title, color: t.color, isPublic: t.isPublic, createdAt: t.createdAt, updatedAt: t.updatedAt })),
      comments: comments.map((c2) => ({ id: c2.id, content: c2.content, createdAt: c2.createdAt, updatedAt: c2.updatedAt })),
      tags: noteTags.map((t) => ({ id: t.id, name: t.name, color: t.color, category: t.category, isSystem: t.isSystem, isAutoGenerated: t.isAutoGenerated, confidence: t.confidence })),
      referencingNotes
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/[id]/details", action: "get_note_details" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.post("/api/notes/:id/update-content", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/[id]/update-content", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const id = c.req.param("id");
    const { content, contentEncrypted } = await c.req.json();
    if (!id) return c.json({ success: false, error: "Note ID is required" }, 400);
    if (!content || typeof content !== "string") return c.json({ success: false, error: "Content is required" }, 400);
    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: "Note not found" }, 404);
    const updateData = { content, updatedAt: nowISO() };
    if (typeof contentEncrypted === "boolean") {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) {
        updateData.isPublic = false;
        updateData.shareToken = null;
        updateData.shareTokenCreatedAt = null;
      }
    }
    await db.update(Notes).set(updateData).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId)));
    return c.json({ success: true, message: "Note content updated" });
  } catch (error) {
    console.error("Error updating note content:", error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});
route10.post("/api/notes/:id/add-thread", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/[id]/add-thread", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const id = c.req.param("id");
    const { threadId } = await c.req.json();
    if (!id) return c.json({ success: false, error: "Note ID is required" }, 400);
    if (!threadId) return c.json({ success: false, error: "Thread ID is required" }, 400);
    if (threadId.startsWith("thread_onboarding_")) return c.json({ success: false, error: "This thread doesn't take new notes." }, 400);
    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: "Note not found" }, 404);
    const targetThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!targetThread) return c.json({ success: false, error: "Target thread not found" }, 404);
    const existingRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).get();
    if (existingRelation) return c.json({ success: true, alreadyInThread: true });
    const existingThreadRelations = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id)).all();
    const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === "thread_unorganized";
    try {
      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: noteThreadId, noteId: id, threadId, createdAt: nowISO() });
      if (isInUnorganized && threadId !== "thread_unorganized") {
        await db.update(Notes).set({ threadId }).where(eq(Notes.id, id));
      }
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
      moveScriptureNotesToThread(id, threadId, auth.userId).catch(() => {
      });
    } catch (insertError) {
      const standardError = handleAPIError(insertError, { endpoint: "/api/notes/[id]/add-thread", action: "add_note_to_thread" });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }
    return c.json({ success: true, message: "Note added to thread", note: { id: note.id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/[id]/add-thread", action: "add_note_to_thread" });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});
route10.post("/api/notes/:id/remove-thread", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/notes/[id]/remove-thread", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const id = c.req.param("id");
    const { threadId } = await c.req.json();
    if (!id) return c.json({ success: false, error: "Note ID is required" }, 400);
    if (!threadId) return c.json({ success: false, error: "Thread ID is required" }, 400);
    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: "Note not found" }, 404);
    const existingRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).get();
    if (!existingRelation) return c.json({ success: false, error: "Note is not in this thread" }, 400);
    try {
      await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));
      const remainingThreads = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id)).all();
      if (remainingThreads.length === 0) {
        await ensureUnorganizedThread(auth.userId);
        await db.update(Notes).set({ threadId: "thread_unorganized" }).where(eq(Notes.id, id));
      }
      removeScriptureNotesFromThread(id, threadId, auth.userId).catch(() => {
      });
    } catch (deleteError) {
      const standardError = handleAPIError(deleteError, { endpoint: "/api/notes/[id]/remove-thread", action: "remove_note_from_thread" });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }
    return c.json({ success: true, message: "Note removed from thread", note: { id: note.id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/[id]/remove-thread", action: "remove_note_from_thread" });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});
route10.post("/api/notes/:id/process-scripture-references", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteId = c.req.param("id");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const { threadId, contentOverride } = await c.req.json();
    const result = await processScriptureReferences(noteId, auth.userId, threadId, contentOverride);
    return c.json(result);
  } catch (error) {
    console.error("Error processing scripture references:", error);
    return c.json({ error: error.message || "Error processing scripture references" }, 500);
  }
});
route10.get("/api/notes/:noteId/share", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteId = c.req.param("noteId");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const note = await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, shareTokenCreatedAt: Notes.shareTokenCreatedAt, userId: Notes.userId, noteType: Notes.noteType, contentEncrypted: Notes.contentEncrypted }).from(Notes).where(eq(Notes.id, noteId)).get();
    if (!note) return c.json({ error: "Note not found" }, 404);
    if (note.userId !== auth.userId) return c.json({ error: "You do not have permission to access this note" }, 403);
    let effectiveShareToken = note.shareToken;
    let effectiveShareTokenCreatedAt = note.shareTokenCreatedAt;
    const isScriptureNote = note.noteType === "scripture";
    const needsToken = isScriptureNote && !note.shareToken && !note.contentEncrypted;
    if (needsToken) {
      const now = nowISO();
      effectiveShareToken = generateShareToken();
      effectiveShareTokenCreatedAt = now;
      await db.update(Notes).set({ isPublic: true, shareToken: effectiveShareToken, shareTokenCreatedAt: now, updatedAt: now }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }
    const origin = new URL(c.req.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/shared/note/${effectiveShareToken}` : null;
    return c.json({
      isPublic: needsToken ? true : note.isPublic,
      shareToken: effectiveShareToken,
      shareUrl,
      shareTokenCreatedAt: effectiveShareTokenCreatedAt,
      noteType: note.noteType || "default",
      contentEncrypted: note.contentEncrypted || false
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/[noteId]/share", action: "get_share_status", noteId: c.req.param("noteId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route10.post("/api/notes/:noteId/share", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const noteId = c.req.param("noteId");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const { action } = await c.req.json();
    if (!action || !["enable", "disable", "refresh"].includes(action)) return c.json({ error: "Invalid action" }, 400);
    const note = await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, userId: Notes.userId, contentEncrypted: Notes.contentEncrypted }).from(Notes).where(eq(Notes.id, noteId)).get();
    if (!note) return c.json({ error: "Note not found" }, 404);
    if (note.userId !== auth.userId) return c.json({ error: "You do not have permission" }, 403);
    if (note.contentEncrypted && (action === "enable" || action === "refresh")) {
      return c.json({ error: "Remove the lock first to share it.", code: "ENCRYPTED_NOTE_CANNOT_SHARE" }, 400);
    }
    const now = nowISO();
    let newShareToken = null;
    let isPublic = note.isPublic;
    if (action === "enable") {
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Notes).set({ isPublic: true, shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    } else if (action === "disable") {
      newShareToken = null;
      isPublic = false;
      await db.update(Notes).set({ isPublic: false, shareToken: null, shareTokenCreatedAt: null, updatedAt: now }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    } else if (action === "refresh") {
      if (!note.isPublic) return c.json({ error: "Cannot refresh share link for a private note" }, 400);
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Notes).set({ shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }
    const origin = new URL(c.req.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/note/${newShareToken}` : null;
    return c.json({ success: true, isPublic, shareToken: newShareToken, shareUrl, shareTokenCreatedAt: action !== "disable" ? now : null });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/notes/[noteId]/share", action: "update_share_status", noteId: c.req.param("noteId") });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var notes_default = route10;

// server/routes/spaces.ts
import { Hono as Hono11 } from "hono";
init_db();
init_dates();

// server/utils/tier-limits.ts
init_db();
var MEMBERS_PER_SPACE_CAP = 150;
var TIER_LIMITS = {
  free: {
    ownedSharedSpaces: 3,
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity
  },
  unlimited: {
    ownedSharedSpaces: Infinity,
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity
  }
};
function getUserTier(auth) {
  return auth.has({ feature: "unlimited_notes" }) ? "unlimited" : "free";
}
function getTierLimits(tier) {
  return TIER_LIMITS[tier];
}
async function getTierForUserId(userId) {
  try {
    const { createClerkClient: createClerkClient3 } = await import("@clerk/backend");
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return "free";
    const clerkClient = createClerkClient3({ secretKey });
    const subscription = await clerkClient.billing.getUserBillingSubscription(userId);
    if (!subscription?.subscriptionItems?.length) return "free";
    for (const item of subscription.subscriptionItems) {
      const plan = item.plan;
      if (!plan?.features?.length) continue;
      const hasUnlimited = plan.features.some(
        (f) => f.slug === "unlimited_notes"
      );
      if (hasUnlimited) return "unlimited";
    }
    return "free";
  } catch {
    return "free";
  }
}
async function getSharedSpacesOwnedCount(userId) {
  const ownedSpaces = await db.select({ id: Spaces.id, shareToken: Spaces.shareToken }).from(Spaces).where(eq(Spaces.userId, userId)).all();
  let sharedCount = 0;
  for (const space of ownedSpaces) {
    const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
    if (hasShareLink) {
      sharedCount++;
      continue;
    }
    const memberRows = await db.select().from(Members).where(eq(Members.spaceId, space.id)).all();
    if (memberRows.length > 0) sharedCount++;
  }
  return sharedCount;
}
async function getSpaceMembershipCount(userId) {
  const memberships = await db.select().from(Members).where(eq(Members.userId, userId)).all();
  return memberships.length;
}
async function getSpaceMemberCount2(spaceId) {
  const members = await db.select().from(Members).where(eq(Members.spaceId, spaceId)).all();
  return members.length;
}
async function canCreateSharedSpace(userId, auth) {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  const currentCount = await getSharedSpacesOwnedCount(userId);
  if (currentCount >= limits.ownedSharedSpaces) {
    return {
      allowed: false,
      reason: tier === "free" ? `You've used all ${limits.ownedSharedSpaces} shared spaces. Upgrade for unlimited.` : "Unlimited tier shared spaces limit reached.",
      currentCount,
      limit: limits.ownedSharedSpaces
    };
  }
  return { allowed: true, currentCount, limit: limits.ownedSharedSpaces };
}
async function canOwnerAddOneMoreSharedSpace(ownerUserId, spaceId, ownerAuth) {
  const currentMemberCount = await getSpaceMemberCount2(spaceId);
  if (currentMemberCount > 0) return { allowed: true };
  const tier = ownerAuth ? getUserTier(ownerAuth) : await getTierForUserId(ownerUserId);
  const limits = getTierLimits(tier);
  const currentSharedCount = await getSharedSpacesOwnedCount(ownerUserId);
  const wouldBeSharedCount = currentSharedCount + 1;
  if (wouldBeSharedCount > limits.ownedSharedSpaces) {
    return {
      allowed: false,
      reason: tier === "free" ? `You've used all ${limits.ownedSharedSpaces} shared spaces. Upgrade for unlimited.` : "Unlimited tier shared spaces limit reached.",
      currentCount: currentSharedCount,
      limit: limits.ownedSharedSpaces
    };
  }
  return { allowed: true, currentCount: currentSharedCount, limit: limits.ownedSharedSpaces };
}
async function canAddMemberToSpace(spaceId, _spaceOwnerId, ownerAuth) {
  const tier = getUserTier(ownerAuth);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount2(spaceId);
  if (currentCount >= limits.membersPerSpace) {
    return { allowed: false, reason: "This space has reached its people limit.", currentCount, limit: limits.membersPerSpace };
  }
  return { allowed: true, currentCount, limit: limits.membersPerSpace };
}
async function canAddMemberToSpaceByOwnerId(spaceId, spaceOwnerId) {
  const tier = await getTierForUserId(spaceOwnerId);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount2(spaceId);
  if (currentCount >= limits.membersPerSpace) {
    return { allowed: false, reason: "This space has reached its people limit.", currentCount, limit: limits.membersPerSpace };
  }
  return { allowed: true, currentCount, limit: limits.membersPerSpace };
}
async function canJoinSpace(userId, auth) {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  if (limits.joinableSpaces === Infinity) return { allowed: true, limit: null };
  const currentCount = await getSpaceMembershipCount(userId);
  if (currentCount >= limits.joinableSpaces) {
    return { allowed: false, reason: `Free tier limited to ${limits.joinableSpaces} space memberships. Upgrade to join more.`, currentCount, limit: limits.joinableSpaces };
  }
  return { allowed: true, currentCount, limit: limits.joinableSpaces };
}
async function getUserLimitsInfo(userId, auth) {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  const [sharedSpacesOwned, spaceMemberships] = await Promise.all([
    getSharedSpacesOwnedCount(userId),
    getSpaceMembershipCount(userId)
  ]);
  return {
    tier,
    limits: {
      ownedSharedSpaces: { current: sharedSpacesOwned, limit: limits.ownedSharedSpaces, remaining: limits.ownedSharedSpaces - sharedSpacesOwned },
      membersPerSpace: { limit: limits.membersPerSpace },
      joinableSpaces: { current: spaceMemberships, limit: limits.joinableSpaces, remaining: limits.joinableSpaces === Infinity ? Infinity : limits.joinableSpaces - spaceMemberships }
    }
  };
}

// server/routes/spaces.ts
init_ids();
var route11 = new Hono11();
function parseItemIds(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed.split(",").filter((id) => id.trim());
    }
  }
  return trimmed.split(",").filter((id) => id.trim());
}
route11.post("/api/spaces/create", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/create", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const formData = await c.req.formData();
    const title = formData.get("title");
    const color = formData.get("color") || "paper";
    const isPublic = formData.get("isPublic") === "true";
    const selectedNoteIds = parseItemIds(formData.get("selectedNoteIds"));
    const selectedThreadIds = parseItemIds(formData.get("selectedThreadIds"));
    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    if (isPublic) {
      const canCreate = await canCreateSharedSpace(auth.userId, auth);
      if (!canCreate.allowed) {
        return c.json({
          error: canCreate.reason || "You've used all your shared spaces. Upgrade for unlimited.",
          code: "SHARED_SPACE_LIMIT_EXCEEDED",
          currentCount: canCreate.currentCount,
          limit: canCreate.limit,
          upgradeUrl: "/upgrade"
        }, 403);
      }
    }
    const backgroundGradient = getThreadGradientCSS(color);
    const now = nowISO();
    const newSpace = await db.insert(Spaces).values({
      id: generateSpaceId(),
      title: capitalizedTitle,
      description: null,
      color,
      backgroundGradient,
      userId: auth.userId,
      isPublic,
      isActive: true,
      order: 0,
      createdAt: now
    }).returning().get();
    for (const noteId of selectedNoteIds) {
      try {
        const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
        if (note) await db.update(Notes).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      } catch (error) {
        console.error(`Error updating note ${noteId}:`, error);
      }
    }
    for (const threadId of selectedThreadIds) {
      try {
        if (threadId === "thread_unorganized") continue;
        const thread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
        if (thread) await db.update(Threads).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
      } catch (error) {
        console.error(`Error updating thread ${threadId}:`, error);
      }
    }
    awardCreationBonusXP(auth.userId, "space").catch(() => {
    });
    return c.json({ success: "Space created!", space: newSpace, addedNotes: selectedNoteIds.length, addedThreads: selectedThreadIds.length });
  } catch (error) {
    console.error("Error creating space:", error);
    return c.json({ error: error.message || "Error creating space" }, 500);
  }
});
route11.delete("/api/spaces/delete", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.query("spaceId");
    if (!spaceId) return c.json({ error: "Space ID is required" }, 400);
    const space = await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).get();
    if (!space) return c.json({ error: "Space not found or access denied" }, 404);
    await db.delete(Members).where(eq(Members.spaceId, spaceId));
    await db.delete(SpaceInvitations).where(eq(SpaceInvitations.spaceId, spaceId));
    const spaceThreads = await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, auth.userId))).all();
    for (const t of spaceThreads) {
      await db.update(Threads).set({ spaceId: null }).where(eq(Threads.id, t.id));
    }
    const spaceNotes = await db.select({ id: Notes.id }).from(Notes).where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, auth.userId))).all();
    for (const n of spaceNotes) {
      await db.update(Notes).set({ spaceId: null }).where(eq(Notes.id, n.id));
    }
    await db.delete(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId)));
    return c.json({ success: "Space deleted!", spaceId });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/delete", action: "delete_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/items", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const allNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited,
      contentEncrypted: Notes.contentEncrypted
    }).from(Notes).where(eq(Notes.userId, auth.userId)).all();
    const resourceNoteIds = allNotes.filter((n) => n.noteType === "resource").map((n) => n.id);
    let resourceMetadataMap = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = Object.fromEntries(rm.map((m) => [m.noteId, m]));
      } catch {
      }
    }
    const notesWithMetadata = allNotes.map((note) => {
      const rm = note.noteType === "resource" ? resourceMetadataMap[note.id] : null;
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        resourceTitle: rm?.sourceTitle || null,
        resourceDescription: rm?.sourceDescription || null,
        resourceImage: rm?.sourceImage || null
      };
    });
    const allThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      color: Threads.color,
      spaceId: Threads.spaceId,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited
    }).from(Threads).where(and(eq(Threads.userId, auth.userId), ne(Threads.id, "thread_unorganized"))).all();
    const threadIds = allThreads.map((t) => t.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, auth.userId))).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    const threadsWithCounts = allThreads.map((t) => ({
      ...t,
      noteCount: noteCountsMap.get(t.id) || 0,
      lastUpdated: t.lastVisited || t.updatedAt || t.createdAt
    }));
    return c.json({ notes: notesWithMetadata, threads: threadsWithCounts });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/items", action: "get_space_items" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/update", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/update", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const formData = await c.req.formData();
    const title = formData.get("title");
    const color = formData.get("color");
    const isPublic = formData.get("isPublic") === "true";
    const space = await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).get();
    if (!space) return c.json({ error: "Space not found or access denied" }, 404);
    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    if (isPublic && !space.isPublic) {
      const canCreate = await canCreateSharedSpace(auth.userId, auth);
      if (!canCreate.allowed) {
        return c.json({ error: canCreate.reason, code: "SHARED_SPACE_LIMIT_EXCEEDED", currentCount: canCreate.currentCount, limit: canCreate.limit, upgradeUrl: "/upgrade" }, 403);
      }
    }
    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const backgroundGradient = getThreadGradientCSS(color);
    const updatedSpace = await db.update(Spaces).set({
      title: capitalizedTitle,
      color,
      backgroundGradient,
      isPublic,
      updatedAt: nowISO()
    }).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).returning().get();
    return c.json({ success: "Space updated!", space: updatedSpace });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/update", action: "update_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/:spaceId/notes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const result = await getNotesForSpace(spaceId, auth.userId, limit, offset);
    return c.json({ notes: result.notes, hasMore: result.hasMore, offset, limit });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/notes", action: "get_space_notes" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/:spaceId/items", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    let accessInfo;
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    if (accessInfo.role === "owner") {
      const [notesResult, threads] = await Promise.all([
        getNotesForSpace(spaceId, auth.userId),
        getThreadsForSpace(spaceId, auth.userId)
      ]);
      return c.json({ notes: notesResult.notes, threads });
    } else {
      const [notesResult, threads] = await Promise.all([
        getNotesForSpaceForMember(spaceId, accessInfo.space.userId),
        getThreadsForSpaceBySpaceId(spaceId)
      ]);
      return c.json({ notes: notesResult.notes, threads });
    }
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/items", action: "get_space_items" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/:spaceId/prefetch", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ownerSpaces = await getSpacesWithCounts(auth.userId);
    const ownerSpace = ownerSpaces.find((s) => s.id === spaceId);
    if (ownerSpace) {
      return c.json({
        id: ownerSpace.id,
        title: ownerSpace.title,
        color: ownerSpace.color,
        backgroundGradient: ownerSpace.backgroundGradient,
        totalItemCount: ownerSpace.totalItemCount,
        isPublic: ownerSpace.isPublic,
        ownerId: auth.userId
      }, 200, { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" });
    }
    const space = await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).get();
    if (!space) return c.json({ error: "Space not found" }, 404);
    const member = await db.select().from(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, auth.userId))).get();
    if (!member) return c.json({ error: "Access denied" }, 403);
    const noteCountResult = await db.select({ count: count() }).from(Notes).where(eq(Notes.spaceId, spaceId)).get();
    const threadCountResult = await db.select({ count: count() }).from(Threads).where(eq(Threads.spaceId, spaceId)).get();
    const totalItemCount = (noteCountResult?.count || 0) + (threadCountResult?.count || 0);
    return c.json({
      id: space.id,
      title: space.title,
      color: space.color,
      backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || "paper"),
      totalItemCount,
      isPublic: space.isPublic,
      ownerId: space.userId
    }, 200, { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" });
  } catch (error) {
    console.error("Error prefetching space:", error);
    return c.json({ error: "Failed to fetch space data" }, 500);
  }
});
route11.post("/api/spaces/:spaceId/add-note", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/add-note", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const { noteId } = await c.req.json();
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ error: "Note not found or access denied" }, 404);
    await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    return c.json({ success: true, message: "Note added to space" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/add-note", action: "add_note_to_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/add-thread", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/add-thread", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ error: "Thread ID is required" }, 400);
    if (threadId === "thread_unorganized") return c.json({ error: "Cannot add unorganized thread to a space" }, 400);
    const thread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!thread) return c.json({ error: "Thread not found or access denied" }, 404);
    await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    return c.json({ success: true, message: "Thread added to space" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/add-thread", action: "add_thread_to_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/add-items", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors = [];
    let updatedNotes = 0, updatedThreads = 0;
    for (const noteId of noteIds) {
      try {
        const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
        if (!note) {
          errors.push(`Note ${noteId} not found`);
          continue;
        }
        await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
        updatedNotes++;
      } catch (e) {
        errors.push(`Note ${noteId}: ${e.message}`);
      }
    }
    for (const threadId of threadIds) {
      try {
        if (threadId === "thread_unorganized") {
          errors.push("Cannot add unorganized thread");
          continue;
        }
        const thread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
        if (!thread) {
          errors.push(`Thread ${threadId} not found`);
          continue;
        }
        await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
        updatedThreads++;
      } catch (e) {
        errors.push(`Thread ${threadId}: ${e.message}`);
      }
    }
    return c.json({ success: true, updatedNotes, updatedThreads, errors: errors.length > 0 ? errors : void 0 });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/add-items", action: "add_items_to_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/remove-items", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    let accessInfo;
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors = [];
    let removedNotes = 0, removedThreads = 0;
    const isOwner = accessInfo.role === "owner";
    for (const noteId of noteIds) {
      try {
        const note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.spaceId, spaceId))).get();
        if (!note) {
          errors.push(`Note ${noteId} not found in space`);
          continue;
        }
        if (!isOwner && note.userId !== auth.userId) {
          errors.push(`Note ${noteId}: no permission`);
          continue;
        }
        await db.update(Notes).set({ spaceId: null }).where(eq(Notes.id, noteId));
        removedNotes++;
      } catch (e) {
        errors.push(`Note ${noteId}: ${e.message}`);
      }
    }
    for (const threadId of threadIds) {
      try {
        if (threadId === "thread_unorganized") {
          errors.push("Cannot remove unorganized thread");
          continue;
        }
        const thread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.spaceId, spaceId))).get();
        if (!thread) {
          errors.push(`Thread ${threadId} not found in space`);
          continue;
        }
        if (!isOwner && thread.userId !== auth.userId) {
          errors.push(`Thread ${threadId}: no permission`);
          continue;
        }
        await db.update(Threads).set({ spaceId: null }).where(eq(Threads.id, threadId));
        removedThreads++;
      } catch (e) {
        errors.push(`Thread ${threadId}: ${e.message}`);
      }
    }
    return c.json({ success: true, removedNotes, removedThreads, errors: errors.length > 0 ? errors : void 0 });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/remove-items", action: "remove_items_from_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/:spaceId/share-link", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const space = await db.select({ id: Spaces.id, isPublic: Spaces.isPublic, shareToken: Spaces.shareToken, userId: Spaces.userId }).from(Spaces).where(eq(Spaces.id, spaceId)).get();
    if (!space) return c.json({ error: "Space not found" }, 404);
    if (!space.isPublic) return c.json({ isPublic: false, shareToken: null, shareUrl: null });
    let effectiveShareToken = space.shareToken;
    if (!effectiveShareToken && space.userId === auth.userId) {
      const tierCheck = await canCreateSharedSpace(auth.userId, auth);
      if (!tierCheck.allowed) return c.json({ error: tierCheck.reason, code: "SHARED_SPACE_LIMIT_EXCEEDED" }, 403);
      effectiveShareToken = generateShareToken();
      await db.update(Spaces).set({ shareToken: effectiveShareToken, updatedAt: nowISO() }).where(eq(Spaces.id, spaceId));
    }
    const origin = new URL(c.req.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/spaces/join/${effectiveShareToken}` : null;
    return c.json({ isPublic: true, shareToken: effectiveShareToken, shareUrl });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/share-link", action: "get_share_link" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/share-link", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/share-link", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const space = await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).get();
    if (!space) return c.json({ error: "Space not found or access denied" }, 404);
    const { action } = await c.req.json();
    if (action !== "refresh") return c.json({ error: "Invalid action" }, 400);
    const newShareToken = generateShareToken();
    await db.update(Spaces).set({ shareToken: newShareToken, updatedAt: nowISO() }).where(eq(Spaces.id, spaceId));
    const origin = new URL(c.req.url).origin;
    return c.json({ success: true, shareToken: newShareToken, shareUrl: `${origin}/spaces/join/${newShareToken}` });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/share-link", action: "refresh_share_link" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/:spaceId/members", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    let accessInfo;
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const isOwner = accessInfo.role === "owner";
    const space = accessInfo.space;
    const members = await db.select().from(Members).where(eq(Members.spaceId, spaceId)).all();
    const memberUserIds = members.map((m) => m.userId);
    const allUserIds = [space.userId, ...memberUserIds];
    let userMetadataMap = {};
    if (allUserIds.length > 0) {
      const metadata = await db.select().from(UserMetadata).where(inArray(UserMetadata.userId, allUserIds)).all();
      userMetadataMap = Object.fromEntries(metadata.map((m) => [m.userId, m]));
    }
    const ownerMeta = userMetadataMap[space.userId] || {};
    const memberList = [
      {
        userId: space.userId,
        role: "owner",
        joinedAt: space.createdAt,
        firstName: ownerMeta.firstName || null,
        lastName: ownerMeta.lastName || null,
        email: ownerMeta.email || null,
        profileImageUrl: ownerMeta.profileImageUrl || null,
        userColor: ownerMeta.userColor || "paper"
      },
      ...members.map((m) => {
        const meta = userMetadataMap[m.userId] || {};
        return {
          userId: m.userId,
          role: "member",
          joinedAt: m.joinedAt || m.createdAt,
          firstName: meta.firstName || null,
          lastName: meta.lastName || null,
          email: meta.email || null,
          profileImageUrl: meta.profileImageUrl || null,
          userColor: meta.userColor || "paper"
        };
      })
    ];
    let pendingInvitations = [];
    if (isOwner) {
      const invitations = await db.select().from(SpaceInvitations).where(and(eq(SpaceInvitations.spaceId, spaceId), eq(SpaceInvitations.status, "pending"))).all();
      pendingInvitations = invitations.map((inv) => ({
        id: inv.id,
        email: inv.invitedEmail,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt
      }));
    }
    const tier = getUserTier(auth);
    const limits = getTierLimits(tier);
    return c.json({
      members: memberList,
      pendingInvitations: isOwner ? pendingInvitations : void 0,
      memberCount: memberList.length,
      isOwner,
      limits: isOwner ? {
        membersPerSpace: limits.membersPerSpace,
        ownedSharedSpaces: limits.ownedSharedSpaces
      } : void 0
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/members", action: "list_members" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/:spaceId/members/invite", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/members/invite", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    try {
      await requireSpaceAccess(spaceId, auth.userId, true);
    } catch (err) {
      if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
      throw err;
    }
    const { email, method = "link" } = await c.req.json();
    const memberCheck = await canAddMemberToSpace(spaceId, auth.userId, auth);
    if (!memberCheck.allowed) return c.json({ error: memberCheck.reason, code: "MEMBER_LIMIT_EXCEEDED" }, 403);
    const sharedCheck = await canOwnerAddOneMoreSharedSpace(auth.userId, spaceId, auth);
    if (!sharedCheck.allowed) return c.json({ error: sharedCheck.reason, code: "SHARED_SPACE_LIMIT_EXCEEDED" }, 403);
    if (method === "email" && email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return c.json({ error: "Invalid email address" }, 400);
    }
    const inviteToken = generateShareToken();
    const now = nowISO();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
    await db.insert(SpaceInvitations).values({
      id: `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId,
      invitedBy: auth.userId,
      invitedEmail: email || null,
      inviteToken,
      status: "pending",
      expiresAt,
      createdAt: now
    });
    const origin = new URL(c.req.url).origin;
    const inviteUrl = `${origin}/spaces/join/${inviteToken}`;
    return c.json({ success: true, inviteUrl, inviteToken, expiresAt });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/members/invite", action: "invite_member" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.delete("/api/spaces/:spaceId/members/:userId", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const spaceId = c.req.param("spaceId");
    const targetUserId = c.req.param("userId");
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/members/remove", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const space = await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).get();
    if (!space) return c.json({ error: "Space not found" }, 404);
    const isOwner = space.userId === auth.userId;
    const isSelf = auth.userId === targetUserId;
    if (targetUserId === space.userId) return c.json({ error: "Space owner cannot be removed. Transfer or delete the space instead." }, 400);
    if (!isOwner && !isSelf) return c.json({ error: "Only the space owner can remove other members" }, 403);
    const member = await db.select().from(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, targetUserId))).get();
    if (!member) return c.json({ error: "User is not a member of this space" }, 404);
    await db.delete(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, targetUserId)));
    return c.json({ success: true, message: isSelf ? "You have left the space" : "Member removed from space" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/[spaceId]/members/[userId]", action: "remove_member" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.post("/api/spaces/join/:token", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Token is required" }, 400);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/spaces/join", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const space = await db.select().from(Spaces).where(eq(Spaces.shareToken, token)).get();
    if (!space) return c.json({ error: "Invalid or expired invite link" }, 404);
    if (!space.isPublic) return c.json({ error: "This space is no longer accepting new members" }, 403);
    if (space.userId === auth.userId) return c.json({ error: "You are the owner of this space" }, 400);
    const existingMember = await db.select().from(Members).where(and(eq(Members.spaceId, space.id), eq(Members.userId, auth.userId))).get();
    if (existingMember) return c.json({ error: "You are already a member of this space" }, 400);
    const memberCheck = await canAddMemberToSpaceByOwnerId(space.id, space.userId);
    if (!memberCheck.allowed) return c.json({ error: memberCheck.reason, code: "MEMBER_LIMIT_EXCEEDED" }, 403);
    const sharedCheck = await canOwnerAddOneMoreSharedSpace(space.userId, space.id);
    if (!sharedCheck.allowed) return c.json({ error: sharedCheck.reason, code: "SHARED_SPACE_LIMIT_EXCEEDED" }, 403);
    const now = nowISO();
    await db.insert(Members).values({
      id: `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId: space.id,
      userId: auth.userId,
      role: "member",
      joinedAt: now,
      createdAt: now
    });
    return c.json({ success: true, spaceId: space.id, spaceName: space.title, redirectUrl: `/spaces/${space.id}` });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/spaces/join/[token]", action: "join_space" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
route11.get("/api/spaces/join-preview/:token", async (c) => {
  try {
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Token is required" }, 400);
    const space = await db.select().from(Spaces).where(eq(Spaces.shareToken, token)).get();
    if (!space) return c.json({ error: "Space not found or link expired" }, 404);
    if (!space.isPublic) return c.json({ error: "This space is no longer public" }, 403);
    const ownerMeta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, space.userId)).get();
    const ownerDisplayName = ownerMeta ? [ownerMeta.firstName, ownerMeta.lastName].filter(Boolean).join(" ") || "Anonymous" : "Anonymous";
    const memberCount = await getSpaceMemberCount2(space.id);
    const totalMembers = memberCount + 1;
    const threads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color }).from(Threads).where(eq(Threads.spaceId, space.id)).orderBy(desc(Threads.updatedAt)).limit(5).all();
    const threadIds = threads.map((t) => t.id);
    let noteCountsMap = /* @__PURE__ */ new Map();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() }).from(NoteThreads).where(inArray(NoteThreads.threadId, threadIds)).groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map((item) => [item.threadId, item.count]));
    }
    const threadPreviews = threads.map((t) => ({
      id: t.id,
      title: t.title,
      color: t.color,
      noteCount: noteCountsMap.get(t.id) || 0
    }));
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt
    }).from(Notes).where(and(eq(Notes.spaceId, space.id), eq(Notes.contentEncrypted, false))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt)
    ).limit(10).all();
    let isAlreadyMember = false;
    try {
      const auth = getAuth(c);
      if (auth.userId) {
        if (space.userId === auth.userId) isAlreadyMember = true;
        else {
          const member = await db.select().from(Members).where(and(eq(Members.spaceId, space.id), eq(Members.userId, auth.userId))).get();
          if (member) isAlreadyMember = true;
        }
      }
    } catch {
    }
    return c.json({
      space: {
        id: space.id,
        title: space.title,
        color: space.color,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || "paper"),
        description: space.description
      },
      owner: { displayName: ownerDisplayName, profileImageUrl: ownerMeta?.profileImageUrl || null },
      memberCount: totalMembers,
      threadPreviews,
      notePreviews: notes,
      isAlreadyMember
    });
  } catch (error) {
    console.error("Error fetching space preview:", error);
    return c.json({ error: "Failed to load space preview" }, 500);
  }
});
var spaces_default = route11;

// server/routes/user.ts
import { Hono as Hono12 } from "hono";
init_db();
init_dates();

// server/utils/user-cache.ts
init_db();
init_dates();

// server/utils/referral-code.ts
init_db();
var PREFIX_MAX_LEN = 6;
var SUFFIX_LEN = 5;
var FALLBACK_PREFIX = "USER";
function generateReferralCode(firstName, userId) {
  const prefix = (firstName ?? "").replace(/\W/g, "").toUpperCase().slice(0, PREFIX_MAX_LEN) || FALLBACK_PREFIX;
  const suffix = hashToBase36(userId).slice(0, SUFFIX_LEN);
  return `${prefix}-${suffix}`;
}
function hashToBase36(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = h * 31 + c >>> 0;
  }
  return h.toString(36).toUpperCase();
}
async function resolveRefToUserId(ref) {
  const trimmed = (ref ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("user_")) {
    const row2 = await db.select({ userId: UserMetadata.userId }).from(UserMetadata).where(eq(UserMetadata.userId, trimmed)).get();
    return row2 ? trimmed : null;
  }
  const row = await db.select({ userId: UserMetadata.userId }).from(UserMetadata).where(eq(UserMetadata.referralCode, trimmed)).get();
  return row?.userId ?? null;
}

// server/utils/user-cache.ts
async function getCachedUserData(userId) {
  try {
    const userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    const now = /* @__PURE__ */ new Date();
    const cacheAge = userMetadata?.clerkDataUpdatedAt ? now.getTime() - new Date(userMetadata.clerkDataUpdatedAt).getTime() : Infinity;
    const isCacheFresh = cacheAge < 15 * 60 * 1e3;
    const isExplicitlyStale = userMetadata?.clerkDataUpdatedAt && new Date(userMetadata.clerkDataUpdatedAt).getTime() < (/* @__PURE__ */ new Date("2023-01-01")).getTime();
    if (userMetadata && isCacheFresh && !isExplicitlyStale) {
      return {
        firstName: userMetadata.firstName || "",
        lastName: userMetadata.lastName || "",
        email: userMetadata.email || "",
        profileImageUrl: userMetadata.profileImageUrl || void 0,
        initials: generateInitials(userMetadata.firstName || "", userMetadata.lastName || ""),
        displayName: generateDisplayName(userMetadata.firstName || "", userMetadata.lastName || ""),
        userColor: userMetadata.userColor || "paper",
        createdAt: userMetadata.createdAt || void 0
      };
    }
    return await fetchAndCacheUserData(userId, userMetadata);
  } catch (error) {
    console.error("Error getting user data:", error);
    return {
      firstName: "",
      lastName: "",
      email: "",
      initials: "U",
      displayName: "User",
      userColor: "paper",
      createdAt: void 0
    };
  }
}
async function fetchAndCacheUserData(userId, existingMetadata) {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.error("CRITICAL: Clerk secret key not found in environment");
    throw new Error("Clerk secret key not found");
  }
  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      "Authorization": `Bearer ${clerkSecretKey}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    console.error("Clerk API failed:", {
      status: response.status,
      statusText: response.statusText,
      isProduction: process.env.NODE_ENV === "production"
    });
    if (process.env.NODE_ENV === "production" && existingMetadata) {
      return {
        firstName: existingMetadata.firstName || "",
        lastName: existingMetadata.lastName || "",
        email: existingMetadata.email || "",
        profileImageUrl: existingMetadata.profileImageUrl,
        initials: generateInitials(existingMetadata.firstName || "", existingMetadata.lastName || ""),
        displayName: generateDisplayName(existingMetadata.firstName || "", existingMetadata.lastName || ""),
        userColor: existingMetadata.userColor || "paper",
        createdAt: existingMetadata.createdAt
      };
    }
    throw new Error(`Clerk API error: ${response.status}`);
  }
  const userData = await response.json();
  const firstName = userData?.first_name || userData?.firstName || "";
  const lastName = userData?.last_name || userData?.lastName || "";
  const email = userData?.email_addresses?.[0]?.email_address || userData?.email || "";
  const profileImageUrl = userData?.profile_image_url || userData?.image_url;
  const userColor = userData?.public_metadata?.userColor || "paper";
  let userCreatedAt;
  if (existingMetadata) {
    userCreatedAt = existingMetadata.createdAt;
    const setPayload = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      userColor,
      churchName: existingMetadata.churchName ?? null,
      churchCity: existingMetadata.churchCity ?? null,
      churchState: existingMetadata.churchState ?? null,
      clerkDataUpdatedAt: nowISO(),
      updatedAt: nowISO()
    };
    if (existingMetadata.referralCode == null) {
      setPayload.referralCode = generateReferralCode(firstName || null, userId);
    }
    await db.update(UserMetadata).set(setPayload).where(eq(UserMetadata.userId, userId));
  } else {
    userCreatedAt = nowISO();
    await db.insert(UserMetadata).values({
      id: `user_metadata_${userId}`,
      userId,
      firstName,
      lastName,
      email,
      profileImageUrl,
      userColor,
      highestSimpleNoteId: 0,
      currentSeason: getCurrentSeason(),
      churchName: null,
      churchCity: null,
      churchState: null,
      referralCode: generateReferralCode(firstName || null, userId),
      createdAt: userCreatedAt,
      updatedAt: nowISO(),
      clerkDataUpdatedAt: nowISO()
    });
    try {
      const allUserInboxItems = await db.select().from(InboxItems).where(
        and(
          eq(InboxItems.targetAudience, "all_users"),
          eq(InboxItems.isActive, true)
        )
      );
      for (const inboxItem of allUserInboxItems) {
        if (!inboxItem.webflowItemId) continue;
        const existing = await db.select().from(UserInboxItems).where(
          and(
            eq(UserInboxItems.userId, userId),
            eq(UserInboxItems.inboxItemId, inboxItem.id)
          )
        ).get();
        if (!existing) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${userId}_${inboxItem.id}_${Date.now()}`,
            userId,
            inboxItemId: inboxItem.id,
            status: "inbox",
            createdAt: nowISO()
          });
        }
      }
    } catch (error) {
      console.error("Error assigning inbox items to new user:", error);
    }
    try {
      const { generateThreadId: generateThreadId2, generateNoteId: generateNoteId2 } = await Promise.resolve().then(() => (init_ids(), ids_exports));
      const { ensureUnorganizedThread: ensureUnorganizedThread2 } = await Promise.resolve().then(() => (init_unorganized_thread(), unorganized_thread_exports));
      const { loadOnboardingNotes: loadOnboardingNotes2 } = await Promise.resolve().then(() => (init_load_onboarding_notes(), load_onboarding_notes_exports));
      await ensureUnorganizedThread2(userId);
      const onboardingNotes = loadOnboardingNotes2();
      if (onboardingNotes.length > 0) {
        const onboardingThreadId = `thread_onboarding_${userId}`;
        const capitalizedThreadTitle = "Welcome to Harvous";
        const ts = nowISO();
        await db.insert(Threads).values({
          id: onboardingThreadId,
          title: capitalizedThreadTitle,
          subtitle: `${onboardingNotes.length} notes to get you started`,
          color: "blue",
          spaceId: null,
          userId,
          isPublic: false,
          isPinned: false,
          createdAt: ts,
          updatedAt: ts,
          lastVisited: ts
        });
        let currentSimpleNoteId = 1;
        for (const noteData of onboardingNotes) {
          const noteId = generateNoteId2();
          const capitalizedNoteTitle = noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1);
          await db.insert(Notes).values({
            id: noteId,
            title: capitalizedNoteTitle,
            content: noteData.content,
            threadId: onboardingThreadId,
            spaceId: null,
            simpleNoteId: currentSimpleNoteId,
            userId,
            isPublic: false,
            addedBy: "system",
            createdAt: ts,
            lastVisited: ts
          });
          const junctionId = `note-thread-${noteId}-${Date.now()}`;
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId,
            threadId: onboardingThreadId,
            createdAt: nowISO()
          });
          currentSimpleNoteId++;
        }
        await db.update(UserMetadata).set({
          highestSimpleNoteId: currentSimpleNoteId - 1,
          updatedAt: nowISO()
        }).where(eq(UserMetadata.userId, userId));
        console.log(`Created onboarding thread with ${onboardingNotes.length} notes for user ${userId}`);
      }
    } catch (error) {
      console.error("Error creating onboarding thread:", error);
    }
  }
  return {
    firstName,
    lastName,
    email,
    profileImageUrl,
    initials: generateInitials(firstName, lastName),
    displayName: generateDisplayName(firstName, lastName),
    userColor,
    createdAt: userCreatedAt
  };
}
function generateInitials(firstName, lastName) {
  return `${firstName.charAt(0) || ""}${lastName.charAt(0) || ""}`.toUpperCase() || "U";
}
function generateDisplayName(firstName, lastName) {
  return `${firstName} ${lastName.charAt(0)}`.trim() || "User";
}
async function invalidateUserCache(userId) {
  try {
    await db.update(UserMetadata).set({
      clerkDataUpdatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    }).where(eq(UserMetadata.userId, userId));
  } catch (error) {
    console.error("Error invalidating user cache:", error);
    throw error;
  }
}

// server/utils/session-tracker.ts
init_db();
var SESSION_TIMEOUT_MS = 5 * 60 * 1e3;
var MIN_SESSION_DURATION_MS = 5 * 60 * 1e3;
var MIN_ACTIVITY_COUNT = 2;
function getSessionDuration(session) {
  return session.lastActivityTime.getTime() - session.startTime.getTime();
}
function getUniqueActivityTypes(session) {
  return [...new Set(session.activities.map((a) => a.actionType))];
}
function calculateSessionXP(session) {
  const duration = getSessionDuration(session);
  if (duration < MIN_SESSION_DURATION_MS) return 0;
  if (getUniqueActivityTypes(session).length < MIN_ACTIVITY_COUNT) return 0;
  let xp = 15;
  const notesOpened = session.activities.filter((a) => a.actionType === "note_opened").length;
  const threadsOpened = session.activities.filter((a) => a.actionType === "thread_opened").length;
  const spacesOpened = session.activities.filter((a) => a.actionType === "space_opened").length;
  const notesEdited = session.activities.filter((a) => a.actionType === "note_edited").length;
  const contentCreated = session.activities.filter((a) => a.actionType === "content_created").length;
  if (notesOpened >= 3) xp += 5;
  if (threadsOpened >= 2) xp += 3;
  if (spacesOpened >= 1) xp += 2;
  if (notesEdited >= 1) xp += 5;
  if (contentCreated >= 1) xp += 10;
  return Math.min(xp, 40);
}

// src/utils/lock-pin-server.ts
import crypto2 from "node:crypto";
var PBKDF2_ITERATIONS = 1e5;
var SALT_BYTES = 32;
var HASH_BYTES = 32;
var PIN_REGEX = /^\d{4}$/;
function normalizePin(pin) {
  return String(pin ?? "").trim();
}
function validatePinFormat(pin) {
  return PIN_REGEX.test(normalizePin(pin));
}
function hashPin(pin, salt) {
  const normalized = normalizePin(pin);
  return crypto2.pbkdf2Sync(
    normalized,
    salt,
    PBKDF2_ITERATIONS,
    HASH_BYTES,
    "sha256"
  );
}
function hashPinNew(pin) {
  const normalized = normalizePin(pin);
  if (!PIN_REGEX.test(normalized)) {
    throw new Error("Invalid PIN: must be exactly 4 digits");
  }
  const salt = crypto2.randomBytes(SALT_BYTES);
  const hash = hashPin(normalized, salt);
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64")
  };
}
function verifyPin(pin, saltBase64, hashBase64) {
  const normalized = normalizePin(pin);
  if (!PIN_REGEX.test(normalized)) return false;
  const salt = Buffer.from(saltBase64, "base64");
  const expectedHash = Buffer.from(hashBase64, "base64");
  const actualHash = hashPin(normalized, salt);
  if (expectedHash.length !== actualHash.length) return false;
  try {
    return crypto2.timingSafeEqual(expectedHash, actualHash);
  } catch {
    return false;
  }
}

// src/utils/html-to-markdown.ts
import TurndownService from "turndown";
var turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});
function htmlToMarkdown(html) {
  if (!html || html.trim() === "") {
    return "";
  }
  try {
    let markdown = turndownService.turndown(html);
    markdown = markdown.replace(/\n{3,}/g, "\n\n");
    return markdown.trim();
  } catch (error) {
    console.error("Error converting HTML to Markdown:", error);
    return html.replace(/<[^>]*>/g, "").trim();
  }
}
function htmlToPlainText(html) {
  if (!html || html.trim() === "") {
    return "";
  }
  try {
    let text2 = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
    return text2;
  } catch (error) {
    console.error("Error converting HTML to plain text:", error);
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

// server/routes/user.ts
init_ids();

// src/utils/csv-parser.ts
function parseCSV(csvContent) {
  const notes = [];
  const lines = [];
  let currentLine = "";
  let inQuotes = false;
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === "\n" && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  if (lines.length < 2) {
    return notes;
  }
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    try {
      const columns = parseCSVRow(row);
      if (columns.length < 4) {
        console.warn(`Skipping invalid CSV row ${i + 1}: insufficient columns`);
        continue;
      }
      let threadTitle;
      let threadColor = null;
      let noteTitle;
      let content;
      let createdDate;
      let tagsString;
      if (columns.length >= 6) {
        threadTitle = columns[0] || "";
        threadColor = columns[1] || null;
        noteTitle = columns[2] || "";
        content = columns[3] || "";
        createdDate = columns[4] || "";
        tagsString = columns[5] || "";
      } else {
        threadTitle = columns[0] || "";
        noteTitle = columns[1] || "";
        content = columns[2] || "";
        createdDate = columns[3] || "";
        tagsString = columns[4] || "";
      }
      const tags = tagsString.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      notes.push({
        threadTitle: threadTitle.trim(),
        threadColor: threadColor ? threadColor.trim() : null,
        noteTitle: noteTitle.trim(),
        content: content.trim(),
        createdDate: createdDate.trim(),
        tags
      });
    } catch (error) {
      console.error(`Error parsing CSV row ${i + 1}:`, error);
    }
  }
  return notes;
}
function parseCSVRow(row) {
  const columns = [];
  let currentColumn = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentColumn += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      columns.push(currentColumn);
      currentColumn = "";
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn);
  return columns;
}

// src/utils/markdown-import-parser.ts
function parseMarkdownExport(markdownContent) {
  const notes = [];
  const sections = markdownContent.split(/\n---\n/);
  for (const section of sections) {
    if (!section.trim()) continue;
    try {
      const note = parseMarkdownNoteSection(section);
      if (note) {
        notes.push(note);
      }
    } catch (error) {
      console.error("Error parsing markdown note section:", error);
    }
  }
  return notes;
}
function parseMarkdownNoteSection(section) {
  const lines = section.split("\n");
  let metadataStartIndex = -1;
  let metadataEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (metadataStartIndex === -1) {
        metadataStartIndex = i;
      } else {
        metadataEndIndex = i;
        break;
      }
    }
  }
  let title = "";
  let titleEndIndex = 0;
  for (let i = 0; i < (metadataStartIndex !== -1 ? metadataStartIndex : lines.length); i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) {
      title = line.substring(2).trim();
      titleEndIndex = i;
      break;
    }
  }
  const contentStartIndex = title ? titleEndIndex + 1 : 0;
  const contentEndIndex = metadataStartIndex !== -1 ? metadataStartIndex : lines.length;
  const contentLines = lines.slice(contentStartIndex, contentEndIndex);
  const content = contentLines.join("\n").trim();
  let createdDate = null;
  let updatedDate = null;
  let threadName = null;
  let threadColor = null;
  const tags = [];
  let scriptureReference = null;
  let scriptureTranslation = null;
  if (metadataStartIndex !== -1 && metadataEndIndex !== -1) {
    const metadataLines = lines.slice(metadataStartIndex + 1, metadataEndIndex);
    for (const line of metadataLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("**Created:**")) {
        createdDate = trimmed.replace("**Created:**", "").trim();
      }
      if (trimmed.startsWith("**Updated:**")) {
        updatedDate = trimmed.replace("**Updated:**", "").trim();
      }
      if (trimmed.startsWith("**Thread:**")) {
        threadName = trimmed.replace("**Thread:**", "").trim();
      }
      if (trimmed.startsWith("**Thread Color:**")) {
        threadColor = trimmed.replace("**Thread Color:**", "").trim();
      }
      if (trimmed.startsWith("**Tags:**")) {
        const tagsString = trimmed.replace("**Tags:**", "").trim();
        tags.push(...tagsString.split(",").map((t) => t.trim()).filter((t) => t.length > 0));
      }
      if (trimmed.startsWith("**Scripture Reference:**")) {
        const scriptureString = trimmed.replace("**Scripture Reference:**", "").trim();
        const match = scriptureString.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          scriptureReference = match[1].trim();
          scriptureTranslation = match[2].trim();
        } else {
          scriptureReference = scriptureString;
          scriptureTranslation = "NET";
        }
      }
    }
  }
  if (!content && !title) {
    return null;
  }
  return {
    title: title || "Untitled",
    content,
    createdDate,
    updatedDate,
    threadName,
    threadColor,
    tags,
    scriptureReference,
    scriptureTranslation
  };
}

// server/routes/user.ts
init_markdown_to_html();
init_unorganized_thread();
var app = new Hono12();
app.get("/api/user/achievements", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const [seasonalXP, lifetimeXP, milestoneIds, allSeasons] = await Promise.all([
      getSeasonalXP(auth.userId),
      getLifetimeXP(auth.userId),
      checkLifetimeMilestones(auth.userId),
      getAllSeasonalXP(auth.userId)
    ]);
    const currentSeason = getCurrentSeason();
    const pastSeasons = allSeasons.filter((s) => s.season !== currentSeason);
    const milestoneDefinitions = [
      { id: "first_hundred", name: "First Steps", description: "Earn 100 lifetime XP", xp: 100 },
      { id: "five_hundred", name: "Growing Strong", description: "Earn 500 lifetime XP", xp: 500 },
      { id: "thousand", name: "Thousand Club", description: "Earn 1,000 lifetime XP", xp: 1e3 },
      { id: "five_thousand", name: "Five Thousand Club", description: "Earn 5,000 lifetime XP", xp: 5e3 },
      { id: "ten_thousand", name: "Ten Thousand Club", description: "Earn 10,000 lifetime XP", xp: 1e4 },
      { id: "twenty_five_thousand", name: "Twenty-Five Thousand Club", description: "Earn 25,000 lifetime XP", xp: 25e3 },
      { id: "fifty_thousand", name: "Fifty Thousand Club", description: "Earn 50,000 lifetime XP", xp: 5e4 }
    ];
    const milestones = milestoneDefinitions.map((m) => ({ ...m, achieved: milestoneIds.includes(m.id) }));
    return c.json({ seasonalXP, lifetimeXP, seasonName: getSeasonDisplayName(), milestones, allSeasons: pastSeasons });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/achievements", action: "get_achievements" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/check-monthly-attendance", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const awarded = await awardMonthlyAttendanceXP(auth.userId);
    return c.json({ success: true, awardedXP: awarded, xpAmount: awarded ? 25 : 0 });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/check-monthly-attendance", action: "check_monthly_attendance" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.delete("/api/user/clear-data", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, auth.userId)).all();
    const noteIds = userNotes.map((n) => n.id);
    if (noteIds.length > 0) {
      for (const noteId of noteIds) {
        await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
      }
    }
    await db.delete(Notes).where(eq(Notes.userId, auth.userId));
    await db.delete(Threads).where(eq(Threads.userId, auth.userId));
    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, auth.userId)).all();
    for (const space of userSpaces) {
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
    await db.delete(Spaces).where(eq(Spaces.userId, auth.userId));
    await db.delete(Tags).where(eq(Tags.userId, auth.userId));
    return c.json({ success: true, message: "All data cleared" });
  } catch (error) {
    console.error("Clear data error:", error);
    return c.json({ error: error.message || "Failed to clear data" }, 500);
  }
});
app.delete("/api/user/delete-account", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, auth.userId)).all();
    const noteIds = userNotes.map((n) => n.id);
    if (noteIds.length > 0) {
      for (const noteId of noteIds) {
        await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
      }
    }
    await db.delete(Notes).where(eq(Notes.userId, auth.userId));
    await db.delete(Threads).where(eq(Threads.userId, auth.userId));
    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, auth.userId)).all();
    for (const space of userSpaces) {
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
    await db.delete(Spaces).where(eq(Spaces.userId, auth.userId));
    await db.delete(Tags).where(eq(Tags.userId, auth.userId));
    await db.delete(UserXP).where(eq(UserXP.userId, auth.userId));
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, auth.userId));
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const resp = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" }
        });
        if (!resp.ok) {
          console.error("Clerk API error during user deletion:", resp.status);
        }
      }
    } catch (clerkError) {
      console.error("Error deleting Clerk user:", clerkError.message);
    }
    return c.json({ success: true, message: "Account and all data deleted" });
  } catch (error) {
    console.error("Delete account error:", error);
    return c.json({ error: error.message || "Failed to delete account" }, 500);
  }
});
app.get("/api/user/export", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const format = c.req.query("format") || "markdown";
    const allNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt
    }).from(Notes).where(eq(Notes.userId, auth.userId)).orderBy(desc(Notes.createdAt));
    const allThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt
    }).from(Threads).where(eq(Threads.userId, auth.userId));
    const threadMap = new Map(allThreads.map((t) => [t.id, t]));
    const allNoteThreadsRows = await db.select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId }).from(NoteThreads).all();
    const noteThreadMap = /* @__PURE__ */ new Map();
    allNoteThreadsRows.forEach((nt) => {
      if (!noteThreadMap.has(nt.noteId)) noteThreadMap.set(nt.noteId, []);
      noteThreadMap.get(nt.noteId).push(nt.threadId);
    });
    const noteTagsMap = /* @__PURE__ */ new Map();
    if (allNotes.length > 0) {
      const allNoteTags = await db.select({
        noteId: NoteTags.noteId,
        tagName: Tags.name,
        tagCategory: Tags.category
      }).from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id)).where(eq(Tags.userId, auth.userId)).all();
      allNoteTags.forEach((tag) => {
        if (!noteTagsMap.has(tag.noteId)) noteTagsMap.set(tag.noteId, []);
        noteTagsMap.get(tag.noteId).push({ name: tag.tagName, category: tag.tagCategory || void 0 });
      });
    }
    const scriptureMap = /* @__PURE__ */ new Map();
    const scriptureNotes = allNotes.filter((n) => n.noteType === "scripture");
    for (const sn of scriptureNotes) {
      try {
        const meta = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, sn.id)).get();
        if (meta) scriptureMap.set(sn.id, meta);
      } catch (_) {
      }
    }
    let content = "";
    let contentType = "text/plain";
    let fileExtension = "txt";
    if (format === "csv-threads") {
      const rows = [["Thread Title", "Thread Color", "Note Title", "Note Content", "Created Date", "Tags"]];
      const escapeCSV = (str) => str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      for (const note of allNotes) {
        const noteThreadIds = noteThreadMap.get(note.id) || [];
        const primaryThreadId = noteThreadIds[0] || note.threadId;
        const thread = threadMap.get(primaryThreadId);
        const tags = noteTagsMap.get(note.id) || [];
        const plainContent = htmlToPlainText(note.content || "");
        rows.push([
          escapeCSV(thread?.title || "Unorganized"),
          escapeCSV(thread?.color || ""),
          escapeCSV(note.title || "Untitled"),
          escapeCSV(plainContent),
          escapeCSV(note.createdAt || ""),
          escapeCSV(tags.map((t) => t.name).join(", "))
        ]);
      }
      content = rows.map((row) => row.join(",")).join("\n");
      contentType = "text/csv";
      fileExtension = "csv";
    } else if (format === "markdown" || format === "text") {
      const lines = [];
      for (const note of allNotes) {
        const noteThreadIds = noteThreadMap.get(note.id) || [];
        const primaryThreadId = noteThreadIds[0] || note.threadId;
        const thread = threadMap.get(primaryThreadId);
        const tags = noteTagsMap.get(note.id) || [];
        const scripture = scriptureMap.get(note.id);
        if (note.title) {
          lines.push(`# ${note.title}`, "");
        }
        lines.push(htmlToMarkdown(note.content || ""), "");
        lines.push("---");
        lines.push(`**Created:** ${note.createdAt ? new Date(note.createdAt).toLocaleDateString() : "Unknown"}`);
        if (note.updatedAt) lines.push(`**Updated:** ${new Date(note.updatedAt).toLocaleDateString()}`);
        if (thread) {
          lines.push(`**Thread:** ${thread.title}`);
          if (thread.color) lines.push(`**Thread Color:** ${thread.color}`);
        }
        if (tags.length > 0) lines.push(`**Tags:** ${tags.map((t) => t.name).join(", ")}`);
        if (scripture) lines.push(`**Scripture Reference:** ${scripture.reference} (${scripture.translation})`);
        lines.push("---", "", "");
      }
      content = lines.join("\n");
      contentType = "text/markdown";
      fileExtension = "md";
    } else {
      return c.json({ error: `Unsupported format: ${format}` }, 400);
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const filename = `harvous-export-${timestamp}.${fileExtension}`;
    return new Response(content, {
      status: 200,
      headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` }
    });
  } catch (error) {
    console.error("Export error:", error);
    return c.json({ error: error.message || "Failed to export data" }, 500);
  }
});
app.post("/api/user/session", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { activities, startTime, lastActivityTime } = body;
    if (!activities || !Array.isArray(activities)) {
      return c.json({ error: "Invalid session data" }, 400);
    }
    const sessionData = {
      userId: auth.userId,
      startTime: new Date(startTime),
      activities: activities.map((a) => ({
        actionType: a.actionType,
        timestamp: new Date(a.timestamp),
        relatedId: a.relatedId || void 0
      })),
      lastActivityTime: new Date(lastActivityTime)
    };
    const sessionXP = calculateSessionXP(sessionData);
    if (sessionXP === 0) {
      return c.json({ success: true, awardedXP: 0, message: "Session did not meet minimum requirements" });
    }
    const awarded = await awardSessionXP(auth.userId, sessionXP);
    return c.json({ success: true, awardedXP: awarded ? sessionXP : 0, message: awarded ? "Session XP awarded" : "Daily session cap reached" });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/session", action: "end_session" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/update-church", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/update-church", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const body = await c.req.json();
    const { churchName, churchCity, churchState } = body;
    const normalizedChurchName = typeof churchName === "string" ? churchName.trim() || null : churchName ?? null;
    const normalizedChurchCity = typeof churchCity === "string" ? churchCity.trim() || null : churchCity ?? null;
    const normalizedChurchState = typeof churchState === "string" ? churchState.trim() || null : churchState ?? null;
    const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1);
    if (existingRecord.length > 0) {
      const existing = existingRecord[0];
      const isFirstTimeAddingChurch = !existing.churchName && !existing.churchCity && !existing.churchState && (normalizedChurchName || normalizedChurchCity || normalizedChurchState);
      await db.update(UserMetadata).set({
        churchName: normalizedChurchName,
        churchCity: normalizedChurchCity,
        churchState: normalizedChurchState,
        churchAddedAt: isFirstTimeAddingChurch ? nowISO() : existing.churchAddedAt,
        updatedAt: nowISO()
      }).where(eq(UserMetadata.userId, auth.userId));
      if (isFirstTimeAddingChurch) {
        await awardChurchAddedXP(auth.userId);
      }
    } else {
      const hasChurchData = normalizedChurchName || normalizedChurchCity || normalizedChurchState;
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        churchName: normalizedChurchName,
        churchCity: normalizedChurchCity,
        churchState: normalizedChurchState,
        churchAddedAt: hasChurchData ? nowISO() : null,
        highestSimpleNoteId: 0,
        userColor: "paper",
        createdAt: nowISO(),
        updatedAt: nowISO()
      });
      if (hasChurchData) await awardChurchAddedXP(auth.userId);
    }
    return c.json({
      success: true,
      message: "Church information updated",
      church: { churchName: normalizedChurchName, churchCity: normalizedChurchCity, churchState: normalizedChurchState }
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/update-church", action: "update_church_info" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/update-credentials", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { newEmail, currentPassword, newPassword } = body;
    if (!newEmail && !newPassword) return c.json({ error: "At least one field must be provided" }, 400);
    if (newPassword && newPassword.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return c.json({ error: "Server configuration error" }, 500);
    const updateData = {};
    if (newEmail) updateData.email_address = newEmail;
    if (newPassword) {
      if (!currentPassword) return c.json({ error: "Current password is required to change password" }, 400);
      updateData.password = newPassword;
    }
    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(updateData)
    });
    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      let errorMessage = "Failed to update credentials";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors?.[0]) {
          const code = errorData.errors[0].code;
          const codeMap = {
            form_password_incorrect: "Current password is incorrect",
            form_password_pwned: "This password has been found in a data breach",
            form_password_too_common: "This password is too common",
            form_email_address_invalid: "Please enter a valid email address",
            form_email_address_already_exists: "This email address is already in use"
          };
          errorMessage = codeMap[code] || errorData.errors[0].longMessage || errorMessage;
        }
      } catch (_) {
      }
      return c.json({ error: errorMessage }, 400);
    }
    return c.json({ success: true, message: "Credentials updated" });
  } catch (error) {
    console.error("Error updating credentials:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
app.post("/api/user/update-profile", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/update-profile", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const body = await c.req.json();
    const { firstName, lastName, color } = body;
    const fnv = validateName(firstName, "First name", true);
    if (!fnv.isValid) return c.json({ error: fnv.error, code: fnv.code }, 400);
    const lnv = validateName(lastName, "Last name", true);
    if (!lnv.isValid) return c.json({ error: lnv.error, code: lnv.code }, 400);
    const cv = validateColor(color);
    if (!cv.isValid) return c.json({ error: cv.error, code: cv.code }, 400);
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return c.json({ error: "Server configuration error" }, 500);
    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, public_metadata: { userColor: color } })
    });
    if (!clerkResponse.ok) {
      return c.json({ error: "Failed to update profile in Clerk" }, 500);
    }
    try {
      await invalidateUserCache(auth.userId);
    } catch (_) {
    }
    try {
      const existingMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
      await db.update(UserMetadata).set({
        firstName,
        lastName,
        userColor: color,
        churchName: existingMetadata?.churchName ?? null,
        churchCity: existingMetadata?.churchCity ?? null,
        churchState: existingMetadata?.churchState ?? null,
        updatedAt: nowISO()
      }).where(eq(UserMetadata.userId, auth.userId));
    } catch (_) {
    }
    return c.json({
      success: true,
      message: "Profile updated",
      user: {
        firstName,
        lastName,
        color,
        initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
        displayName: `${firstName} ${lastName.charAt(0)}`.trim()
      }
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/update-profile", action: "update_profile" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/xp", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const shouldBackfill = c.req.query("backfill") === "true";
    const season = c.req.query("season");
    if (shouldBackfill) await backfillUserXP(auth.userId);
    const [seasonalXP, lifetimeXP, breakdown] = await Promise.all([
      getSeasonalXP(auth.userId, season || void 0),
      getLifetimeXP(auth.userId),
      getXPBreakdown(auth.userId)
    ]);
    return c.json({
      seasonalXP,
      lifetimeXP,
      totalXP: lifetimeXP,
      season: season || getCurrentSeason(),
      seasonName: getSeasonDisplayName(season || void 0),
      breakdown,
      backfilled: shouldBackfill
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/xp", action: "get_user_xp" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/get-profile", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const userData = await getCachedUserData(auth.userId);
    let churchData = { churchName: null, churchCity: null, churchState: null };
    try {
      const um = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
      if (um) churchData = { churchName: um.churchName ?? null, churchCity: um.churchCity ?? null, churchState: um.churchState ?? null };
    } catch (_) {
    }
    let hasLockPinSet = false;
    try {
      const lockMeta = await db.select({ lockPinHash: UserMetadata.lockPinHash }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
      hasLockPinSet = !!lockMeta?.lockPinHash;
    } catch (_) {
    }
    let emailVerified = false;
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
          headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" }
        });
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          emailVerified = clerkUser.email_addresses?.[0]?.verification?.status === "verified";
        }
      }
    } catch (_) {
    }
    return c.json({
      firstName: userData.firstName,
      lastName: userData.lastName,
      userColor: userData.userColor,
      email: userData.email,
      emailVerified,
      churchName: churchData.churchName,
      churchCity: churchData.churchCity,
      churchState: churchData.churchState,
      hasLockPinSet
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/get-profile", action: "get_user_profile" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/locked-notes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const includeContent = c.req.query("content") === "true";
    const lockedOnly = await db.select(includeContent ? { id: Notes.id, content: Notes.content } : { id: Notes.id }).from(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.contentEncrypted, true))).all();
    const result = includeContent ? lockedOnly.map((n) => ({ id: n.id, content: n.content })) : lockedOnly.map((n) => ({ id: n.id }));
    return c.json({ notes: result });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/locked-notes", action: "get_locked_notes" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/verify-lock-pin", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { pin } = body;
    if (!pin || !validatePinFormat(pin)) return c.json({ error: "PIN must be exactly 4 digits", code: "INVALID_PIN" }, 400);
    const existing = await db.select({ lockPinSalt: UserMetadata.lockPinSalt, lockPinHash: UserMetadata.lockPinHash }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!existing?.lockPinSalt || !existing?.lockPinHash) return c.json({ error: "No lock PIN set", code: "NO_LOCK_PIN" }, 400);
    const valid = verifyPin(pin, existing.lockPinSalt, existing.lockPinHash);
    if (!valid) return c.json({ error: "Incorrect PIN", code: "INCORRECT_PIN" }, 401);
    return c.json({ success: true, valid: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/verify-lock-pin", action: "verify_lock_pin" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/set-lock-pin", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/set-lock-pin", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const body = await c.req.json();
    const { pin, currentPin, newPin } = body;
    const isChange = typeof currentPin === "string" && typeof newPin === "string";
    const pinToSet = isChange ? newPin : pin;
    if (!pinToSet || !validatePinFormat(pinToSet)) return c.json({ error: "PIN must be exactly 4 digits", code: "INVALID_PIN" }, 400);
    const existing = await db.select({ lockPinSalt: UserMetadata.lockPinSalt, lockPinHash: UserMetadata.lockPinHash }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!existing) return c.json({ error: "Account not found", code: "ACCOUNT_NOT_FOUND" }, 400);
    if (isChange) {
      if (!existing.lockPinSalt || !existing.lockPinHash) return c.json({ error: "No lock PIN set", code: "NO_LOCK_PIN" }, 400);
      if (!validatePinFormat(currentPin)) return c.json({ error: "Current PIN must be exactly 4 digits", code: "INVALID_PIN" }, 400);
      if (!verifyPin(currentPin, existing.lockPinSalt, existing.lockPinHash)) return c.json({ error: "Incorrect current PIN", code: "INCORRECT_PIN" }, 401);
    }
    const { salt, hash } = hashPinNew(pinToSet);
    await db.update(UserMetadata).set({ lockPinSalt: salt, lockPinHash: hash, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/set-lock-pin", action: "set_lock_pin" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/can-create-space", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/can-create-space", "read", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const canCreate = await canCreateSharedSpace(auth.userId, auth);
    return c.json(canCreate);
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/can-create-space", action: "check_can_create_space" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/can-join-space", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/can-join-space", "read", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const canJoin = await canJoinSpace(auth.userId, auth);
    return c.json(canJoin);
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/can-join-space", action: "check_can_join_space" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/user/limits", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/user/limits", "read", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const limitsInfo = await getUserLimitsInfo(auth.userId, auth);
    return c.json(limitsInfo, 200, { "Cache-Control": "private, max-age=0, no-store" });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/user/limits", action: "get_user_limits" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.post("/api/user/import", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const formData = await c.req.formData();
    const format = formData.get("format");
    if (!format || format !== "markdown" && format !== "csv-threads") {
      return c.json({ error: 'Invalid format. Must be "markdown" or "csv-threads"' }, 400);
    }
    const files = [];
    const fileEntry = formData.get("file");
    const filesEntry = formData.getAll("files");
    if (fileEntry) files.push(fileEntry);
    else if (filesEntry?.length > 0) files.push(...filesEntry);
    else return c.json({ error: "At least one file is required" }, 400);
    const allParsedNotes = [];
    for (const file of files) {
      const fileContent = await file.text();
      const folderPath = getFolderPath(file);
      let parsedNotes = [];
      if (format === "csv-threads") parsedNotes = parseCSV(fileContent);
      else if (format === "markdown") parsedNotes = parseMarkdownExport(fileContent);
      for (const note of parsedNotes) allParsedNotes.push({ note, folderPath, fileName: file.name || "" });
    }
    if (allParsedNotes.length === 0) return c.json({ error: "No notes found in files" }, 400);
    await ensureUnorganizedThread(auth.userId);
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        userColor: "paper",
        currentSeason: getCurrentSeason(),
        createdAt: nowISO()
      });
      userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    }
    let notesImported = 0, threadsCreated = 0, tagsCreated = 0, duplicatesSkipped = 0;
    const errors = [];
    const createdThreadIds = /* @__PURE__ */ new Set();
    for (let i = 0; i < allParsedNotes.length; i++) {
      try {
        const { note: parsedNote, folderPath } = allParsedNotes[i];
        let title = null, content = "", threadName = null;
        let threadColor = null, tags = [], createdDate = /* @__PURE__ */ new Date();
        let scriptureReference = null, scriptureTranslation = null;
        if (format === "csv-threads") {
          const csvNote = parsedNote;
          title = csvNote.noteTitle || null;
          content = csvNote.content;
          let csvThreadName = csvNote.threadTitle || null;
          if (csvThreadName?.includes("/")) {
            const parts = csvThreadName.split("/").filter((p) => p.trim());
            csvThreadName = parts.length > 0 ? parts[parts.length - 1] : null;
          }
          threadName = folderPath ? getThreadNameFromPath(folderPath, csvThreadName) : csvThreadName;
          threadColor = csvNote.threadColor || null;
          tags = csvNote.tags || [];
          createdDate = parseExportDate(csvNote.createdDate);
        } else {
          const mdNote = parsedNote;
          title = mdNote.title || null;
          content = markdownToHtml(mdNote.content);
          if (mdNote.threadName) {
            threadName = mdNote.threadName;
            threadColor = mdNote.threadColor && THREAD_COLORS.includes(mdNote.threadColor) ? mdNote.threadColor : null;
          }
          tags = mdNote.tags || [];
          createdDate = parseExportDate(mdNote.createdDate);
          scriptureReference = mdNote.scriptureReference || null;
          scriptureTranslation = mdNote.scriptureTranslation || null;
        }
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        const capitalizedTitle = title ? title.charAt(0).toUpperCase() + title.slice(1) : null;
        if (await isDuplicateNote(auth.userId, capitalizedTitle, capitalizedContent)) {
          duplicatesSkipped++;
          continue;
        }
        const threadId = await getOrCreateThread(auth.userId, threadName || "", threadColor);
        if (!createdThreadIds.has(threadId) && threadId !== "thread_unorganized") {
          createdThreadIds.add(threadId);
          threadsCreated++;
        }
        const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
        let noteType = scriptureReference ? "scripture" : "default";
        const newNote = await db.insert(Notes).values({
          id: generateNoteId(),
          content: capitalizedContent,
          title: capitalizedTitle,
          threadId: "thread_unorganized",
          spaceId: null,
          simpleNoteId: nextSimpleNoteId,
          noteType,
          userId: auth.userId,
          isPublic: false,
          createdAt: createdDate.toISOString(),
          contentEncrypted: false
        }).returning().get();
        await db.update(UserMetadata).set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
        userMetadata = { ...userMetadata, highestSimpleNoteId: nextSimpleNoteId };
        if (threadId !== "thread_unorganized") {
          await db.insert(NoteThreads).values({
            id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            noteId: newNote.id,
            threadId,
            createdAt: nowISO()
          });
          await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
        }
        for (const tagName of tags) {
          try {
            const [tagId, wasCreated] = await getOrCreateTag(auth.userId, tagName);
            if (wasCreated) tagsCreated++;
            const existingRelation = await db.select().from(NoteTags).where(and(eq(NoteTags.noteId, newNote.id), eq(NoteTags.tagId, tagId))).get();
            if (!existingRelation) {
              await db.insert(NoteTags).values({
                id: `note-tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId: newNote.id,
                tagId,
                isAutoGenerated: false,
                confidence: null,
                createdAt: nowISO()
              });
            }
          } catch (tagError) {
            errors.push(`Failed to create tag "${tagName}" for note ${i + 1}`);
          }
        }
        if (scriptureReference && noteType === "scripture") {
          try {
            const parsed = parseScriptureReference(scriptureReference);
            if (parsed) {
              const verse = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
              const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : void 0;
              await db.insert(ScriptureMetadata).values({
                id: `scripture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                noteId: newNote.id,
                reference: scriptureReference,
                book: parsed.book,
                chapter: parsed.chapter,
                verse,
                verseEnd,
                translation: scriptureTranslation || "NET",
                originalText: "",
                createdAt: nowISO()
              });
            }
          } catch (err) {
            errors.push(`Failed to create scripture metadata for note ${i + 1}`);
          }
        }
        notesImported++;
      } catch (noteError) {
        errors.push(`Failed to import note ${i + 1}: ${noteError instanceof Error ? noteError.message : "Unknown error"}`);
      }
    }
    return c.json({ success: true, notesImported, threadsCreated, tagsCreated, duplicatesSkipped, errors: errors.length > 0 ? errors : void 0 });
  } catch (error) {
    console.error("Import error:", error);
    return c.json({ error: error.message || "Failed to import data" }, 500);
  }
});
app.get("/api/profile/my-sharing", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const origin = new URL(c.req.url).origin;
    const [threadRows, noteRows] = await Promise.all([
      db.select({ id: Threads.id, title: Threads.title, color: Threads.color, shareToken: Threads.shareToken }).from(Threads).where(and(eq(Threads.userId, auth.userId), isNotNull(Threads.shareToken))).orderBy(desc(Threads.shareTokenCreatedAt)),
      db.select({ id: Notes.id, title: Notes.title, content: Notes.content, shareToken: Notes.shareToken }).from(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.noteType, "default"), isNotNull(Notes.shareToken))).orderBy(desc(Notes.shareTokenCreatedAt))
    ]);
    const threads = threadRows.filter((t) => t.shareToken != null).map((t) => ({
      id: t.id,
      title: t.title || "Untitled thread",
      color: t.color ?? void 0,
      shareToken: t.shareToken,
      shareUrl: `${origin}/shared/thread/${t.shareToken}`
    }));
    const notes = noteRows.filter((n) => n.shareToken != null).map((n) => {
      const title = n.title?.trim() || (n.content?.split("\n")[0]?.trim().slice(0, 80) || "Untitled note");
      return {
        id: n.id,
        title: title.length > 80 ? title.slice(0, 77) + "..." : title,
        shareToken: n.shareToken,
        shareUrl: `${origin}/shared/note/${n.shareToken}`
      };
    });
    return c.json({ threads, notes }, 200, { "Cache-Control": "private, max-age=0, no-store" });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/profile/my-sharing", action: "get_my_sharing" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
app.get("/api/profile/my-shared-spaces", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/profile/my-shared-spaces", "read", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const origin = new URL(c.req.url).origin;
    const ownedSpacesRows = await db.select({
      id: Spaces.id,
      title: Spaces.title,
      color: Spaces.color,
      shareToken: Spaces.shareToken
    }).from(Spaces).where(eq(Spaces.userId, auth.userId)).orderBy(
      asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Spaces.lastVisited)
    ).all();
    const owned = [];
    for (const space of ownedSpacesRows) {
      const memberCount = await getSpaceMemberCount2(space.id);
      const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
      if (memberCount > 0 || hasShareLink) {
        owned.push({
          id: space.id,
          title: space.title || "Untitled space",
          color: space.color ?? void 0,
          memberCount,
          shareToken: space.shareToken ?? void 0,
          shareUrl: space.shareToken ? `${origin}/spaces/join/${space.shareToken}` : void 0
        });
      }
    }
    const memberships = await db.select({ spaceId: Members.spaceId }).from(Members).where(eq(Members.userId, auth.userId)).all();
    const ownedSpaceIds = new Set(ownedSpacesRows.map((s) => s.id));
    const memberOf = [];
    for (const m of memberships) {
      if (ownedSpaceIds.has(m.spaceId)) continue;
      const spaceRow = await db.select({ id: Spaces.id, title: Spaces.title, color: Spaces.color }).from(Spaces).where(eq(Spaces.id, m.spaceId)).get();
      if (spaceRow) {
        const memberCount = await getSpaceMemberCount2(spaceRow.id);
        memberOf.push({ id: spaceRow.id, title: spaceRow.title || "Untitled space", color: spaceRow.color ?? void 0, memberCount });
      }
    }
    return c.json({ owned, memberOf }, 200, { "Cache-Control": "private, max-age=0, no-store" });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: "/api/profile/my-shared-spaces", action: "get_my_shared_spaces" });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
function getFolderPath(file) {
  const relativePath = file.webkitRelativePath;
  if (relativePath) {
    const pathParts = relativePath.split("/");
    if (pathParts.length > 1) {
      pathParts.pop();
      return pathParts.join("/");
    }
  }
  const fileName = file.name || "";
  if (fileName.includes("/")) {
    const parts = fileName.split("/");
    parts.pop();
    return parts.join("/");
  }
  return null;
}
function getThreadNameFromPath(folderPath, defaultName) {
  if (folderPath) {
    const parts = folderPath.split("/").filter((p) => p.trim());
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }
  return defaultName;
}
function parseExportDate(dateString) {
  if (!dateString) return /* @__PURE__ */ new Date();
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? /* @__PURE__ */ new Date() : d;
}
function getThreadColorFromTitle(threadTitle) {
  const availableColors = THREAD_COLORS.filter((color) => color !== "paper");
  let hash = 0;
  for (let i = 0; i < threadTitle.length; i++) {
    hash = (hash << 5) - hash + threadTitle.charCodeAt(i);
    hash = hash & hash;
  }
  return availableColors[Math.abs(hash) % availableColors.length];
}
async function getOrCreateThread(userId, threadTitle, threadColor) {
  if (!threadTitle || threadTitle.trim() === "" || threadTitle === "Unorganized") {
    await ensureUnorganizedThread(userId);
    return "thread_unorganized";
  }
  const existingThread = await db.select().from(Threads).where(and(eq(Threads.userId, userId), eq(Threads.title, threadTitle.trim()))).get();
  if (existingThread) return existingThread.id;
  const capitalizedTitle = threadTitle.trim().charAt(0).toUpperCase() + threadTitle.trim().slice(1);
  let finalColor = null;
  if (threadColor && THREAD_COLORS.includes(threadColor)) finalColor = threadColor;
  else finalColor = getThreadColorFromTitle(threadTitle.trim());
  const newThread = await db.insert(Threads).values({
    id: generateThreadId(),
    title: capitalizedTitle,
    subtitle: null,
    spaceId: null,
    userId,
    isPublic: false,
    color: finalColor,
    isPinned: false,
    createdAt: nowISO()
  }).returning().get();
  return newThread.id;
}
async function getOrCreateTag(userId, tagName) {
  const trimmedName = tagName.trim();
  if (!trimmedName) throw new Error("Tag name cannot be empty");
  const allUserTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
  const existingTag = allUserTags.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
  if (existingTag) return [existingTag.id, false];
  const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(Tags).values({
    id: tagId,
    name: trimmedName,
    color: null,
    category: null,
    userId,
    isSystem: false,
    createdAt: nowISO()
  });
  return [tagId, true];
}
async function isDuplicateNote(userId, title, content) {
  const normalizedContent = htmlToPlainText(content).toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedTitle = (title || "").toLowerCase().trim();
  const existingNotes = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content }).from(Notes).where(eq(Notes.userId, userId));
  for (const note of existingNotes) {
    const et = (note.title || "").toLowerCase().trim();
    const ec = htmlToPlainText(note.content || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (et === normalizedTitle && ec === normalizedContent) return true;
  }
  return false;
}
var user_default = app;

// server/routes/tags-scripture.ts
import { Hono as Hono13 } from "hono";
init_db();
init_dates();
var app2 = new Hono13();
app2.post("/api/tags/create", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/tags/create", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const { name, color, category } = await c.req.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "Tag name is required" }, 400);
    }
    const existingTag = await db.select().from(Tags).where(and(eq(Tags.userId, auth.userId), eq(Tags.name, name.trim()))).get();
    if (existingTag) {
      return c.json({ error: "Tag already exists" }, 409);
    }
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(Tags).values({
      id: tagId,
      name: name.trim(),
      color: color || "#006eff",
      category: category || "spiritual",
      userId: auth.userId,
      isSystem: false,
      createdAt: nowISO()
    });
    return c.json({
      success: true,
      tag: {
        id: tagId,
        name: name.trim(),
        color: color || "#006eff",
        category: category || "spiritual",
        userId: auth.userId,
        isSystem: false,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }, 201);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/tags/create", action: "create_tag" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.delete("/api/tags/delete", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/tags/delete", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const tagId = c.req.query("tagId");
    if (!tagId) {
      return c.json({ error: "Tag ID is required" }, 400);
    }
    const tag = await db.select().from(Tags).where(and(eq(Tags.id, tagId), eq(Tags.userId, auth.userId))).get();
    if (!tag) {
      return c.json({ error: "Tag not found" }, 404);
    }
    if (tag.isSystem) {
      return c.json({ error: "Cannot delete system tags" }, 403);
    }
    await db.delete(NoteTags).where(eq(NoteTags.tagId, tagId));
    await db.delete(Tags).where(eq(Tags.id, tagId));
    return c.json({ success: true, message: "Tag deleted" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/tags/delete", action: "delete_tag" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.get("/api/tags/list", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const tags = await db.select().from(Tags).where(eq(Tags.userId, auth.userId)).orderBy(Tags.name);
    const tagsWithCounts = await Promise.all(
      tags.map(async (tag) => {
        const noteCount = await db.select({ count: count() }).from(NoteTags).where(eq(NoteTags.tagId, tag.id));
        return { ...tag, noteCount: noteCount[0]?.count || 0 };
      })
    );
    return c.json({ success: true, tags: tagsWithCounts });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/tags/list", action: "list_tags" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.post("/api/scripture/check-existing", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const { reference, threadId } = await c.req.json();
    if (!reference || typeof reference !== "string") {
      return c.json({ error: "Scripture reference is required" }, 400);
    }
    const normalizedReference = normalizeScriptureReference(reference);
    let existingScripture = await db.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference }).from(ScriptureMetadata).innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id)).where(and(eq(ScriptureMetadata.reference, normalizedReference), eq(Notes.userId, auth.userId))).limit(1).get();
    if (!existingScripture) {
      const allUserScripture = await db.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference }).from(ScriptureMetadata).innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id)).where(eq(Notes.userId, auth.userId)).all();
      for (const scripture of allUserScripture) {
        if (normalizeScriptureReference(scripture.reference) === normalizedReference) {
          existingScripture = scripture;
          break;
        }
      }
    }
    if (!existingScripture) {
      return c.json({ exists: false, noteId: null, inThread: false, inUnorganized: false });
    }
    let inThread = false;
    if (threadId) {
      const threadRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, existingScripture.noteId), eq(NoteThreads.threadId, threadId))).limit(1).get();
      inThread = !!threadRelation;
    }
    const threadCount = await db.select({ count: count() }).from(NoteThreads).where(eq(NoteThreads.noteId, existingScripture.noteId)).get();
    const inUnorganized = !threadCount || threadCount.count === 0;
    return c.json({
      exists: true,
      noteId: existingScripture.noteId,
      reference: existingScripture.reference,
      inThread,
      inUnorganized
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/scripture/check-existing", action: "check_existing_scripture" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.post("/api/scripture/detect", async (c) => {
  try {
    const { text: text2 } = await c.req.json();
    if (!text2 || typeof text2 !== "string") {
      return c.json({ error: "Text is required" }, 400);
    }
    const detection = await detectScripture(text2);
    const primaryReference = getPrimaryReference(detection);
    let parsedReference = null;
    if (primaryReference) {
      parsedReference = parseScriptureReference(primaryReference);
    }
    return c.json({ ...detection, primaryReference, parsedReference });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/scripture/detect", action: "detect_scripture" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.post("/api/scripture/fetch-verse", async (c) => {
  try {
    const { reference } = await c.req.json();
    if (!reference || typeof reference !== "string") {
      return c.json({ error: "Reference is required" }, 400);
    }
    const cleanReference = reference.replace(/,\s+/g, ",");
    const parsed = parseScriptureReference(cleanReference);
    if (!parsed) {
      return c.json({ error: "Invalid scripture reference format" }, 400);
    }
    const verseGroups = parseVerseGroups(cleanReference);
    for (const group of verseGroups) {
      if (group.start === group.end) {
        if (!validateVerseNumber(parsed.book, parsed.chapter, group.start)) {
          return c.json({ error: `Invalid verse number: ${parsed.book} ${parsed.chapter}:${group.start} does not exist` }, 400);
        }
      } else {
        if (!validateVerseRange(parsed.book, parsed.chapter, group.start, group.end)) {
          return c.json({ error: `Invalid verse range: ${parsed.book} ${parsed.chapter}:${group.start}-${group.end} is not valid` }, 400);
        }
      }
    }
    let verses = [];
    if (verseGroups.length > 1) {
      const versePromises = verseGroups.map(async (group) => {
        const groupReference = `${parsed.book} ${parsed.chapter}:${group.start}-${group.end}`;
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(groupReference)}&formatting=plain&type=json`;
        const response = await fetchWithTimeout(apiUrl, { timeout: 1e4, retries: 2, retryTimeout: 5e3 });
        if (!response.ok) throw new Error(`Bible.org API error for ${groupReference}: ${response.status} ${response.statusText}`);
        return await response.json();
      });
      const verseArrays = await Promise.all(versePromises);
      verses = verseArrays.flat();
    } else {
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
      const response = await fetchWithTimeout(apiUrl, { timeout: 1e4, retries: 2, retryTimeout: 5e3 });
      if (!response.ok) throw new Error(`Bible.org API error: ${response.status} ${response.statusText}`);
      verses = await response.json();
    }
    if (!verses || verses.length === 0) {
      return c.json({ error: "No verses found for this reference" }, 404);
    }
    let verseText;
    if (verseGroups.length > 1) {
      const formattedParts = [];
      verseGroups.forEach((group, index2) => {
        const groupVerses = verses.filter((v) => {
          const verseNum = parseInt(v.verse);
          return verseNum >= group.start && verseNum <= group.end;
        });
        if (groupVerses.length > 0) {
          const label = group.start === group.end ? `Verse ${group.start}:` : `Verses ${group.start}-${group.end}:`;
          formattedParts.push(`<p><strong>${label}</strong></p>`);
          const groupText = groupVerses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(" ");
          formattedParts.push(`<p>${groupText}</p>`);
          if (index2 < verseGroups.length - 1) {
            formattedParts.push('<hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--color-stone-grey); opacity: 0.3;" />');
          }
        }
      });
      verseText = formattedParts.join("");
    } else {
      verseText = verses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(" ");
    }
    const verseNumber = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : void 0;
    return c.json({ reference, book: parsed.book, chapter: parsed.chapter, verse: verseNumber, verseEnd, translation: "NET", text: verseText });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/scripture/fetch-verse", action: "fetch_verse" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app2.post("/api/note-tags/assign", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/note-tags/assign", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const { noteId, tagId, isAutoGenerated = false, confidence } = await c.req.json();
    if (!noteId || !tagId) return c.json({ error: "Note ID and Tag ID are required" }, 400);
    const tag = await db.select().from(Tags).where(and(eq(Tags.id, tagId), eq(Tags.userId, auth.userId))).get();
    if (!tag) return c.json({ error: "Tag not found" }, 404);
    const existingRelation = await db.select().from(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId))).get();
    if (existingRelation) return c.json({ error: "Tag already assigned to note" }, 409);
    const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(NoteTags).values({
      id: relationId,
      noteId,
      tagId,
      isAutoGenerated,
      confidence,
      createdAt: nowISO()
    });
    return c.json({ success: true, message: "Tag assigned to note", relationId }, 201);
  } catch (error) {
    console.error("Error assigning tag to note:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
app2.delete("/api/note-tags/remove", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/note-tags/remove", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const noteId = c.req.query("noteId");
    const tagId = c.req.query("tagId");
    if (!noteId || !tagId) return c.json({ error: "Note ID and Tag ID are required" }, 400);
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));
    return c.json({ success: true, message: "Tag removed from note" });
  } catch (error) {
    console.error("Error removing tag from note:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
app2.get("/api/note-tags/list", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const noteId = c.req.query("noteId");
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const noteTags = await db.select({
      id: NoteTags.id,
      noteId: NoteTags.noteId,
      tagId: NoteTags.tagId,
      isAutoGenerated: NoteTags.isAutoGenerated,
      confidence: NoteTags.confidence,
      createdAt: NoteTags.createdAt,
      tag: { id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem }
    }).from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id)).where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, auth.userId)));
    return c.json({ success: true, tags: noteTags });
  } catch (error) {
    console.error("Error fetching note tags:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
var tags_scripture_default = app2;

// server/routes/shared.ts
import { Hono as Hono14 } from "hono";
init_db();
init_dates();
init_ids();

// src/utils/url-helpers.ts
var PREFIXES = [
  ["thread_", "/thread/"],
  ["note_", "/note/"],
  ["space_", "/space/"],
  ["local_", "/local/"]
];
function idToUrl(id, threadContext) {
  let url = `/${id}`;
  for (const [prefix, urlPrefix] of PREFIXES) {
    if (id.startsWith(prefix)) {
      url = urlPrefix + id.slice(prefix.length);
      break;
    }
  }
  if (threadContext && id.startsWith("note_")) {
    url += `?thread=${threadContext}`;
  }
  return url;
}

// server/routes/shared.ts
var app3 = new Hono14();
app3.get("/api/shared/note/:shareToken", async (c) => {
  try {
    const shareToken = c.req.param("shareToken");
    if (!shareToken) return c.json({ error: "Share token is required" }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: "Invalid share token format" }, 400);
    const note = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      isPublic: Notes.isPublic,
      shareToken: Notes.shareToken,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
      userId: Notes.userId
    }).from(Notes).where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true))).get();
    if (!note) return c.json({ error: "Shared note not found or no longer available" }, 404);
    let scriptureMetadata = null;
    if (note.noteType === "scripture") {
      scriptureMetadata = await db.select({
        reference: ScriptureMetadata.reference,
        book: ScriptureMetadata.book,
        chapter: ScriptureMetadata.chapter,
        verse: ScriptureMetadata.verse,
        verseEnd: ScriptureMetadata.verseEnd,
        translation: ScriptureMetadata.translation,
        originalText: ScriptureMetadata.originalText
      }).from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id)).get();
    }
    let resourceMetadata = null;
    if (note.noteType === "resource") {
      resourceMetadata = await db.select({
        sourceUrl: ResourceMetadata.sourceUrl,
        sourceDomain: ResourceMetadata.sourceDomain,
        sourceName: ResourceMetadata.sourceName,
        sourceTitle: ResourceMetadata.sourceTitle,
        sourceDescription: ResourceMetadata.sourceDescription,
        sourceImage: ResourceMetadata.sourceImage
      }).from(ResourceMetadata).where(eq(ResourceMetadata.noteId, note.id)).get();
    }
    const creator = await db.select({
      firstName: UserMetadata.firstName,
      lastName: UserMetadata.lastName,
      userColor: UserMetadata.userColor,
      profileImageUrl: UserMetadata.profileImageUrl
    }).from(UserMetadata).where(eq(UserMetadata.userId, note.userId)).get();
    const firstName = creator?.firstName || "";
    const lastName = creator?.lastName || "";
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = firstInitial + lastInitial || "U";
    const displayName = firstName ? lastName ? `${firstName} ${lastInitial}.` : firstName : "A Harvous User";
    return c.json({
      note: { id: note.id, title: note.title, content: note.content, noteType: note.noteType, createdAt: note.createdAt, updatedAt: note.updatedAt },
      scriptureMetadata,
      resourceMetadata,
      creator: { firstName, displayName, initials, userColor: creator?.userColor || "paper", profileImageUrl: creator?.profileImageUrl || null }
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/shared/note/[shareToken]", action: "get_shared_note" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.get("/api/shared/thread/:shareToken", async (c) => {
  try {
    const shareToken = c.req.param("shareToken");
    if (!shareToken) return c.json({ error: "Share token is required" }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: "Invalid share token format" }, 400);
    const thread = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      isPublic: Threads.isPublic,
      shareToken: Threads.shareToken,
      createdAt: Threads.createdAt,
      userId: Threads.userId
    }).from(Threads).where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true))).get();
    if (!thread) return c.json({ error: "Shared thread not found or no longer available" }, 404);
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited
    }).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.contentEncrypted, false))).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).all();
    const creator = await db.select({
      firstName: UserMetadata.firstName,
      lastName: UserMetadata.lastName,
      userColor: UserMetadata.userColor,
      profileImageUrl: UserMetadata.profileImageUrl
    }).from(UserMetadata).where(eq(UserMetadata.userId, thread.userId)).get();
    const firstName = creator?.firstName || "";
    const lastName = creator?.lastName || "";
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = firstInitial + lastInitial || "U";
    const displayName = firstName ? lastName ? `${firstName} ${lastInitial}.` : firstName : "A Harvous User";
    return c.json({
      thread: { id: thread.id, title: thread.title, subtitle: thread.subtitle, color: thread.color, createdAt: thread.createdAt },
      notes: notes.map((n) => ({ id: n.id, title: n.title, content: n.content, noteType: n.noteType, createdAt: n.createdAt })),
      creator: { firstName, displayName, initials, userColor: creator?.userColor || "paper", profileImageUrl: creator?.profileImageUrl || null },
      meta: { noteCount: notes.length }
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/shared/thread/[shareToken]", action: "get_shared_thread" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.post("/api/shared/add-note-to-harvous", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const { shareToken } = await c.req.json();
    if (!shareToken) return c.json({ error: "Share token is required" }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: "Invalid share token format" }, 400);
    const sourceNote = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType, isPublic: Notes.isPublic, userId: Notes.userId }).from(Notes).where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true))).get();
    if (!sourceNote) return c.json({ error: "Shared note not found or no longer available" }, 404);
    if (process.env.NODE_ENV === "production" && sourceNote.userId === auth.userId) {
      return c.json({ error: "Already in your Harvous" }, 400);
    }
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        currentSeason: season,
        createdAt: nowISO()
      });
      userMetadata = { id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId, userColor: "paper", firstName: null, lastName: null, email: null, profileImageUrl: null, clerkDataUpdatedAt: null, churchName: null, churchCity: null, churchState: null, currentSeason: season, lastMonthlyVisit: null, churchAddedAt: null, createdAt: nowISO(), updatedAt: null, referralCode: null, lockPinHash: null };
    }
    const newNoteId = generateNoteId();
    const newSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    const ts = nowISO();
    await db.insert(Notes).values({
      id: newNoteId,
      title: sourceNote.title || null,
      content: sourceNote.content,
      threadId: "thread_unorganized",
      spaceId: null,
      simpleNoteId: newSimpleNoteId,
      noteType: sourceNote.noteType || "default",
      userId: auth.userId,
      isPublic: false,
      addedBy: "shared",
      createdAt: ts,
      lastVisited: ts
    });
    if (sourceNote.noteType === "scripture") {
      const sourceScriptureMeta = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, sourceNote.id)).get();
      if (sourceScriptureMeta) {
        await db.insert(ScriptureMetadata).values({
          id: `scripture_${newNoteId}_${Date.now()}`,
          noteId: newNoteId,
          reference: sourceScriptureMeta.reference,
          book: sourceScriptureMeta.book,
          chapter: sourceScriptureMeta.chapter,
          verse: sourceScriptureMeta.verse,
          verseEnd: sourceScriptureMeta.verseEnd || null,
          translation: sourceScriptureMeta.translation,
          originalText: sourceScriptureMeta.originalText,
          createdAt: ts
        });
      }
    }
    if (sourceNote.noteType === "resource") {
      const sourceResourceMeta = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, sourceNote.id)).get();
      if (sourceResourceMeta) {
        await db.insert(ResourceMetadata).values({
          id: `resource_${newNoteId}_${Date.now()}`,
          noteId: newNoteId,
          sourceUrl: sourceResourceMeta.sourceUrl,
          sourceDomain: sourceResourceMeta.sourceDomain || null,
          sourceName: sourceResourceMeta.sourceName || null,
          sourceTitle: sourceResourceMeta.sourceTitle || null,
          sourceDescription: sourceResourceMeta.sourceDescription || null,
          sourceImage: sourceResourceMeta.sourceImage || null,
          createdAt: ts
        });
      }
    }
    await db.update(UserMetadata).set({ highestSimpleNoteId: newSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    processScriptureReferences(newNoteId, auth.userId, "thread_unorganized", sourceNote.content).catch(() => {
    });
    awardNoteCreatedXP(auth.userId, newNoteId, sourceNote.noteType === "scripture", sourceNote.content || "").catch(() => {
    });
    return c.json({ success: true, message: "Note added to your Harvous!", createdIds: { noteId: newNoteId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/shared/add-note-to-harvous", action: "add_shared_note" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.post("/api/shared/add-to-harvous", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const { shareToken } = await c.req.json();
    if (!shareToken) return c.json({ error: "Share token is required" }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: "Invalid share token format" }, 400);
    const sourceThread = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, isPublic: Threads.isPublic, userId: Threads.userId }).from(Threads).where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true))).get();
    if (!sourceThread) return c.json({ error: "Shared thread not found or no longer available" }, 404);
    if (process.env.NODE_ENV === "production" && sourceThread.userId === auth.userId) {
      return c.json({ error: "Already in your Harvous" }, 400);
    }
    const sourceNotes = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType, createdAt: Notes.createdAt }).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(eq(NoteThreads.threadId, sourceThread.id)).orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    ).all();
    const newThreadId = generateThreadId();
    const ts = nowISO();
    await db.insert(Threads).values({
      id: newThreadId,
      title: sourceThread.title,
      subtitle: sourceThread.subtitle || null,
      spaceId: null,
      userId: auth.userId,
      isPublic: false,
      color: sourceThread.color || "paper",
      createdAt: ts,
      updatedAt: ts,
      lastVisited: ts
    });
    awardThreadCreatedXP(auth.userId, newThreadId, sourceThread.title, sourceThread.subtitle || null).catch(() => {
    });
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        currentSeason: season,
        createdAt: nowISO()
      });
      userMetadata = { id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId };
    }
    const createdNoteIds = [];
    let currentSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    const baseTimestamp = Date.now();
    for (let noteIndex = 0; noteIndex < sourceNotes.length; noteIndex++) {
      const note = sourceNotes[noteIndex];
      const noteTimestamp = new Date(baseTimestamp + noteIndex).toISOString();
      const newNoteId = generateNoteId();
      await db.insert(Notes).values({
        id: newNoteId,
        title: note.title || null,
        content: note.content,
        threadId: newThreadId,
        spaceId: null,
        simpleNoteId: currentSimpleNoteId,
        noteType: note.noteType || "default",
        userId: auth.userId,
        isPublic: false,
        addedBy: "shared",
        createdAt: noteTimestamp,
        lastVisited: noteTimestamp
      });
      const junctionId = `note-thread-${newNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: junctionId, noteId: newNoteId, threadId: newThreadId, createdAt: nowISO() });
      awardNoteCreatedXP(auth.userId, newNoteId, note.noteType === "scripture", note.content || "").catch(() => {
      });
      createdNoteIds.push(newNoteId);
      currentSimpleNoteId++;
    }
    if (sourceNotes.length > 0) {
      await db.update(UserMetadata).set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    }
    return c.json({ success: true, message: "Thread added to your Harvous!", createdIds: { threadId: newThreadId, noteIds: createdNoteIds } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/shared/add-to-harvous", action: "add_shared_thread" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.get("/api/invitations/:token", async (c) => {
  try {
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Invitation token is required", code: "INVALID_TOKEN" }, 400);
    const invitation = await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).get();
    if (!invitation) return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
    const isExpired = invitation.expiresAt && /* @__PURE__ */ new Date() > new Date(invitation.expiresAt);
    if (invitation.status !== "pending") {
      return c.json({ error: `This invitation has been ${invitation.status}`, code: "INVITATION_NOT_PENDING" }, 410);
    }
    const space = await db.select().from(Spaces).where(eq(Spaces.id, invitation.spaceId)).get();
    if (!space) return c.json({ error: "Space not found", code: "NOT_FOUND" }, 404);
    const inviter = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, invitation.invitedBy)).get();
    const auth = getAuth(c);
    let alreadyMember = false;
    let canAccept = !isExpired;
    if (auth.userId) {
      if (space.userId === auth.userId) {
        alreadyMember = true;
        canAccept = false;
      } else {
        const existingMember = await db.select().from(Members).where(and(eq(Members.spaceId, invitation.spaceId), eq(Members.userId, auth.userId))).get();
        if (existingMember) {
          alreadyMember = true;
          canAccept = false;
        }
      }
    }
    return c.json({
      success: true,
      data: {
        invitation: {
          spaceTitle: space.title,
          spaceColor: space.color || "paper",
          invitedBy: { firstName: inviter?.firstName, lastName: inviter?.lastName },
          message: invitation.message,
          expiresAt: invitation.expiresAt,
          isExpired,
          status: invitation.status
        },
        canAccept,
        alreadyMember,
        requiresAuth: !auth.userId
      }
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/invitations/[token]", action: "view_invitation" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.post("/api/invitations/:token/accept", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "You must be signed in to accept invitations", code: "UNAUTHORIZED" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/invitations/[token]/accept", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Invitation token is required", code: "INVALID_TOKEN" }, 400);
    const invitation = await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).get();
    if (!invitation) return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
    if (invitation.status !== "pending") {
      return c.json({ error: `This invitation has already been ${invitation.status}`, code: "INVITATION_NOT_PENDING" }, 410);
    }
    if (invitation.expiresAt && /* @__PURE__ */ new Date() > new Date(invitation.expiresAt)) {
      await db.update(SpaceInvitations).set({ status: "expired" }).where(eq(SpaceInvitations.id, invitation.id));
      return c.json({ error: "This invitation has expired", code: "INVITATION_EXPIRED" }, 410);
    }
    const space = await db.select().from(Spaces).where(eq(Spaces.id, invitation.spaceId)).get();
    if (!space) return c.json({ error: "Space not found", code: "NOT_FOUND" }, 404);
    if (space.userId === auth.userId) {
      return c.json({ error: "You are already the owner of this space", code: "ALREADY_OWNER" }, 400);
    }
    const existingMember = await db.select().from(Members).where(and(eq(Members.spaceId, invitation.spaceId), eq(Members.userId, auth.userId))).get();
    if (existingMember) {
      await db.update(SpaceInvitations).set({ status: "accepted", acceptedAt: nowISO() }).where(eq(SpaceInvitations.id, invitation.id));
      return c.json({ error: "You are already a member of this space", code: "ALREADY_MEMBER" }, 400);
    }
    const canJoin = await canJoinSpace(auth.userId, auth);
    if (!canJoin.allowed) {
      return c.json({ error: canJoin.reason || "Cannot join more spaces", code: "FORBIDDEN" }, 403);
    }
    const canAddShared = await canOwnerAddOneMoreSharedSpace(space.userId, invitation.spaceId);
    if (!canAddShared.allowed) {
      return c.json({ error: canAddShared.reason || "You've used all your shared spaces. Upgrade for unlimited.", code: "FORBIDDEN" }, 403);
    }
    const member = await db.insert(Members).values({
      id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: auth.userId,
      spaceId: invitation.spaceId,
      role: invitation.role || "member",
      createdAt: nowISO()
    }).returning().get();
    await db.update(SpaceInvitations).set({ status: "accepted", acceptedAt: nowISO() }).where(eq(SpaceInvitations.id, invitation.id));
    return c.json({
      success: true,
      data: { success: true, space: { id: space.id, title: space.title, color: space.color }, redirectUrl: idToUrl(space.id), member }
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/invitations/[token]/accept", action: "accept_invitation" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app3.post("/api/invitations/:token/decline", async (c) => {
  try {
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Invitation token is required", code: "INVALID_TOKEN" }, 400);
    const invitation = await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).get();
    if (!invitation) return c.json({ error: "Invitation not found", code: "NOT_FOUND" }, 404);
    if (invitation.status !== "pending") {
      return c.json({ error: `This invitation has already been ${invitation.status}`, code: "INVITATION_NOT_PENDING" }, 410);
    }
    await db.update(SpaceInvitations).set({ status: "declined" }).where(eq(SpaceInvitations.id, invitation.id));
    return c.json({ success: true, data: { success: true, message: "Invitation declined" } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/invitations/[token]/decline", action: "decline_invitation" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var shared_default = app3;

// server/routes/billing.ts
import { Hono as Hono15 } from "hono";
init_db();
init_dates();
import { getCookie, deleteCookie } from "hono/cookie";
var app4 = new Hono15();
app4.post("/api/billing/checkout", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const { planId, billingInterval } = await c.req.json();
    if (!planId || planId !== UNLIMITED_PLAN_ID) {
      return c.json({ error: "Invalid plan ID" }, 400);
    }
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return c.json({ error: "Clerk secret key not configured" }, 500);
    }
    const origin = new URL(c.req.url).origin;
    const checkoutPayload = {
      plan_id: UNLIMITED_PLAN_ID,
      return_url: `${origin}/upgrade?success=true`,
      cancel_url: `${origin}/upgrade?canceled=true`
    };
    if (billingInterval === "annual" || billingInterval === "year") {
      checkoutPayload.billing_interval = "year";
      checkoutPayload.interval = "year";
    }
    let response = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/checkout`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload)
    });
    if (!response.ok && (response.status === 404 || response.status === 405)) {
      response = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: UNLIMITED_PLAN_ID,
          ...billingInterval === "annual" || billingInterval === "year" ? { billing_interval: "year" } : {}
        })
      });
      if (response.ok) {
        return c.json({ success: true, message: "Subscription created successfully" });
      }
    }
    if (response.ok) {
      const checkoutSession = await response.json();
      return c.json({ checkoutUrl: checkoutSession.url || checkoutSession.checkout_url || checkoutSession.session_url });
    }
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText || `HTTP ${response.status}` };
    }
    console.error("Clerk Billing API error:", { status: response.status, error: errorData });
    let errorMessage = "Error creating checkout session";
    let hint = "Please check Clerk Billing API documentation.";
    if (response.status === 404) {
      errorMessage = "Checkout endpoint not found";
      hint = "Checkout might need frontend components.";
    } else if (response.status === 401 || response.status === 403) {
      errorMessage = "Authentication failed";
      hint = "Verify Clerk secret key.";
    }
    return c.json({ error: errorMessage, details: errorData.message || errorData.error, statusCode: response.status, hint }, response.status);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/billing/checkout", action: "create_checkout_session" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app4.post("/api/billing/downgrade", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return c.json({ error: "Clerk secret key not configured" }, 500);
    }
    let subscriptionId = null;
    const subscriptionsResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" }
    });
    if (subscriptionsResponse.ok) {
      const subscriptionsData = await subscriptionsResponse.json();
      const activeSubscription = Array.isArray(subscriptionsData) ? subscriptionsData.find((sub) => sub.status === "active" || sub.status === "trialing") : subscriptionsData.data?.find((sub) => sub.status === "active" || sub.status === "trialing");
      if (activeSubscription) subscriptionId = activeSubscription.id || activeSubscription.subscription_id;
    }
    if (!subscriptionId) {
      return c.json({ error: "No active subscription found", message: "You do not have an active subscription to cancel" }, 404);
    }
    const cancelResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" }
    });
    if (cancelResponse.ok) {
      return c.json({ success: true, message: "Subscription canceled successfully" });
    }
    const patchResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_at_period_end: true })
    });
    if (patchResponse.ok) {
      return c.json({ success: true, message: "Subscription will be canceled at the end of the billing period" });
    }
    const errorText = await patchResponse.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    console.error("Clerk Billing cancel error:", { status: patchResponse.status, error: errorData });
    return c.json({ error: "Failed to cancel subscription", details: errorData.message || errorData.error }, patchResponse.status);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/billing/downgrade", action: "cancel_subscription" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app4.get("/api/subscription/status", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const subscriptionInfo = await getSubscriptionInfo(auth.userId, auth);
    return c.json({
      hasUnlimited: subscriptionInfo.hasUnlimited,
      currentCount: subscriptionInfo.currentCount,
      limit: subscriptionInfo.limit,
      referralBonusNotes: subscriptionInfo.referralBonusNotes ?? 0
    });
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return c.json({ error: error.message || "Failed to check subscription status", hasUnlimited: false }, 500);
  }
});
var BONUS_PER_REFERRAL = 100;
app4.post("/api/referral/credit", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ref = getCookie(c, "harvous_referrer")?.trim();
    deleteCookie(c, "harvous_referrer", { path: "/" });
    if (!ref) return c.json({ credited: false });
    const referrerUserId = await resolveRefToUserId(ref);
    if (!referrerUserId) return c.json({ credited: false });
    if (referrerUserId === auth.userId) return c.json({ credited: false });
    const referrerRow = await db.select({ referralBonusNotes: UserMetadata.referralBonusNotes }).from(UserMetadata).where(eq(UserMetadata.userId, referrerUserId)).get();
    if (!referrerRow) return c.json({ credited: false });
    const newBonus = (referrerRow.referralBonusNotes ?? 0) + BONUS_PER_REFERRAL;
    await db.update(UserMetadata).set({ referralBonusNotes: newBonus, updatedAt: nowISO() }).where(eq(UserMetadata.userId, referrerUserId));
    return c.json({ credited: true });
  } catch (error) {
    console.error("Referral credit error:", error);
    return c.json({ error: "Failed to credit referral", credited: false }, 500);
  }
});
app4.get("/api/referral/status", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const subscriptionInfo = await getSubscriptionInfo(auth.userId, auth);
    const metaRow = await db.select({ referralBonusNotes: UserMetadata.referralBonusNotes, referralCode: UserMetadata.referralCode, firstName: UserMetadata.firstName }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    let referralCode = metaRow?.referralCode ?? null;
    const referralBonusNotes = metaRow?.referralBonusNotes ?? 0;
    if (!referralCode) {
      referralCode = generateReferralCode(metaRow?.firstName ?? null, auth.userId);
      await db.update(UserMetadata).set({ referralCode, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    }
    return c.json({ referralBonusNotes, referralCode, limit: subscriptionInfo.limit });
  } catch (error) {
    console.error("Referral status error:", error);
    return c.json({ error: "Failed to load referral status" }, 500);
  }
});
var billing_default = app4;

// server/routes/resource.ts
import { Hono as Hono16 } from "hono";
init_db();
var app5 = new Hono16();
function decodeHtmlEntities(text2) {
  const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
  return text2.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}
function isGenericImage(imageUrl) {
  if (!imageUrl) return true;
  const lowerUrl = imageUrl.toLowerCase();
  const genericPatterns = ["logo", "default", "banner", "header", "og-image", "ogimage", "social-share", "share-image", "site-image", "favicon", "placeholder", "thumbnail-default", "brand", "icon", "/social/", "/og/", "/share/", "/opengraph/", "social-media", "meta-image", "featured-default", "/static/images/", "/assets/images/social", "1200x630", "1200x600", "1200x628", "600x315", "twitter-card", "facebook-share", "linkedin-share"];
  if (genericPatterns.some((p) => lowerUrl.includes(p))) return true;
  const filename = lowerUrl.split("/").pop()?.split("?")[0] || "";
  if (filename.length < 10 && !filename.includes("-") && !filename.includes("_")) return true;
  const pathParts = lowerUrl.split("/");
  const hasContentSpecificPath = pathParts.some((part) => /^\d{4}$/.test(part) || /^[a-z]+-[a-z]+-[a-z]+/.test(part) || part.includes("article") || part.includes("post") || part.includes("guide"));
  if (!hasContentSpecificPath && (lowerUrl.includes("/static/") || lowerUrl.includes("/assets/"))) return true;
  return false;
}
function extractFirstContentImage(html, baseUrl) {
  const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const images = [];
  let match;
  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1];
    const fullMatch = match[0].toLowerCase();
    if (fullMatch.includes('width="1"') || fullMatch.includes("width='1'") || fullMatch.includes('height="1"') || fullMatch.includes("height='1'") || fullMatch.includes("icon") || fullMatch.includes("avatar") || fullMatch.includes("emoji") || fullMatch.includes("pixel") || fullMatch.includes("tracking") || fullMatch.includes("spacer") || fullMatch.includes("badge") || src.includes("data:image") || src.includes(".svg") || src.includes("gravatar")) continue;
    if (isGenericImage(src)) continue;
    images.push(src);
  }
  if (images.length > 0) {
    let imageUrl = images[0];
    if (!imageUrl.startsWith("http")) {
      try {
        imageUrl = new URL(imageUrl, baseUrl).href;
      } catch {
        return null;
      }
    }
    return imageUrl;
  }
  return null;
}
function extractSiteNameFromTitle(title) {
  if (!title) return null;
  const parts = title.trim().split(/\s*[\|–—\-·]\s*/);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart.length > 0 && lastPart.length < 30) return lastPart;
  }
  return null;
}
function cleanTitle(title) {
  if (!title) return "";
  let cleaned = title.trim();
  const separatorCount = (cleaned.match(/[\|–—]/g) || []).length;
  if (separatorCount === 1) {
    const suffixPattern = /\s*[\|–—\-]\s*[^|\-–—]+$/;
    const match = cleaned.match(suffixPattern);
    if (match && match[0].length < cleaned.length * 0.3) cleaned = cleaned.replace(suffixPattern, "").trim();
  }
  cleaned = cleaned.replace(/\s*-\s*YouTube\s*$/i, "").trim();
  return cleaned;
}
function stripAutoGeneratedParts(filename) {
  if (!filename) return "";
  let cleaned = filename.trim();
  cleaned = cleaned.replace(/\b[0-9a-f]{8}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{12}\b/gi, "");
  cleaned = cleaned.replace(/\b[0-9a-f]{32,}\b/gi, "");
  return cleaned.replace(/\s+/g, " ").trim();
}
app5.post("/api/resource/:id/update-image", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/resource/[id]/update-image", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const id = c.req.param("id");
    const { image } = await c.req.json();
    if (!id) return c.json({ error: "Note ID is required" }, 400);
    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: "Note not found or access denied" }, 404);
    if (existingNote.noteType !== "resource") return c.json({ error: "Note is not a resource note" }, 400);
    const resourceMeta = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, id)).get();
    if (!resourceMeta) return c.json({ error: "Resource metadata not found" }, 404);
    await db.update(ResourceMetadata).set({ sourceImage: image || null }).where(eq(ResourceMetadata.noteId, id));
    return c.json({ success: true, message: "Resource image updated" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/resource/[id]/update-image", action: "update_resource_image" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app5.post("/api/resource/check-duplicate", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const { url } = await c.req.json();
    if (!url || typeof url !== "string") return c.json({ error: "URL is required", code: "MISSING_URL" }, 400);
    const urlValidation = validateResourceUrl(url);
    if (!urlValidation.isValid) return c.json({ error: urlValidation.error || "Invalid URL", code: urlValidation.code || "INVALID_URL" }, 400);
    const normalizedUrl = urlValidation.normalizedUrl;
    const existingResources = await db.select({ noteId: ResourceMetadata.noteId, sourceUrl: ResourceMetadata.sourceUrl, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage, noteTitle: Notes.title, simpleNoteId: Notes.simpleNoteId }).from(ResourceMetadata).innerJoin(Notes, eq(ResourceMetadata.noteId, Notes.id)).where(and(eq(ResourceMetadata.sourceUrl, normalizedUrl), eq(Notes.userId, auth.userId))).limit(1);
    if (existingResources.length > 0) {
      const existing = existingResources[0];
      return c.json({ exists: true, noteId: existing.noteId, simpleNoteId: existing.simpleNoteId, title: existing.sourceTitle || existing.noteTitle || "Untitled Resource", description: existing.sourceDescription || null, image: existing.sourceImage || null, url: existing.sourceUrl });
    }
    return c.json({ exists: false });
  } catch (error) {
    console.error("Error checking for duplicate resource:", error);
    return c.json({ error: "Failed to check for duplicates", code: "CHECK_FAILED" }, 500);
  }
});
app5.post("/api/resource/metadata", async (c) => {
  try {
    const body = await c.req.json();
    const { url, metadata, extractContent } = body;
    if (metadata && typeof metadata === "object") {
      return c.json({
        success: true,
        metadata: { title: metadata.title || metadata.ogTitle || "", description: metadata.description || metadata.ogDescription || "", image: metadata.image || metadata.ogImage || "", url: url || metadata.url || "", siteName: metadata.siteName || metadata.ogSiteName || null }
      });
    }
    if (!url || typeof url !== "string") return c.json({ error: "URL is required", code: "MISSING_URL" }, 400);
    const urlValidation = validateResourceUrl(url);
    if (!urlValidation.isValid) return c.json({ error: urlValidation.error || "Invalid URL", code: urlValidation.code || "INVALID_URL" }, 400);
    const normalizedUrl = urlValidation.normalizedUrl;
    const isPDF = urlValidation.isPDF || false;
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return c.json({ error: "Invalid URL format", code: "INVALID_URL" }, 400);
    }
    if (isPDF) {
      const urlPath = parsedUrl.pathname;
      let filename = "PDF Document";
      const lastSegment = urlPath.split("/").filter(Boolean).pop();
      if (lastSegment) {
        let decodedFilename = decodeURIComponent(lastSegment).replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
        decodedFilename = stripAutoGeneratedParts(decodedFilename);
        if (decodedFilename && decodedFilename.length > 0) {
          filename = decodedFilename.split(" ").filter((w) => w.length > 0).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        }
      }
      if (!filename || filename.trim().length === 0) filename = "PDF Document";
      return c.json({ success: true, metadata: { title: filename, description: "PDF Document", image: "", url: normalizedUrl, siteName: parsedUrl.hostname.replace("www.", ""), contentType: "pdf" } });
    }
    const response = await fetch(normalizedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok) return c.json({ error: `Failed to fetch URL: ${response.statusText}`, code: "FETCH_ERROR", status: response.status }, response.status >= 500 ? 502 : 400);
    const html = await response.text();
    const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']?og:title["']?\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:title["']?/i);
    const ogDescriptionMatch = html.match(/<meta\s+(?:property|name)=["']?og:description["']?\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:description["']?/i);
    const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']?og:image["']?\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:image["']?/i);
    const ogSiteNameMatch = html.match(/<meta\s+(?:property|name)=["']?og:site_name["']?\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:site_name["']?/i);
    const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const stripHtmlTags = (str) => str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const isVideoSite = parsedUrl.hostname.includes("youtube.com") || parsedUrl.hostname.includes("youtu.be") || parsedUrl.hostname.includes("vimeo.com");
    let bestTitle = "";
    if (isVideoSite) {
      if (ogTitleMatch?.[1]?.trim()) bestTitle = cleanTitle(decodeHtmlEntities(ogTitleMatch[1].trim()));
      if (!bestTitle && pageTitleMatch?.[1]?.trim()) bestTitle = cleanTitle(decodeHtmlEntities(pageTitleMatch[1].trim()));
    } else {
      if (h1Match?.[1]) {
        const t = stripHtmlTags(h1Match[1]);
        if (t) bestTitle = decodeHtmlEntities(t);
      }
      if (!bestTitle && pageTitleMatch?.[1]?.trim()) bestTitle = cleanTitle(decodeHtmlEntities(pageTitleMatch[1].trim()));
      if (!bestTitle && h2Match?.[1]) {
        const t = stripHtmlTags(h2Match[1]);
        if (t) bestTitle = decodeHtmlEntities(t);
      }
      if (!bestTitle && ogTitleMatch?.[1]?.trim()) bestTitle = cleanTitle(decodeHtmlEntities(ogTitleMatch[1].trim()));
    }
    const descriptionMatch = ogDescriptionMatch || html.match(/<meta\s+name=["']?description["']?\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']?description["']?/i);
    let imageUrl = "";
    const contentImage = extractFirstContentImage(html, parsedUrl.origin);
    if (contentImage) imageUrl = contentImage;
    if (!imageUrl && ogImageMatch) {
      imageUrl = ogImageMatch[1];
      if (imageUrl && !imageUrl.startsWith("http")) {
        try {
          imageUrl = new URL(imageUrl, parsedUrl.origin).href;
        } catch {
          imageUrl = "";
        }
      }
    }
    let siteName = ogSiteNameMatch ? decodeHtmlEntities(ogSiteNameMatch[1].trim()) : null;
    if (!siteName && bestTitle) siteName = extractSiteNameFromTitle(bestTitle);
    if (!siteName) {
      const domain = extractDomain(normalizedUrl);
      if (domain) {
        const friendlyName = getDomainFriendlyName(domain);
        if (friendlyName && friendlyName !== domain) siteName = friendlyName;
        else siteName = domain.replace(/\.(com|org|net|io|co|edu|gov)$/i, "").split(/[.\-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      }
    }
    const extractedMetadata = { title: bestTitle, description: descriptionMatch ? decodeHtmlEntities(descriptionMatch[1].trim()) : "", image: imageUrl, url: normalizedUrl, siteName };
    if (extractContent === true) {
      try {
        extractedMetadata.articleContent = await extractArticleContent(html, normalizedUrl);
      } catch (e) {
        console.error("Error extracting article content:", e);
      }
    }
    return c.json({ success: true, metadata: extractedMetadata });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return c.json({ error: "Request timeout - URL took too long to respond", code: "TIMEOUT" }, 504);
    }
    const standardError = handleAPIError(error, { endpoint: "/api/resource/metadata", action: "fetch_resource_metadata" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app5.post("/api/resource/suggest-threads", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const { resourceUrl, sourceName } = await c.req.json();
    if (!resourceUrl || typeof resourceUrl !== "string") return c.json({ error: "Resource URL is required", code: "MISSING_URL" }, 400);
    const urlValidation = validateResourceUrl(resourceUrl);
    if (!urlValidation.isValid || !urlValidation.normalizedUrl) return c.json({ error: urlValidation.error || "Invalid URL", code: urlValidation.code || "INVALID_URL" }, 400);
    const domain = extractDomain(urlValidation.normalizedUrl);
    if (!domain) return c.json({ error: "Could not extract domain from URL", code: "DOMAIN_EXTRACTION_FAILED" }, 400);
    const matchingResources = await db.select({ noteId: ResourceMetadata.noteId, sourceName: ResourceMetadata.sourceName }).from(ResourceMetadata).innerJoin(Notes, eq(ResourceMetadata.noteId, Notes.id)).where(and(eq(ResourceMetadata.sourceDomain, domain), eq(Notes.userId, auth.userId))).all();
    let suggestedThreadName = null;
    if (sourceName && typeof sourceName === "string" && sourceName.trim() !== "") suggestedThreadName = sourceName.trim();
    if (!suggestedThreadName && matchingResources.length > 0) {
      const sourceNames = matchingResources.map((r) => r.sourceName).filter((n) => n !== null && n.trim() !== "");
      if (sourceNames.length > 0) {
        const nameCounts = {};
        sourceNames.forEach((n) => {
          nameCounts[n] = (nameCounts[n] || 0) + 1;
        });
        suggestedThreadName = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0][0];
      }
    }
    if (!suggestedThreadName) {
      const friendlyName = getDomainFriendlyName(domain);
      suggestedThreadName = friendlyName || domain.charAt(0).toUpperCase() + domain.slice(1).replace(/\./g, " ");
    }
    if (matchingResources.length === 0) {
      return c.json({ success: true, suggestedThreadIds: [], suggestedThreadName, domain });
    }
    const noteIds = matchingResources.map((r) => r.noteId);
    const threadRelations = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(inArray(NoteThreads.noteId, noteIds)).all();
    const uniqueThreadIds = [...new Set(threadRelations.map((r) => r.threadId))].filter((id) => id !== "thread_unorganized");
    if (uniqueThreadIds.length === 0) {
      return c.json({ success: true, suggestedThreadIds: [], suggestedThreadName, domain });
    }
    const suggestedThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color }).from(Threads).where(and(inArray(Threads.id, uniqueThreadIds), eq(Threads.userId, auth.userId))).all();
    const matchingThreads = suggestedThreads.filter((t) => suggestedThreadName && t.title.trim().toLowerCase() === suggestedThreadName.trim().toLowerCase());
    if (matchingThreads.length === 0) {
      return c.json({ success: true, suggestedThreadIds: [], suggestedThreads: [], suggestedThreadName, domain });
    }
    const threadNoteCounts = await Promise.all(matchingThreads.map(async (thread) => {
      const matchingNotesInThread = await db.select().from(NoteThreads).where(and(eq(NoteThreads.threadId, thread.id), inArray(NoteThreads.noteId, noteIds))).all();
      return { threadId: thread.id, count: matchingNotesInThread.length };
    }));
    const suggestedThreadIds = matchingThreads.map((thread) => {
      const noteCount = threadNoteCounts.find((tc) => tc.threadId === thread.id)?.count || 0;
      return { id: thread.id, title: thread.title, color: thread.color, noteCount };
    }).sort((a, b) => b.noteCount - a.noteCount);
    return c.json({ success: true, suggestedThreadIds: suggestedThreadIds.map((t) => t.id), suggestedThreads: suggestedThreadIds, suggestedThreadName: null, domain });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/resource/suggest-threads", action: "suggest_threads" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app5.post("/api/resource/update-metadata", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/resource/update-metadata", "write", ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    const { noteId, image } = await c.req.json();
    if (!noteId) return c.json({ error: "Note ID is required" }, 400);
    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: "Note not found or access denied" }, 404);
    if (existingNote.noteType !== "resource") return c.json({ error: "Note is not a resource note" }, 400);
    const resourceMeta = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).get();
    if (!resourceMeta) return c.json({ error: "Resource metadata not found" }, 404);
    await db.update(ResourceMetadata).set({ sourceImage: image || null }).where(eq(ResourceMetadata.noteId, noteId));
    return c.json({ success: true, message: "Resource metadata updated" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/resource/update-metadata", action: "update_resource_metadata" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var resource_default = app5;

// server/routes/inbox.ts
import { Hono as Hono17 } from "hono";
init_db();
init_dates();
init_ids();
init_unorganized_thread();

// src/utils/webflow-verification.ts
async function verifyInboxItemInWebflow(webflowItemId, collectionId = "690ed2f0edd9bab40a4eb397") {
  const webflowToken = import.meta.env.WEBFLOW_INBOX_API_TOKEN;
  if (!webflowToken) {
    console.warn("Webflow API token not configured - skipping verification");
    return { isValid: true, reason: "No API token configured" };
  }
  try {
    const verifyResponse = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items/${webflowItemId}`,
      {
        headers: {
          "Authorization": `Bearer ${webflowToken}`,
          "Accept-Version": "1.0.0"
        }
      }
    );
    if (verifyResponse.status === 404) {
      return { isValid: false, reason: "Item deleted in Webflow" };
    }
    if (!verifyResponse.ok) {
      console.error(`Webflow API error verifying item ${webflowItemId}:`, verifyResponse.status, verifyResponse.statusText);
      return { isValid: true, reason: "API error - assuming valid" };
    }
    const itemData = await verifyResponse.json();
    const fullItem = itemData.items?.[0] || itemData.item || itemData;
    const isDraft = fullItem.isDraft || !fullItem.lastPublished;
    const isArchived = fullItem.isArchived || false;
    const toggleOff = fullItem.fieldData?.active !== true;
    if (isDraft) {
      return { isValid: false, reason: "Item is draft" };
    }
    if (isArchived) {
      return { isValid: false, reason: "Item is archived" };
    }
    if (toggleOff) {
      return { isValid: false, reason: "Toggle disabled" };
    }
    return { isValid: true };
  } catch (error) {
    console.error(`Error verifying Webflow item ${webflowItemId}:`, error);
    return { isValid: true, reason: "Verification error - assuming valid" };
  }
}

// server/routes/inbox.ts
var app6 = new Hono17();
var REVERSE_COLOR_MAP = {
  "blessed-blue": "blue",
  "graceful-gold": "yellow",
  "mindful-mint": "green",
  "pleasant-peach": "orange",
  "peaceful-pink": "pink",
  "lovely-lavender": "purple",
  "paper": "paper",
  "blue": "blue",
  "yellow": "yellow",
  "green": "green",
  "orange": "orange",
  "pink": "pink",
  "purple": "purple"
};
function convertInboxColorToThreadColor(inboxColor) {
  if (!inboxColor) return null;
  if (THREAD_COLORS.includes(inboxColor)) return inboxColor;
  const mappedColor = REVERSE_COLOR_MAP[inboxColor.toLowerCase()];
  if (mappedColor && THREAD_COLORS.includes(mappedColor)) return mappedColor;
  return null;
}
app6.post("/api/inbox/archive", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/inbox/archive", "write", ip);
    if (!rateLimit.allowed) {
      return c.json(
        { error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" },
        429
      );
    }
    const { inboxItemId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: "inboxItemId is required" }, 400);
    const userInboxItem = await db.select({ userInboxItem: UserInboxItems, inboxItem: InboxItems }).from(UserInboxItems).innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id)).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId))).get();
    if (!userInboxItem) return c.json({ error: "Inbox item not found in your inbox" }, 404);
    await db.update(UserInboxItems).set({ status: "archived", archivedAt: nowISO() }).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));
    return c.json({ success: true, message: "Item archived", contentType: userInboxItem.inboxItem.contentType });
  } catch (error) {
    console.error("Error archiving inbox item:", error);
    return c.json({ error: "Failed to archive inbox item", details: error.message }, 500);
  }
});
app6.post("/api/inbox/unarchive", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, "/api/inbox/unarchive", "write", ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error, code: "RATE_LIMIT_EXCEEDED" }, 429);
    }
    const { inboxItemId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: "inboxItemId is required" }, 400);
    const userInboxItem = await db.select({ userInboxItem: UserInboxItems, inboxItem: InboxItems }).from(UserInboxItems).innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id)).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId))).get();
    if (!userInboxItem) return c.json({ error: "Inbox item not found in your inbox" }, 404);
    if (userInboxItem.userInboxItem.status !== "archived") {
      return c.json({ error: "Item is not archived" }, 400);
    }
    await db.update(UserInboxItems).set({ status: "inbox", archivedAt: null }).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));
    await db.update(InboxItems).set({ isActive: true, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItemId));
    return c.json({ success: true, message: "Item unarchived", contentType: userInboxItem.inboxItem.contentType });
  } catch (error) {
    console.error("Error unarchiving inbox item:", error);
    return c.json({ error: "Failed to unarchive inbox item", details: error.message }, 500);
  }
});
app6.get("/api/inbox/preview", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const inboxItemId = c.req.query("inboxItemId");
    if (!inboxItemId) return c.json({ error: "inboxItemId is required" }, 400);
    const inboxItem = await getInboxItemWithNotes(inboxItemId);
    if (!inboxItem) return c.json({ error: "Inbox item not found" }, 404);
    const userInboxItem = await db.select().from(UserInboxItems).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId))).get();
    const userStatus = userInboxItem?.status || null;
    return c.json({ success: true, item: { ...inboxItem, userStatus } });
  } catch (error) {
    console.error("Error fetching inbox item preview:", error);
    return c.json({ error: "Failed to fetch inbox item preview", details: error.message }, 500);
  }
});
app6.post("/api/inbox/add-to-harvous", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const { inboxItemId, targetThreadId, targetSpaceId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: "inboxItemId is required" }, 400);
    const inboxItem = await getInboxItemWithNotes(inboxItemId);
    if (!inboxItem) return c.json({ error: "Inbox item not found" }, 404);
    const userInboxItem = await db.select().from(UserInboxItems).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId))).get();
    if (!userInboxItem) return c.json({ error: "Inbox item not found in your inbox" }, 404);
    await ensureUnorganizedThread(auth.userId);
    const createdIds = { noteIds: [] };
    if (inboxItem.contentType === "note") {
      let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
      if (!userMetadata) {
        const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
        const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
        const season = getCurrentSeason();
        await db.insert(UserMetadata).values({
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          currentSeason: season,
          createdAt: nowISO()
        });
        userMetadata = {
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          userColor: "paper",
          firstName: null,
          lastName: null,
          email: null,
          profileImageUrl: null,
          clerkDataUpdatedAt: null,
          churchName: null,
          churchCity: null,
          churchState: null,
          churchCountry: null,
          currentSeason: season,
          lastMonthlyVisit: null,
          churchAddedAt: null,
          createdAt: nowISO(),
          updatedAt: null
        };
      }
      const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
      const finalThreadId = targetThreadId || "thread_unorganized";
      const now = nowISO();
      const newNote = await db.insert(Notes).values({
        id: generateNoteId(),
        title: inboxItem.title || null,
        content: inboxItem.content || "",
        threadId: finalThreadId,
        spaceId: targetSpaceId || null,
        simpleNoteId: nextSimpleNoteId,
        userId: auth.userId,
        isPublic: false,
        addedBy: "harvous",
        createdAt: now,
        lastVisited: now
      }).returning().get();
      await db.update(UserMetadata).set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      const isScriptureNote = newNote.noteType === "scripture";
      awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, newNote.content || "").catch(() => {
      });
      createdIds.noteIds.push(newNote.id);
    } else if (inboxItem.contentType === "thread") {
      const newThreadId = generateThreadId();
      const threadColor = convertInboxColorToThreadColor(inboxItem.color) || getRandomThreadColor();
      const threadNow = nowISO();
      const newThread = await db.insert(Threads).values({
        id: newThreadId,
        title: inboxItem.title,
        subtitle: inboxItem.subtitle || null,
        spaceId: targetSpaceId || null,
        userId: auth.userId,
        isPublic: false,
        color: threadColor,
        createdAt: threadNow,
        updatedAt: threadNow,
        lastVisited: threadNow
      }).returning().get();
      awardThreadCreatedXP(auth.userId, newThreadId, newThread.title, newThread.subtitle || null).catch(() => {
      });
      createdIds.threadId = newThreadId;
      let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
      if (!userMetadata) {
        const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId))).orderBy(desc(Notes.simpleNoteId)).limit(1);
        const highestExistingId = existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0;
        const season = getCurrentSeason();
        await db.insert(UserMetadata).values({
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          currentSeason: season,
          createdAt: nowISO()
        });
        userMetadata = {
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          userColor: "paper",
          firstName: null,
          lastName: null,
          email: null,
          profileImageUrl: null,
          clerkDataUpdatedAt: null,
          churchName: null,
          churchCity: null,
          churchState: null,
          churchCountry: null,
          currentSeason: season,
          lastMonthlyVisit: null,
          churchAddedAt: null,
          createdAt: nowISO(),
          updatedAt: null
        };
      }
      const notes = inboxItem.notes || [];
      let currentSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
      const baseTimestamp = Date.now();
      for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex];
        const noteTimestamp = new Date(baseTimestamp + noteIndex).toISOString();
        const newNote = await db.insert(Notes).values({
          id: generateNoteId(),
          title: note.title || null,
          content: note.content,
          threadId: newThreadId,
          spaceId: targetSpaceId || null,
          simpleNoteId: currentSimpleNoteId,
          userId: auth.userId,
          isPublic: false,
          addedBy: "harvous",
          createdAt: noteTimestamp,
          lastVisited: noteTimestamp
        }).returning().get();
        const junctionId = `note-thread-${newNote.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        try {
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId: newNote.id,
            threadId: newThreadId,
            createdAt: nowISO()
          });
          const verifyJunction = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, newNote.id), eq(NoteThreads.threadId, newThreadId))).get();
          if (!verifyJunction) {
            console.error(`Junction entry verification failed: note ${newNote.id} -> thread ${newThreadId}`);
          }
        } catch (junctionError) {
          console.error(`Error creating junction entry for note ${newNote.id}:`, junctionError);
          throw new Error(`Failed to link note to thread: ${junctionError.message}`);
        }
        const isScriptureNote = newNote.noteType === "scripture";
        awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, newNote.content || "").catch(() => {
        });
        createdIds.noteIds.push(newNote.id);
        currentSimpleNoteId++;
      }
      await db.update(UserMetadata).set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, newThreadId), eq(Threads.userId, auth.userId)));
    }
    await db.update(UserInboxItems).set({ status: "added", addedAt: nowISO() }).where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));
    return c.json({
      success: true,
      message: inboxItem.contentType === "thread" ? "Thread added to your Harvous!" : "Note added to your Harvous!",
      createdIds
    });
  } catch (error) {
    console.error("Error adding inbox item to Harvous:", error);
    return c.json({ error: "Failed to add inbox item to Harvous", details: error.message }, 500);
  }
});
async function handleAutoArchive(c) {
  try {
    const authHeader = c.req.header("authorization");
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const fourteenDaysAgo = /* @__PURE__ */ new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);
    const fourteenDaysAgoISO = fourteenDaysAgo.toISOString();
    const conditions = [
      eq(UserInboxItems.status, "inbox"),
      eq(InboxItems.isActive, true),
      lt(UserInboxItems.createdAt, fourteenDaysAgoISO)
    ];
    if (isAuthenticated && !hasValidToken) {
      conditions.push(eq(UserInboxItems.userId, auth.userId));
    }
    const itemsToArchive = await db.select({ userInboxItem: UserInboxItems, inboxItem: InboxItems }).from(UserInboxItems).innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id)).where(and(...conditions));
    let archivedCount = 0;
    const errors = [];
    for (const { userInboxItem } of itemsToArchive) {
      try {
        await db.update(UserInboxItems).set({ status: "archived", archivedAt: nowISO() }).where(eq(UserInboxItems.id, userInboxItem.id));
        archivedCount++;
      } catch (error) {
        console.error(`Error archiving item ${userInboxItem.id}:`, error);
        errors.push(`Failed to archive ${userInboxItem.id}: ${error.message}`);
      }
    }
    return c.json({
      success: true,
      message: `Auto-archived ${archivedCount} item(s)`,
      archivedCount,
      errors: errors.length > 0 ? errors : void 0
    });
  } catch (error) {
    console.error("Error in auto-archive:", error);
    return c.json({ error: "Failed to auto-archive items", details: error.message }, 500);
  }
}
app6.post("/api/inbox/auto-archive", handleAutoArchive);
app6.get("/api/inbox/auto-archive", handleAutoArchive);
async function handleAutoDelete(c) {
  try {
    const authHeader = c.req.header("authorization");
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const thirtyDaysAgo = /* @__PURE__ */ new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
    const fortyFourDaysAgo = /* @__PURE__ */ new Date();
    fortyFourDaysAgo.setDate(fortyFourDaysAgo.getDate() - 44);
    fortyFourDaysAgo.setHours(0, 0, 0, 0);
    const fortyFourDaysAgoISO = fortyFourDaysAgo.toISOString();
    const backfillConditions = [
      eq(UserInboxItems.status, "archived"),
      isNull(UserInboxItems.archivedAt)
    ];
    if (isAuthenticated && !hasValidToken) {
      backfillConditions.push(eq(UserInboxItems.userId, auth.userId));
    }
    const itemsToBackfill = await db.select().from(UserInboxItems).where(and(...backfillConditions)).all();
    let backfilledCount = 0;
    for (const item of itemsToBackfill) {
      try {
        await db.update(UserInboxItems).set({ archivedAt: item.createdAt }).where(eq(UserInboxItems.id, item.id));
        backfilledCount++;
      } catch (error) {
        console.error(`Error backfilling archivedAt for item ${item.id}:`, error);
      }
    }
    const deleteConditions = [
      eq(UserInboxItems.status, "archived"),
      or(
        lt(UserInboxItems.archivedAt, thirtyDaysAgoISO),
        and(isNull(UserInboxItems.archivedAt), lt(UserInboxItems.createdAt, fortyFourDaysAgoISO))
      )
    ];
    if (isAuthenticated && !hasValidToken) {
      deleteConditions.push(eq(UserInboxItems.userId, auth.userId));
    }
    const itemsToDelete = await db.select().from(UserInboxItems).where(and(...deleteConditions)).all();
    let deletedCount = 0;
    const errors = [];
    for (const userInboxItem of itemsToDelete) {
      try {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting archived item ${userInboxItem.id}:`, error);
        errors.push(`Failed to delete ${userInboxItem.id}: ${error.message}`);
      }
    }
    return c.json({
      success: true,
      message: `Auto-deleted ${deletedCount} archived item(s)`,
      deletedCount,
      backfilledCount: backfilledCount > 0 ? backfilledCount : void 0,
      errors: errors.length > 0 ? errors : void 0
    });
  } catch (error) {
    console.error("Error in auto-delete:", error);
    return c.json({ error: "Failed to auto-delete archived items", details: error.message }, 500);
  }
}
app6.post("/api/inbox/auto-delete", handleAutoDelete);
app6.get("/api/inbox/auto-delete", handleAutoDelete);
app6.post("/api/inbox/assign-to-users", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const allInboxItems = await db.select().from(InboxItems).where(eq(InboxItems.isActive, true)).all();
    const allUsers = await db.select().from(UserMetadata).all();
    let totalAssigned = 0;
    const results = [];
    for (const inboxItem of allInboxItems) {
      if (inboxItem.targetAudience !== "all_users") continue;
      let assignedCount = 0;
      for (const user of allUsers) {
        const existing = await db.select().from(UserInboxItems).where(and(eq(UserInboxItems.userId, user.userId), eq(UserInboxItems.inboxItemId, inboxItem.id))).get();
        if (!existing) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItem.id}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItem.id,
            status: "inbox",
            createdAt: nowISO()
          });
          assignedCount++;
        }
      }
      if (assignedCount > 0) {
        results.push(`${inboxItem.title}: assigned to ${assignedCount} user(s)`);
        totalAssigned += assignedCount;
      }
    }
    return c.json({
      success: true,
      message: "Assigned inbox items to users",
      totalAssigned,
      itemsProcessed: allInboxItems.length,
      usersProcessed: allUsers.length,
      results
    });
  } catch (error) {
    console.error("Error assigning inbox items:", error);
    return c.json({ error: "Failed to assign inbox items", details: error.message }, 500);
  }
});
app6.post("/api/inbox/reset-all-users", async (c) => {
  try {
    const authHeader = c.req.header("authorization");
    const expectedToken = process.env.INBOX_RESET_SECRET_TOKEN;
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const allUserInboxItems = await db.select().from(UserInboxItems).all();
    let clearedCount = 0;
    for (const userInboxItem of allUserInboxItems) {
      try {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
        clearedCount++;
      } catch (error) {
        console.error(`Error deleting UserInboxItem ${userInboxItem.id}:`, error);
      }
    }
    const allInboxItems = await db.select().from(InboxItems).all();
    let verifiedCount = 0;
    let markedInactiveCount = 0;
    const validItems = [];
    const invalidItems = [];
    for (const inboxItem of allInboxItems) {
      if (!inboxItem.webflowItemId) {
        try {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: "No webflowItemId" });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
        continue;
      }
      const verification = await verifyInboxItemInWebflow(inboxItem.webflowItemId);
      verifiedCount++;
      if (!verification.isValid) {
        try {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: verification.reason || "Invalid" });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
      } else {
        if (!inboxItem.isActive) {
          await db.update(InboxItems).set({ isActive: true, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
        }
        validItems.push(inboxItem.id);
      }
    }
    const allUsers = await db.select().from(UserMetadata).all();
    let totalAssigned = 0;
    const assignmentResults = [];
    for (const inboxItemId of validItems) {
      const inboxItem = await db.select().from(InboxItems).where(eq(InboxItems.id, inboxItemId)).get();
      if (!inboxItem || inboxItem.targetAudience !== "all_users") continue;
      let assignedCount = 0;
      for (const user of allUsers) {
        try {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId,
            status: "inbox",
            createdAt: nowISO()
          });
          assignedCount++;
          totalAssigned++;
        } catch (_error) {
        }
      }
      if (assignedCount > 0) {
        assignmentResults.push(`${inboxItem.title || inboxItemId}: assigned to ${assignedCount} user(s)`);
      }
    }
    return c.json({
      success: true,
      message: "Clean reset completed",
      summary: {
        clearedUserInboxItems: clearedCount,
        verifiedItems: verifiedCount,
        validItems: validItems.length,
        markedInactive: markedInactiveCount,
        totalUsers: allUsers.length,
        totalAssigned
      },
      invalidItems: invalidItems.slice(0, 20),
      assignmentResults: assignmentResults.slice(0, 20)
    });
  } catch (error) {
    console.error("Error during clean reset:", error);
    return c.json({ error: "Failed to reset inbox items", details: error.message }, 500);
  }
});
app6.get("/api/inbox/reset-all-users", async (c) => {
  return c.json({
    message: "Use POST method to reset inbox items",
    endpoint: "/api/inbox/reset-all-users",
    method: "POST",
    note: "Optional: Set INBOX_RESET_SECRET_TOKEN environment variable for authentication"
  });
});
var inbox_default = app6;

// server/routes/webflow.ts
init_db();
init_dates();
import { Hono as Hono18 } from "hono";
var app7 = new Hono18();
var COLOR_MAP = {
  "blue": "blessed-blue",
  "yellow": "graceful-gold",
  "orange": "pleasant-peach",
  "pink": "peaceful-pink",
  "purple": "lovely-lavender",
  "green": "mindful-mint",
  "paper": "paper"
};
var THREADS_COLLECTION_ID = "690ed2f0edd9bab40a4eb397";
async function transformWebflowItem(item, webflowToken) {
  const transformed = {
    _id: item.id,
    "is-draft": item.isDraft || false,
    "published-on": item.lastPublished || void 0
  };
  transformed["content-type"] = "thread";
  if (item.fieldData) {
    transformed.title = item.fieldData.name;
    let rawContent = item.fieldData.content || item.fieldData["Content"] || item.fieldData["content-html"] || item.fieldData["content-html-2"] || item.fieldData.description || item.fieldData.body || null;
    if (rawContent && typeof rawContent === "object") {
      rawContent = rawContent.html || rawContent.richText || rawContent.content || JSON.stringify(rawContent);
    }
    transformed.content = rawContent;
    if (item.fieldData["color-2"]) {
      try {
        const colorResponse = await fetch(
          `https://api.webflow.com/v2/collections/6915354840aef29a7530463c/items/${item.fieldData["color-2"]}`,
          {
            headers: {
              "Authorization": `Bearer ${webflowToken}`,
              "Accept-Version": "1.0.0"
            }
          }
        );
        if (colorResponse.ok) {
          const colorData = await colorResponse.json();
          const colorItem = colorData.items?.[0] || colorData;
          const colorSlug = colorItem.fieldData?.slug || colorItem.fieldData?.name?.toLowerCase();
          transformed.color = COLOR_MAP[colorSlug] || "blessed-blue";
        }
      } catch (error) {
        console.error("Error fetching color:", error);
        transformed.color = "blessed-blue";
      }
    }
    if (item.fieldData.notes && Array.isArray(item.fieldData.notes)) {
      transformed["thread-notes"] = item.fieldData.notes;
    }
    if (item.fieldData.image) {
      if (typeof item.fieldData.image === "string") {
        transformed["image-url"] = item.fieldData.image;
      } else if (item.fieldData.image.url) {
        transformed["image-url"] = item.fieldData.image.url;
      }
    }
    let threadTypeField = null;
    if (item.fieldData["thread-type"]) {
      threadTypeField = item.fieldData["thread-type"];
    } else if (item.fieldData.threadType) {
      threadTypeField = item.fieldData.threadType;
    } else if (item.fieldData["Thread Type"]) {
      threadTypeField = item.fieldData["Thread Type"];
    } else {
      const fieldKeys = Object.keys(item.fieldData);
      const threadTypeKey = fieldKeys.find(
        (key) => key.toLowerCase().includes("thread") && key.toLowerCase().includes("type")
      );
      if (threadTypeKey) {
        threadTypeField = item.fieldData[threadTypeKey];
      }
    }
    if (threadTypeField) {
      if (typeof threadTypeField === "object" && threadTypeField !== null) {
        transformed["thread-type"] = "Default";
      } else if (typeof threadTypeField === "string" && threadTypeField.trim() !== "") {
        transformed["thread-type"] = "Default";
      }
    }
    transformed["target-audience"] = "all_users";
    transformed["is-active"] = !item.isArchived;
  }
  return transformed;
}
async function upsertInboxItem(webflowItem, webflowToken) {
  const webflowItemId = webflowItem._id;
  let imageUrl;
  if (webflowItem["image-url"]) {
    if (typeof webflowItem["image-url"] === "string") {
      imageUrl = webflowItem["image-url"];
    } else if (webflowItem["image-url"]?.url) {
      imageUrl = webflowItem["image-url"].url;
    }
  }
  const existingItem = await db.select().from(InboxItems).where(eq(InboxItems.webflowItemId, webflowItemId)).get();
  const inboxItemId = existingItem?.id || `inbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  if (existingItem) {
    await db.update(InboxItems).set({
      webflowItemId,
      contentType: "thread",
      title: webflowItem.title || "Untitled",
      subtitle: webflowItem.subtitle || null,
      content: webflowItem.content || null,
      imageUrl: imageUrl || null,
      color: webflowItem.color || null,
      threadType: webflowItem["thread-type"] || null,
      targetAudience: webflowItem["target-audience"] || "all_users",
      isActive: webflowItem["is-active"] !== false,
      updatedAt: nowISO()
    }).where(eq(InboxItems.id, inboxItemId));
  } else {
    await db.insert(InboxItems).values({
      id: inboxItemId,
      webflowItemId,
      contentType: "thread",
      title: webflowItem.title || "Untitled",
      subtitle: webflowItem.subtitle || null,
      content: webflowItem.content || null,
      imageUrl: imageUrl || null,
      color: webflowItem.color || null,
      threadType: webflowItem["thread-type"] || null,
      targetAudience: webflowItem["target-audience"] || "all_users",
      isActive: webflowItem["is-active"] !== false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    });
  }
  if (webflowItem["thread-notes"] && Array.isArray(webflowItem["thread-notes"])) {
    await db.delete(InboxItemNotes).where(eq(InboxItemNotes.inboxItemId, inboxItemId));
    const notesCollectionId = "690ed346b73a1ff102283b32";
    const noteItems = await Promise.all(
      webflowItem["thread-notes"].map(async (noteId, index2) => {
        try {
          const noteResponse = await fetch(
            `https://api.webflow.com/v2/collections/${notesCollectionId}/items/${noteId}`,
            {
              headers: {
                "Authorization": `Bearer ${webflowToken}`,
                "Accept-Version": "1.0.0"
              }
            }
          );
          if (noteResponse.ok) {
            const noteData = await noteResponse.json();
            const note = noteData.items?.[0] || noteData;
            return { title: note.fieldData?.name || null, content: note.fieldData?.content || "", order: index2 };
          }
        } catch (error) {
          console.error(`Error fetching note ${noteId}:`, error);
        }
        return { title: null, content: "", order: index2 };
      })
    );
    for (let i = 0; i < noteItems.length; i++) {
      const note = noteItems[i];
      await db.insert(InboxItemNotes).values({
        id: `inbox_note_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
        inboxItemId,
        title: note.title || null,
        content: note.content || "",
        order: note.order || i,
        createdAt: nowISO()
      });
    }
  }
  const targetAudience = webflowItem["target-audience"] || "all_users";
  if (targetAudience === "all_users") {
    try {
      const allUsers = await db.select().from(UserMetadata).all();
      for (const user of allUsers) {
        const existingUserInboxItem = await db.select().from(UserInboxItems).where(and(eq(UserInboxItems.userId, user.userId), eq(UserInboxItems.inboxItemId, inboxItemId))).get();
        if (!existingUserInboxItem) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId,
            status: "inbox",
            createdAt: nowISO()
          });
        }
      }
    } catch (assignError) {
      console.error(`Error assigning inbox item ${inboxItemId} to users:`, assignError);
    }
  }
  return inboxItemId;
}
async function markInactiveByWebflowId(webflowItemId) {
  const existingItem = await db.select().from(InboxItems).where(eq(InboxItems.webflowItemId, webflowItemId)).get();
  if (existingItem) {
    await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, existingItem.id));
    return true;
  }
  return false;
}
function normalizeWebflowPayload(rawPayload) {
  if (rawPayload.payload) {
    const payload = rawPayload.payload;
    if (payload.item) {
      return {
        triggerType: rawPayload.triggerType,
        collection: payload.collectionId || rawPayload.collection || "",
        site: payload.siteId || rawPayload.site || rawPayload.siteId || "",
        item: {
          ...payload.item,
          cmsLocaleId: payload.item.cmsLocaleId || "",
          lastUpdated: payload.item.lastUpdated || (/* @__PURE__ */ new Date()).toISOString(),
          createdOn: payload.item.createdOn || (/* @__PURE__ */ new Date()).toISOString(),
          isArchived: payload.item.isArchived || false,
          isDraft: payload.item.isDraft || false,
          fieldData: payload.item.fieldData || {}
        }
      };
    } else if (payload.id) {
      return {
        triggerType: rawPayload.triggerType,
        collection: payload.collectionId || rawPayload.collection || "",
        site: payload.siteId || rawPayload.site || rawPayload.siteId || "",
        item: {
          id: payload.id,
          cmsLocaleId: "",
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
          createdOn: (/* @__PURE__ */ new Date()).toISOString(),
          isArchived: false,
          isDraft: false,
          fieldData: {}
        }
      };
    }
  }
  if (rawPayload.item) {
    return {
      triggerType: rawPayload.triggerType,
      collection: rawPayload.collection || rawPayload.collectionId || "",
      site: rawPayload.site || rawPayload.siteId || "",
      item: rawPayload.item
    };
  }
  return {
    triggerType: rawPayload.triggerType,
    collection: rawPayload.collection || rawPayload.collectionId || "",
    site: rawPayload.site || rawPayload.siteId || "",
    item: {
      id: "",
      cmsLocaleId: "",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      createdOn: (/* @__PURE__ */ new Date()).toISOString(),
      isArchived: false,
      isDraft: false,
      fieldData: {}
    }
  };
}
async function handleSyncInbox(c, items, collectionId, siteId, hardRefresh) {
  const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
  if (!webflowToken) {
    return c.json({ error: "Webflow API token not configured" }, 500);
  }
  if (collectionId === "690ed346b73a1ff102283b32") {
    return c.json({ error: "Notes collection sync is not supported. Only Threads collection can be synced to inbox." }, 400);
  }
  if (hardRefresh === true) {
    try {
      const allUserInboxItems = await db.select().from(UserInboxItems).all();
      for (const userInboxItem of allUserInboxItems) {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
      }
      const allInboxItems = await db.select().from(InboxItems).all();
      for (const inboxItem of allInboxItems) {
        await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
      }
    } catch (error) {
      console.error("Error during hard refresh cleanup:", error);
    }
  }
  let webflowNativeItems = items || [];
  if (!items && collectionId && siteId) {
    const response = await fetch(
      `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
      {
        headers: {
          "Authorization": `Bearer ${webflowToken}`,
          "Accept-Version": "1.0.0"
        }
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Webflow API error:", errorText);
      return c.json({ error: "Failed to fetch from Webflow API", details: errorText }, response.status);
    }
    const data = await response.json();
    webflowNativeItems = data.items || [];
  }
  const webflowItems = await Promise.all(
    webflowNativeItems.filter((item) => item.fieldData?.active === true).map(async (item) => {
      const transformed = await transformWebflowItem(
        { id: item.id, fieldData: item.fieldData, isDraft: item.isDraft, lastPublished: item.lastPublished, isArchived: item.isArchived },
        webflowToken
      );
      return transformed;
    })
  );
  if (!webflowItems || webflowItems.length === 0) {
    return c.json({ error: "No items provided" }, 400);
  }
  const syncedItems = [];
  const errors = [];
  const verificationResults = { checked: 0, markedInactive: 0, reactivated: 0, details: [] };
  try {
    const allInboxItems = await db.select().from(InboxItems).all();
    verificationResults.checked = allInboxItems.length;
    for (const inboxItem of allInboxItems) {
      if (!inboxItem.webflowItemId) continue;
      try {
        const verifyResponse = await fetch(
          `https://api.webflow.com/v2/collections/${collectionId}/items/${inboxItem.webflowItemId}`,
          { headers: { "Authorization": `Bearer ${webflowToken}`, "Accept-Version": "1.0.0" } }
        );
        if (verifyResponse.status === 404) {
          if (inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.markedInactive++;
            verificationResults.details.push(`Deleted: ${inboxItem.title || inboxItem.id}`);
          }
        } else if (verifyResponse.ok) {
          const itemData = await verifyResponse.json();
          const fullItem = itemData.items?.[0] || itemData.item || itemData;
          const isDraft = fullItem.isDraft || !fullItem.lastPublished;
          const isArchived = fullItem.isArchived || false;
          const toggleOff = fullItem.fieldData?.active !== true;
          if ((isDraft || isArchived || toggleOff) && inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.markedInactive++;
            const reason = isDraft ? "draft" : isArchived ? "archived" : "toggle off";
            verificationResults.details.push(`${reason}: ${inboxItem.title || inboxItem.id}`);
          } else if (!isDraft && !isArchived && !toggleOff && !inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: true, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.reactivated++;
            verificationResults.details.push(`Reactivated: ${inboxItem.title || inboxItem.id}`);
          }
        }
      } catch (error) {
        console.error(`Error verifying item ${inboxItem.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error during inbox verification:", error);
  }
  for (const webflowItem of webflowItems) {
    try {
      if (webflowItem["is-draft"] || !webflowItem["published-on"]) continue;
      if ((webflowItem["content-type"] || "thread") !== "thread") {
        errors.push(`Invalid content type for item ${webflowItem._id}. Only threads are supported.`);
        continue;
      }
      const inboxItemId = await upsertInboxItem(webflowItem, webflowToken);
      syncedItems.push(inboxItemId);
    } catch (error) {
      console.error(`Error syncing item ${webflowItem._id}:`, error);
      errors.push(`Failed to sync item ${webflowItem._id}: ${error.message}`);
    }
  }
  const result = {
    success: true,
    synced: syncedItems.length,
    items: syncedItems,
    verification: {
      checked: verificationResults.checked,
      markedInactive: verificationResults.markedInactive,
      reactivated: verificationResults.reactivated,
      details: verificationResults.details
    },
    errors: errors.length > 0 ? errors : void 0,
    message: `Synced ${syncedItems.length} item(s). Verified ${verificationResults.checked} existing items: ${verificationResults.markedInactive} marked inactive, ${verificationResults.reactivated} reactivated.`
  };
  const acceptHeader = c.req.header("accept") || "";
  if (acceptHeader.includes("text/html")) {
    const html = `<!DOCTYPE html><html><head><title>Inbox Sync Complete</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:50px auto;padding:20px}.success{color:#059669}.info{background:#f0f9ff;padding:15px;border-radius:8px;margin:20px 0}.details{background:#f9fafb;padding:10px;border-radius:6px;margin:10px 0}ul{margin:10px 0;padding-left:20px}.error{color:#dc2626}</style></head><body><h1 class="success">Inbox Sync Complete</h1><div class="info"><h2>Summary</h2><p><strong>Synced:</strong> ${result.synced} item(s)</p><p><strong>Verified:</strong> ${result.verification.checked} existing items</p><p><strong>Marked Inactive:</strong> ${result.verification.markedInactive} item(s)</p><p><strong>Reactivated:</strong> ${result.verification.reactivated} item(s)</p></div>${result.verification.details.length > 0 ? `<div class="details"><h3>Details:</h3><ul>${result.verification.details.map((d) => `<li>${d}</li>`).join("")}</ul></div>` : ""}${result.errors && result.errors.length > 0 ? `<div class="error"><h3>Errors:</h3><ul>${result.errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>` : ""}<p><a href="/">Back to Dashboard</a></p></body></html>`;
    return c.html(html);
  }
  return c.json(result);
}
app7.post("/api/webflow/sync-inbox", async (c) => {
  try {
    const body = await c.req.json();
    const { items, collectionId, siteId, hardRefresh } = body;
    return handleSyncInbox(c, items, collectionId, siteId, hardRefresh);
  } catch (error) {
    console.error("Error syncing inbox items:", error);
    return c.json({ error: "Failed to sync inbox items", details: error.message }, 500);
  }
});
app7.get("/api/webflow/sync-inbox", async (c) => {
  try {
    const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
    if (!webflowToken) {
      return c.json({ error: "Webflow API token not configured" }, 500);
    }
    const collectionId = c.req.query("collectionId");
    const siteId = c.req.query("siteId");
    const hardRefresh = c.req.query("hardRefresh") === "true";
    if (!collectionId || !siteId) {
      return c.json({ error: "collectionId and siteId are required" }, 400);
    }
    if (collectionId === "690ed346b73a1ff102283b32") {
      return c.json({ error: "Notes collection sync is not supported. Only Threads collection can be synced to inbox." }, 400);
    }
    const response = await fetch(
      `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
      { headers: { "Authorization": `Bearer ${webflowToken}`, "Accept-Version": "1.0.0" } }
    );
    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: "Failed to fetch from Webflow API", details: errorText }, response.status);
    }
    const data = await response.json();
    const items = data.items || [];
    return handleSyncInbox(c, items, collectionId, siteId, hardRefresh);
  } catch (error) {
    console.error("Error fetching from Webflow:", error);
    return c.json({ error: "Failed to fetch from Webflow", details: error.message }, 500);
  }
});
app7.post("/api/webflow/webhook", async (c) => {
  try {
    const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
    const webflowWebhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;
    if (!webflowToken) {
      console.error("Webflow API token not configured");
      return c.json({ error: "Webflow API token not configured" }, 500);
    }
    const rawBody = await c.req.text();
    if (webflowWebhookSecret) {
      const signature = c.req.header("x-webflow-signature");
      if (!signature) {
        console.error("Webhook signature missing");
        return c.json({ error: "Missing webhook signature" }, 401);
      }
      const secrets = webflowWebhookSecret.split(",").map((s) => s.trim()).filter((s) => s);
      const crypto3 = await import("crypto");
      const receivedSignature = signature.replace("sha256=", "");
      let signatureValid = false;
      for (const secret of secrets) {
        const expectedSignature = crypto3.createHmac("sha256", secret).update(rawBody).digest("hex");
        if (receivedSignature === expectedSignature) {
          signatureValid = true;
          break;
        }
      }
      if (!signatureValid) {
        console.error("Webhook signature verification failed");
      }
    }
    let rawPayload;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("Failed to parse webhook payload:", parseError.message);
      return c.json({ error: "Invalid JSON payload", details: parseError.message }, 400);
    }
    let normalizedPayload = normalizeWebflowPayload(rawPayload);
    const hasEmptyFieldData = !normalizedPayload.item.fieldData || Object.keys(normalizedPayload.item.fieldData || {}).length === 0;
    if (normalizedPayload.item.id && hasEmptyFieldData) {
      try {
        const itemResponse = await fetch(
          `https://api.webflow.com/v2/collections/${normalizedPayload.collection}/items/${normalizedPayload.item.id}`,
          { headers: { "Authorization": `Bearer ${webflowToken}`, "Accept-Version": "1.0.0" } }
        );
        if (itemResponse.ok) {
          const itemData = await itemResponse.json();
          const fullItem = itemData.items?.[0] || itemData.item || itemData;
          normalizedPayload.item = {
            id: fullItem.id || normalizedPayload.item.id,
            cmsLocaleId: fullItem.cmsLocaleId || "",
            lastPublished: fullItem.lastPublished,
            lastUpdated: fullItem.lastUpdated || (/* @__PURE__ */ new Date()).toISOString(),
            createdOn: fullItem.createdOn || (/* @__PURE__ */ new Date()).toISOString(),
            isArchived: fullItem.isArchived || false,
            isDraft: fullItem.isDraft || false,
            fieldData: fullItem.fieldData || {}
          };
        } else if (itemResponse.status === 404) {
          const found = await markInactiveByWebflowId(normalizedPayload.item.id);
          return c.json({ message: "Item deleted - marked as inactive", itemId: normalizedPayload.item.id, found });
        } else {
          console.error("Failed to fetch item from Webflow API:", itemResponse.status);
        }
      } catch (error) {
        console.error("Error fetching item from Webflow API:", error);
      }
    }
    if (normalizedPayload.collection !== THREADS_COLLECTION_ID) {
      return c.json({ message: "Ignored - not from Threads collection", collection: normalizedPayload.collection });
    }
    if (normalizedPayload.triggerType === "collection_item.unpublished" || normalizedPayload.triggerType === "collection_item.deleted") {
      if (normalizedPayload.item?.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({
        message: "Item marked as inactive",
        triggerType: normalizedPayload.triggerType,
        itemId: normalizedPayload.item?.id
      });
    }
    if (normalizedPayload.item?.isArchived) {
      if (normalizedPayload.item.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({ message: "Item archived - marked as inactive", itemId: normalizedPayload.item?.id });
    }
    if (!normalizedPayload.item?.fieldData?.active) {
      if (normalizedPayload.item?.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({ message: "Toggle not enabled - marked as inactive if existed", itemId: normalizedPayload.item?.id });
    }
    if (!normalizedPayload.item || normalizedPayload.item.isDraft || !normalizedPayload.item.lastPublished) {
      if (normalizedPayload.item?.id) {
        const existingItem = await db.select().from(InboxItems).where(eq(InboxItems.webflowItemId, normalizedPayload.item.id)).get();
        if (existingItem && existingItem.isActive) {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, existingItem.id));
        }
      }
      return c.json({ message: "Ignored - item is draft or not published", itemId: normalizedPayload.item?.id });
    }
    const webflowItem = await transformWebflowItem(
      {
        id: normalizedPayload.item.id,
        fieldData: normalizedPayload.item.fieldData,
        isDraft: normalizedPayload.item.isDraft,
        lastPublished: normalizedPayload.item.lastPublished,
        isArchived: normalizedPayload.item.isArchived
      },
      webflowToken
    );
    if (!webflowItem) {
      return c.json({ success: false, message: "Failed to transform item" });
    }
    if (webflowItem["is-draft"] || !webflowItem["published-on"]) {
      return c.json({ success: false, message: "Item is draft or not published" });
    }
    const syncedId = await upsertInboxItem(webflowItem, webflowToken);
    return c.json({
      success: true,
      message: "Webhook processed",
      triggerType: normalizedPayload.triggerType,
      itemId: normalizedPayload.item.id,
      synced: !!syncedId,
      note: syncedId ? "Item synced to inbox" : "Item processing failed"
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return c.json({ error: "Failed to process webhook", details: error.message }, 500);
  }
});
var webflow_default = app7;

// server/routes/webhooks.ts
import { Hono as Hono19 } from "hono";
import { verifyWebhook } from "@clerk/backend/webhooks";

// src/utils/audienceful.ts
var AUDIENCEFUL_API_BASE = "https://app.audienceful.com/api";
function getApiKey() {
  const apiKey = import.meta.env.AUDIENCEFUL_API_KEY;
  if (!apiKey) {
    throw new Error("AUDIENCEFUL_API_KEY environment variable is not set");
  }
  return apiKey;
}
async function audiencefulRequest(endpoint, method, body) {
  const apiKey = getApiKey();
  const url = `${AUDIENCEFUL_API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json"
    },
    timeout: 1e4,
    // 10 second timeout
    retries: 2
  };
  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Audienceful API error (${response.status}): ${errorText}`
    );
  }
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  return null;
}
async function findSubscriberByEmail(email) {
  try {
    const response = await audiencefulRequest(
      `/people/?email=${encodeURIComponent(email)}`,
      "GET"
    );
    if (response && response.results && Array.isArray(response.results)) {
      return response.results.length > 0 ? response.results[0] : null;
    }
    if (response && response.email === email) {
      return response;
    }
    return null;
  } catch (error) {
    if (error.message.includes("404")) {
      return null;
    }
    throw error;
  }
}
async function createSubscriber(data) {
  return await audiencefulRequest("/people/", "POST", data);
}
async function updateSubscriber(email, data) {
  const updateData = {
    email,
    ...data
  };
  return await audiencefulRequest("/people/", "PATCH", updateData);
}
function tagsToString(tags) {
  if (!tags || tags.length === 0) return "";
  return tags.map((t) => t.name).join(", ");
}
async function tagAsAppUser(email, clerkUserId, firstName, lastName) {
  console.log("[Audienceful] Starting tagAsAppUser:", {
    email,
    clerkUserId,
    firstName: firstName || null,
    lastName: lastName || null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    const apiKey = import.meta.env.AUDIENCEFUL_API_KEY;
    if (!apiKey) {
      throw new Error("AUDIENCEFUL_API_KEY environment variable is not set");
    }
  } catch (error) {
    console.error("[Audienceful] API key not configured:", {
      error: error.message,
      email,
      clerkUserId
    });
    throw error;
  }
  const existing = await findSubscriberByEmail(email);
  const extraData = {
    clerk_user_id: clerkUserId
  };
  if (firstName) extraData.first_name = firstName;
  if (lastName) extraData.last_name = lastName;
  if (existing && existing.id) {
    const existingTagsString = tagsToString(existing.tags);
    console.log("[Audienceful] Updating existing subscriber:", {
      email,
      existingId: existing.id,
      existingTags: existingTagsString,
      newTags: "User"
    });
    const mergedExtraData = {
      ...existing.extra_data,
      ...extraData
    };
    try {
      const result = await updateSubscriber(email, {
        tags: "User",
        // Replace with just "User" tag, removing any existing tags
        extra_data: mergedExtraData
      });
      console.log("[Audienceful] Successfully updated subscriber:", {
        email,
        audiencefulId: result.id || result.uid,
        tags: "User"
      });
      return result;
    } catch (error) {
      if (error.message && error.message.includes("404")) {
        console.log("[Audienceful] Subscriber not found during update, creating new:", {
          email
        });
        const result = await createSubscriber({
          email,
          tags: "User",
          // Just "User" tag for new subscribers
          extra_data: mergedExtraData,
          double_opt_in: "not_required",
          trigger_automations: false
        });
        console.log("[Audienceful] Successfully created subscriber (fallback):", {
          email,
          audiencefulId: result.id || result.uid
        });
        return result;
      }
      throw error;
    }
  } else {
    console.log("[Audienceful] Creating new subscriber:", {
      email,
      tags: "User"
    });
    const result = await createSubscriber({
      email,
      tags: "User",
      extra_data: extraData,
      double_opt_in: "not_required",
      trigger_automations: false
    });
    console.log("[Audienceful] Successfully created subscriber:", {
      email,
      audiencefulId: result.id || result.uid
    });
    return result;
  }
}

// server/routes/webhooks.ts
var app8 = new Hono19();
function getPrimaryEmail(event) {
  const { data } = event;
  if (!data.email_addresses || data.email_addresses.length === 0) return null;
  if (data.primary_email_address_id) {
    const primaryEmail = data.email_addresses.find((email) => email.id === data.primary_email_address_id);
    if (primaryEmail) return primaryEmail.email_address;
  }
  return data.email_addresses[0].email_address;
}
async function handleEmailCreated(event) {
  try {
    console.log(`[Webhook] Processing ${event.type} event`);
    if (!event.data) throw new Error("Event data is missing");
    const email_address = event.data.email_address;
    const user_id = event.data.user_id;
    if (!email_address) {
      console.error("[Webhook] Event missing email_address");
      return;
    }
    if (!user_id) {
      console.error("[Webhook] Event missing user_id");
      return;
    }
    try {
      const { createClerkClient: createClerkClient3 } = await import("@clerk/backend");
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (!clerkSecretKey) {
        console.error("[Webhook] CLERK_SECRET_KEY not configured");
        await tagAsAppUser(email_address, user_id);
        return;
      }
      const clerkClient = createClerkClient3({ secretKey: clerkSecretKey });
      const user = await clerkClient.users.getUser(user_id);
      const firstName = user.firstName || void 0;
      const lastName = user.lastName || void 0;
      try {
        const result = await tagAsAppUser(email_address, user_id, firstName, lastName);
        console.log("[Webhook] Tagged user in Audienceful (emailAddress.created):", {
          email: email_address,
          clerkUserId: user_id,
          audiencefulId: result.id || result.uid
        });
      } catch (error) {
        console.error("[Webhook] Failed to tag user in Audienceful (emailAddress.created):", error.message);
        handleAPIError(error, { endpoint: "/api/webhooks/clerk", action: "tag_audienceful_user", userId: user_id, email: email_address });
      }
    } catch (error) {
      console.error("[Webhook] Failed to fetch user details from Clerk:", error.message);
      try {
        await tagAsAppUser(email_address, user_id);
        console.log("[Webhook] Tagged user in Audienceful (fallback, no name)");
      } catch (audiencefulError) {
        console.error("[Webhook] Failed to tag user in Audienceful (fallback):", audiencefulError.message);
        handleAPIError(audiencefulError, { endpoint: "/api/webhooks/clerk", action: "tag_audienceful_user_fallback", userId: user_id, email: email_address });
      }
    }
  } catch (error) {
    console.error("[Webhook] Error in handleEmailCreated:", error.message);
    throw error;
  }
}
async function handleUserCreated(event) {
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);
  console.log("[Webhook] Processing user.created event:", { clerkUserId, email: email || "NO_EMAIL" });
  if (!email) {
    console.warn("[Webhook] User has no email address, skipping Audienceful sync");
    return;
  }
  try {
    const result = await tagAsAppUser(email, clerkUserId, first_name || void 0, last_name || void 0);
    console.log("[Webhook] Tagged user in Audienceful:", { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error) {
    console.error("[Webhook] Failed to tag user in Audienceful:", error.message);
    handleAPIError(error, { endpoint: "/api/webhooks/clerk", action: "tag_audienceful_user", userId: clerkUserId, email });
  }
}
async function handleUserUpdated(event) {
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);
  console.log("[Webhook] Processing user.updated event:", { clerkUserId, email: email || "NO_EMAIL" });
  if (!email) {
    console.log("[Webhook] User has no email, skipping Audienceful update");
    return;
  }
  try {
    const result = await tagAsAppUser(email, clerkUserId, first_name || void 0, last_name || void 0);
    console.log("[Webhook] Updated user in Audienceful:", { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error) {
    console.error("[Webhook] Failed to update user in Audienceful:", error.message);
    handleAPIError(error, { endpoint: "/api/webhooks/clerk", action: "update_audienceful_user", userId: clerkUserId, email });
  }
}
async function handleUserDeleted(event) {
  console.log("User deleted in Clerk:", event.data.id);
}
app8.post("/api/webhooks/clerk", async (c) => {
  const startTime = Date.now();
  try {
    console.log("[Webhook] Webhook request received:", {
      method: c.req.method,
      url: c.req.url,
      headers: {
        "svix-id": c.req.header("svix-id") || "MISSING",
        "svix-timestamp": c.req.header("svix-timestamp") || "MISSING",
        "svix-signature": c.req.header("svix-signature") ? "PRESENT" : "MISSING"
      }
    });
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Webhook] CLERK_WEBHOOK_SECRET not configured");
      return c.json({ error: "Webhook secret not configured" }, 500);
    }
    const audiencefulKey = process.env.AUDIENCEFUL_API_KEY;
    if (!audiencefulKey) {
      console.warn("[Webhook] AUDIENCEFUL_API_KEY not configured");
    }
    let event;
    try {
      event = await verifyWebhook(c.req.raw, { signingSecret: webhookSecret });
      console.log("[Webhook] Signature verification successful:", { eventType: event.type });
    } catch (error) {
      console.error("[Webhook] Signature verification failed:", error.message);
      return c.json({ error: "Invalid webhook signature" }, 401);
    }
    let userId;
    try {
      if (event.type === "emailAddress.created") {
        userId = event.data.user_id || "";
      } else {
        userId = event.data.id || "";
      }
    } catch (error) {
      console.error("[Webhook] Error extracting userId:", error.message);
      throw error;
    }
    console.log("[Webhook] Received event:", { type: event.type, userId });
    try {
      switch (event.type) {
        case "emailAddress.created":
          await handleEmailCreated(event);
          break;
        case "user.created":
          await handleUserCreated(event);
          break;
        case "user.updated":
          await handleUserUpdated(event);
          break;
        case "user.deleted":
          await handleUserDeleted(event);
          break;
        default:
          console.log("[Webhook] Unhandled event type:", event.type);
      }
    } catch (error) {
      console.error("[Webhook] Error processing event (webhook will still succeed):", {
        eventType: event.type,
        error: error.message
      });
      let errorUserId;
      try {
        if (event.type === "emailAddress.created") {
          errorUserId = event.data?.user_id || "unknown";
        } else {
          errorUserId = event.data?.id || "unknown";
        }
      } catch (_extractError) {
        errorUserId = "unknown";
      }
      handleAPIError(error, { endpoint: "/api/webhooks/clerk", action: `process_${event.type}`, userId: errorUserId });
    }
    const duration = Date.now() - startTime;
    console.log("[Webhook] Complete:", { eventType: event.type, durationMs: duration });
    return c.json({ message: "Webhook processed successfully", eventType: event.type });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[Webhook] Error in webhook processing:", { error: error.message, durationMs: duration });
    if (error.message?.includes("signature") || error.message?.includes("Unauthorized")) {
      return c.json({ error: error.message || "Invalid webhook signature" }, 401);
    }
    return c.json({ error: "Internal server error", message: error?.message || "An unexpected error occurred" }, 500);
  }
});
var webhooks_default = app8;

// server/routes/sync.ts
import { Hono as Hono20 } from "hono";
init_db();
init_dates();
init_ids();
var app9 = new Hono20();
async function processSpaceMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const newSpace = await db.insert(Spaces).values({
      id: entityId.startsWith("local_") ? generateSpaceId() : entityId,
      title: data.title,
      description: data.description || null,
      color: data.color || null,
      backgroundGradient: data.backgroundGradient || null,
      isPublic: data.isPublic || false,
      isActive: data.isActive !== void 0 ? data.isActive : true,
      order: data.order || 0,
      userId,
      createdAt: nowISO(),
      updatedAt: nowISO()
    }).returning().get();
    return { success: true, entityId, serverId: newSpace.id };
  } else if (operation === "update") {
    const existing = await db.select().from(Spaces).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId))).get();
    if (!existing) return { success: false, error: "Space not found" };
    await db.update(Spaces).set({
      title: data.title,
      description: data.description,
      color: data.color,
      backgroundGradient: data.backgroundGradient,
      isPublic: data.isPublic,
      isActive: data.isActive,
      order: data.order,
      updatedAt: nowISO()
    }).where(eq(Spaces.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === "delete") {
    await db.update(Spaces).set({ isActive: false, updatedAt: nowISO() }).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
async function processThreadMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const now = nowISO();
    const newThread = await db.insert(Threads).values({
      id: entityId.startsWith("local_") ? generateThreadId() : entityId,
      title: data.title,
      subtitle: data.subtitle || null,
      spaceId: data.spaceId || null,
      color: data.color || null,
      isPublic: data.isPublic || false,
      isPinned: data.isPinned || false,
      order: data.order || 0,
      userId,
      createdAt: now,
      updatedAt: now,
      lastVisited: data.lastVisited ? new Date(data.lastVisited).toISOString() : now
    }).returning().get();
    return { success: true, entityId, serverId: newThread.id, data: { color: newThread.color } };
  } else if (operation === "update") {
    const existing = await db.select().from(Threads).where(and(eq(Threads.id, entityId), eq(Threads.userId, userId))).get();
    if (!existing) return { success: false, error: "Thread not found" };
    await db.update(Threads).set({
      title: data.title,
      subtitle: data.subtitle,
      spaceId: data.spaceId,
      color: data.color,
      isPublic: data.isPublic,
      isPinned: data.isPinned,
      order: data.order,
      updatedAt: nowISO(),
      ...data.lastVisited && { lastVisited: new Date(data.lastVisited).toISOString() }
    }).where(eq(Threads.id, entityId));
    return { success: true, entityId, serverId: entityId, data: { color: data.color } };
  } else if (operation === "delete") {
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
async function processNoteMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const userMeta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    const nextSimpleNoteId = (userMeta?.highestSimpleNoteId || 0) + 1;
    let threadId = data.threadId || "thread_unorganized";
    if (threadId.startsWith("local_")) {
      console.warn(`[processNoteMutation] Thread ${threadId} is a local ID, using unorganized`);
      threadId = "thread_unorganized";
    }
    const now = nowISO();
    const newNote = await db.insert(Notes).values({
      id: entityId.startsWith("local_") ? generateNoteId() : entityId,
      title: data.title || null,
      content: data.content,
      threadId,
      spaceId: data.spaceId || null,
      simpleNoteId: data.simpleNoteId || nextSimpleNoteId,
      noteType: data.noteType || "default",
      addedBy: data.addedBy || "user",
      isPublic: data.isPublic || false,
      isFeatured: data.isFeatured || false,
      order: data.order || 0,
      userId,
      createdAt: now,
      updatedAt: now,
      lastVisited: data.lastVisited ? new Date(data.lastVisited).toISOString() : now,
      contentEncrypted: data.contentEncrypted || false
    }).returning().get();
    if (userMeta) {
      await db.update(UserMetadata).set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, userId));
    }
    if (threadId && threadId !== "thread_unorganized") {
      await db.insert(NoteThreads).values({ id: generateNoteId(), noteId: newNote.id, threadId, createdAt: nowISO() });
    }
    return { success: true, entityId, serverId: newNote.id };
  } else if (operation === "update") {
    const existing = await db.select().from(Notes).where(and(eq(Notes.id, entityId), eq(Notes.userId, userId))).get();
    if (!existing) return { success: false, error: "Note not found" };
    await db.update(Notes).set({
      title: data.title,
      content: data.content,
      spaceId: data.spaceId,
      isPublic: data.isPublic,
      isFeatured: data.isFeatured,
      order: data.order,
      updatedAt: nowISO(),
      ...data.lastVisited && { lastVisited: new Date(data.lastVisited).toISOString() },
      ...typeof data.contentEncrypted === "boolean" && { contentEncrypted: data.contentEncrypted },
      ...data.contentEncrypted === true && { isPublic: false, shareToken: null, shareTokenCreatedAt: null }
    }).where(eq(Notes.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === "delete") {
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
async function processNoteThreadMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) return { success: false, error: "Note not found" };
    const existing = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId))).get();
    if (existing) return { success: true, entityId, serverId: existing.id };
    const newNoteThread = await db.insert(NoteThreads).values({
      id: entityId.startsWith("local_") ? generateNoteId() : entityId,
      noteId: data.noteId,
      threadId: data.threadId,
      createdAt: nowISO()
    }).returning().get();
    return { success: true, entityId, serverId: newNoteThread.id };
  } else if (operation === "delete") {
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) return { success: false, error: "Note not found" };
    await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
async function processTagMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const newTag = await db.insert(Tags).values({
      id: entityId.startsWith("local_") ? generateNoteId() : entityId,
      name: data.name,
      color: data.color || null,
      category: data.category || null,
      isSystem: data.isSystem || false,
      userId,
      createdAt: nowISO(),
      updatedAt: nowISO()
    }).returning().get();
    return { success: true, entityId, serverId: newTag.id };
  } else if (operation === "update") {
    const existing = await db.select().from(Tags).where(and(eq(Tags.id, entityId), eq(Tags.userId, userId))).get();
    if (!existing) return { success: false, error: "Tag not found" };
    await db.update(Tags).set({ name: data.name, color: data.color, category: data.category, updatedAt: nowISO() }).where(eq(Tags.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === "delete") {
    await db.delete(Tags).where(and(eq(Tags.id, entityId), eq(Tags.userId, userId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
async function processNoteTagMutation(userId, operation, entityId, data) {
  if (operation === "create") {
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) return { success: false, error: "Note not found" };
    const newNoteTag = await db.insert(NoteTags).values({
      id: entityId.startsWith("local_") ? generateNoteId() : entityId,
      noteId: data.noteId,
      tagId: data.tagId,
      isAutoGenerated: data.isAutoGenerated || false,
      confidence: data.confidence || null,
      createdAt: nowISO()
    }).returning().get();
    return { success: true, entityId, serverId: newNoteTag.id };
  } else if (operation === "delete") {
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) return { success: false, error: "Note not found" };
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, data.tagId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}
app9.post("/api/sync/push", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const { mutations } = await c.req.json();
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return c.json({ error: "mutations array is required", code: "INVALID_REQUEST" }, 400);
    }
    const results = [];
    for (const mutation of mutations) {
      try {
        const { operation, entityType, entityId, data, operationId } = mutation;
        let result = { success: false, operationId };
        switch (entityType) {
          case "space":
            result = await processSpaceMutation(auth.userId, operation, entityId, data);
            break;
          case "thread":
            result = await processThreadMutation(auth.userId, operation, entityId, data);
            break;
          case "note":
            result = await processNoteMutation(auth.userId, operation, entityId, data);
            break;
          case "noteThread":
            result = await processNoteThreadMutation(auth.userId, operation, entityId, data);
            break;
          case "tag":
            result = await processTagMutation(auth.userId, operation, entityId, data);
            break;
          case "noteTag":
            result = await processNoteTagMutation(auth.userId, operation, entityId, data);
            break;
          default:
            result = { success: false, error: `Unknown entity type: ${entityType}` };
        }
        results.push({ ...result, operationId });
      } catch (error) {
        results.push({ success: false, operationId: mutation.operationId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return c.json({ results }, 200, { "Cache-Control": "private, no-cache" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/sync/push", action: "push_sync" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app9.get("/api/sync/bootstrap", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const [spaces, threads, notes, noteThreads, tags, noteTags, userMetadata] = await Promise.all([
      db.select({
        id: Spaces.id,
        title: Spaces.title,
        description: Spaces.description,
        color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient,
        isPublic: Spaces.isPublic,
        isActive: Spaces.isActive,
        order: Spaces.order,
        createdAt: Spaces.createdAt,
        updatedAt: Spaces.updatedAt
      }).from(Spaces).where(eq(Spaces.userId, auth.userId)).all(),
      db.select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        spaceId: Threads.spaceId,
        color: Threads.color,
        isPublic: Threads.isPublic,
        isPinned: Threads.isPinned,
        order: Threads.order,
        lastVisited: Threads.lastVisited,
        createdAt: Threads.createdAt,
        updatedAt: Threads.updatedAt
      }).from(Threads).where(eq(Threads.userId, auth.userId)).all(),
      db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        addedBy: Notes.addedBy,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        order: Notes.order,
        lastVisited: Notes.lastVisited,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
        contentEncrypted: Notes.contentEncrypted
      }).from(Notes).where(eq(Notes.userId, auth.userId)).limit(1e3).all(),
      db.select({
        id: NoteThreads.id,
        noteId: NoteThreads.noteId,
        threadId: NoteThreads.threadId,
        createdAt: NoteThreads.createdAt
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(eq(Notes.userId, auth.userId)).all(),
      db.select({
        id: Tags.id,
        name: Tags.name,
        color: Tags.color,
        category: Tags.category,
        isSystem: Tags.isSystem,
        createdAt: Tags.createdAt,
        updatedAt: Tags.updatedAt
      }).from(Tags).where(eq(Tags.userId, auth.userId)).all(),
      db.select({
        id: NoteTags.id,
        noteId: NoteTags.noteId,
        tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated,
        confidence: NoteTags.confidence,
        createdAt: NoteTags.createdAt
      }).from(NoteTags).innerJoin(Notes, eq(Notes.id, NoteTags.noteId)).where(eq(Notes.userId, auth.userId)).all(),
      db.select({
        id: UserMetadata.id,
        userId: UserMetadata.userId,
        highestSimpleNoteId: UserMetadata.highestSimpleNoteId,
        userColor: UserMetadata.userColor,
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        email: UserMetadata.email,
        profileImageUrl: UserMetadata.profileImageUrl,
        clerkDataUpdatedAt: UserMetadata.clerkDataUpdatedAt,
        churchName: UserMetadata.churchName,
        churchCity: UserMetadata.churchCity,
        churchState: UserMetadata.churchState,
        churchCountry: UserMetadata.churchCountry,
        currentSeason: UserMetadata.currentSeason,
        lastMonthlyVisit: UserMetadata.lastMonthlyVisit,
        churchAddedAt: UserMetadata.churchAddedAt,
        createdAt: UserMetadata.createdAt,
        updatedAt: UserMetadata.updatedAt,
        lockPinHash: UserMetadata.lockPinHash
      }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get()
    ]);
    const highestSimpleNoteId = userMetadata?.highestSimpleNoteId || 0;
    const reservedRange = { start: highestSimpleNoteId + 1, end: highestSimpleNoteId + 200 };
    let userMetaForResponse = userMetadata;
    if (userMetadata && userMetadata.currentSeason == null) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      userMetaForResponse = { ...userMetadata, currentSeason: season };
    }
    const bootstrapData = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      cursor: `bootstrap_${Date.now()}`,
      spaces,
      threads,
      notes,
      noteThreads,
      tags,
      noteTags,
      userMetadata: userMetaForResponse ? (() => {
        const { lockPinHash, ...rest } = userMetaForResponse;
        return {
          ...rest,
          hasLockPinSet: !!lockPinHash,
          reservedSimpleNoteIdRange: reservedRange
        };
      })() : null
    };
    return c.json(bootstrapData, 200, { "Cache-Control": "private, no-cache" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/sync/bootstrap", action: "bootstrap_sync" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
app9.get("/api/sync/changes", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
    const sinceParam = c.req.query("since");
    if (!sinceParam) return c.json({ error: "since parameter is required", code: "MISSING_PARAMETER" }, 400);
    let sinceTimestamp;
    if (sinceParam.startsWith("bootstrap_") || sinceParam.startsWith("timestamp_")) {
      sinceTimestamp = parseInt(sinceParam.split("_")[1], 10);
    } else {
      sinceTimestamp = parseInt(sinceParam, 10);
      if (isNaN(sinceTimestamp)) return c.json({ error: "Invalid since parameter format", code: "INVALID_PARAMETER" }, 400);
    }
    const sinceDateISO = new Date(sinceTimestamp).toISOString();
    const [changedSpaces, changedThreads, changedNotes, changedNoteThreads, changedTags, changedNoteTags, changedUserMetadata] = await Promise.all([
      db.select({
        id: Spaces.id,
        title: Spaces.title,
        description: Spaces.description,
        color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient,
        isPublic: Spaces.isPublic,
        isActive: Spaces.isActive,
        order: Spaces.order,
        createdAt: Spaces.createdAt,
        updatedAt: Spaces.updatedAt
      }).from(Spaces).where(and(eq(Spaces.userId, auth.userId), or(gt(Spaces.updatedAt, sinceDateISO), gt(Spaces.createdAt, sinceDateISO)))).all(),
      db.select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        spaceId: Threads.spaceId,
        color: Threads.color,
        isPublic: Threads.isPublic,
        isPinned: Threads.isPinned,
        order: Threads.order,
        lastVisited: Threads.lastVisited,
        createdAt: Threads.createdAt,
        updatedAt: Threads.updatedAt
      }).from(Threads).where(and(eq(Threads.userId, auth.userId), or(gt(Threads.updatedAt, sinceDateISO), gt(Threads.createdAt, sinceDateISO), gt(Threads.lastVisited, sinceDateISO)))).all(),
      db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        addedBy: Notes.addedBy,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        order: Notes.order,
        lastVisited: Notes.lastVisited,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
        contentEncrypted: Notes.contentEncrypted
      }).from(Notes).where(and(eq(Notes.userId, auth.userId), or(gt(Notes.updatedAt, sinceDateISO), gt(Notes.createdAt, sinceDateISO), gt(Notes.lastVisited, sinceDateISO)))).all(),
      db.select({
        id: NoteThreads.id,
        noteId: NoteThreads.noteId,
        threadId: NoteThreads.threadId,
        createdAt: NoteThreads.createdAt
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId)).where(and(eq(Notes.userId, auth.userId), gt(NoteThreads.createdAt, sinceDateISO))).all(),
      db.select({
        id: Tags.id,
        name: Tags.name,
        color: Tags.color,
        category: Tags.category,
        isSystem: Tags.isSystem,
        createdAt: Tags.createdAt,
        updatedAt: Tags.updatedAt
      }).from(Tags).where(and(eq(Tags.userId, auth.userId), or(gt(Tags.updatedAt, sinceDateISO), gt(Tags.createdAt, sinceDateISO)))).all(),
      db.select({
        id: NoteTags.id,
        noteId: NoteTags.noteId,
        tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated,
        confidence: NoteTags.confidence,
        createdAt: NoteTags.createdAt
      }).from(NoteTags).innerJoin(Notes, eq(Notes.id, NoteTags.noteId)).where(and(eq(Notes.userId, auth.userId), gt(NoteTags.createdAt, sinceDateISO))).all(),
      db.select({
        id: UserMetadata.id,
        userId: UserMetadata.userId,
        highestSimpleNoteId: UserMetadata.highestSimpleNoteId,
        userColor: UserMetadata.userColor,
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        email: UserMetadata.email,
        profileImageUrl: UserMetadata.profileImageUrl,
        clerkDataUpdatedAt: UserMetadata.clerkDataUpdatedAt,
        churchName: UserMetadata.churchName,
        churchCity: UserMetadata.churchCity,
        churchState: UserMetadata.churchState,
        churchCountry: UserMetadata.churchCountry,
        currentSeason: UserMetadata.currentSeason,
        lastMonthlyVisit: UserMetadata.lastMonthlyVisit,
        churchAddedAt: UserMetadata.churchAddedAt,
        createdAt: UserMetadata.createdAt,
        updatedAt: UserMetadata.updatedAt,
        lockPinHash: UserMetadata.lockPinHash
      }).from(UserMetadata).where(and(eq(UserMetadata.userId, auth.userId), or(gt(UserMetadata.updatedAt, sinceDateISO), gt(UserMetadata.createdAt, sinceDateISO)))).get()
    ]);
    let userMetaForResponse = changedUserMetadata;
    if (changedUserMetadata?.currentSeason == null && changedUserMetadata?.userId) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, changedUserMetadata.userId));
      userMetaForResponse = { ...changedUserMetadata, currentSeason: season };
    }
    const changes = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      cursor: `timestamp_${Date.now()}`,
      hasChanges: changedSpaces.length > 0 || changedThreads.length > 0 || changedNotes.length > 0 || changedNoteThreads.length > 0 || changedTags.length > 0 || changedNoteTags.length > 0 || changedUserMetadata !== null && changedUserMetadata !== void 0,
      spaces: changedSpaces,
      threads: changedThreads,
      notes: changedNotes,
      noteThreads: changedNoteThreads,
      tags: changedTags,
      noteTags: changedNoteTags,
      userMetadata: userMetaForResponse ? (() => {
        const { lockPinHash, ...rest } = userMetaForResponse;
        return { ...rest, hasLockPinSet: !!lockPinHash };
      })() : null
    };
    return c.json(changes, 200, { "Cache-Control": "private, no-cache" });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: "/api/sync/changes", action: "incremental_sync" });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});
var sync_default = app9;

// server/routes/migrations.ts
init_db();
init_dates();
import { Hono as Hono21 } from "hono";
import { createClerkClient as createClerkClient2 } from "@clerk/backend";
var app10 = new Hono21();
app10.post("/api/migrations/backfill-last-visited", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized", message: "Valid migration key required." }, 401);
    }
    const results = { notesUpdated: 0, threadsUpdated: 0, errors: [], startTime: Date.now() };
    console.log("[Migration] Starting lastVisited backfill...");
    try {
      const notesToUpdate = await db.select({ id: Notes.id, updatedAt: Notes.updatedAt, createdAt: Notes.createdAt }).from(Notes).where(isNull(Notes.lastVisited)).all();
      console.log(`[Migration] Found ${notesToUpdate.length} notes without lastVisited`);
      const batchSize = 1e3;
      for (let i = 0; i < notesToUpdate.length; i += batchSize) {
        const batch = notesToUpdate.slice(i, i + batchSize);
        for (const note of batch) {
          try {
            const fallbackDate = note.updatedAt || note.createdAt;
            if (fallbackDate) {
              await db.update(Notes).set({ lastVisited: fallbackDate }).where(eq(Notes.id, note.id));
              results.notesUpdated++;
            }
          } catch (error) {
            results.errors.push(`Note ${note.id}: ${error.message}`);
          }
        }
        console.log(`[Migration] Processed ${Math.min(i + batchSize, notesToUpdate.length)}/${notesToUpdate.length} notes`);
      }
    } catch (error) {
      results.errors.push(`Notes migration failed: ${error.message}`);
    }
    try {
      const threadsToUpdate = await db.select({ id: Threads.id, updatedAt: Threads.updatedAt, createdAt: Threads.createdAt }).from(Threads).where(isNull(Threads.lastVisited)).all();
      console.log(`[Migration] Found ${threadsToUpdate.length} threads without lastVisited`);
      const batchSize = 1e3;
      for (let i = 0; i < threadsToUpdate.length; i += batchSize) {
        const batch = threadsToUpdate.slice(i, i + batchSize);
        for (const thread of batch) {
          try {
            const fallbackDate = thread.updatedAt || thread.createdAt;
            if (fallbackDate) {
              await db.update(Threads).set({ lastVisited: fallbackDate }).where(eq(Threads.id, thread.id));
              results.threadsUpdated++;
            }
          } catch (error) {
            results.errors.push(`Thread ${thread.id}: ${error.message}`);
          }
        }
        console.log(`[Migration] Processed ${Math.min(i + batchSize, threadsToUpdate.length)}/${threadsToUpdate.length} threads`);
      }
    } catch (error) {
      results.errors.push(`Threads migration failed: ${error.message}`);
    }
    const duration = ((Date.now() - results.startTime) / 1e3).toFixed(2);
    const success = results.errors.length === 0;
    return c.json({
      success,
      message: success ? `Migration completed in ${duration}s` : `Migration completed with errors in ${duration}s`,
      results: {
        notesUpdated: results.notesUpdated,
        threadsUpdated: results.threadsUpdated,
        totalUpdated: results.notesUpdated + results.threadsUpdated,
        duration: `${duration}s`,
        errors: results.errors.slice(0, 10)
      }
    }, success ? 200 : 207);
  } catch (error) {
    console.error("[Migration] Fatal error:", error);
    return c.json({ success: false, error: "Migration failed", message: error.message }, 500);
  }
});
app10.post("/api/migrations/retry-failed-users", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;
    if (!isAuthorized) return c.json({ error: "Unauthorized" }, 401);
    let body;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: "Bad Request", message: "Invalid JSON" }, 400);
    }
    const userIds = body.userIds || [];
    const emails = body.emails || [];
    if (userIds.length === 0 && emails.length === 0) {
      return c.json({ error: "Bad Request", message: "Must provide either userIds or emails array" }, 400);
    }
    const results = { totalUsers: 0, successful: 0, failed: 0, skipped: 0, errors: [], startTime: Date.now() };
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");
    const clerkClient = createClerkClient2({ secretKey: clerkSecretKey });
    if (!process.env.AUDIENCEFUL_API_KEY) throw new Error("AUDIENCEFUL_API_KEY not configured");
    for (const userId of userIds) {
      results.totalUsers++;
      try {
        const user = await clerkClient.users.getUser(userId);
        const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        if (!primaryEmail) {
          results.skipped++;
          continue;
        }
        const email = primaryEmail.emailAddress;
        try {
          await tagAsAppUser(email, userId, user.firstName || void 0, user.lastName || void 0);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({ userId, email, error: error.message });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ userId, email: "unknown", error: `Failed to fetch user: ${error.message}` });
      }
    }
    for (const email of emails) {
      results.totalUsers++;
      try {
        const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
        if (users.length === 0) {
          results.skipped++;
          results.errors.push({ userId: "unknown", email, error: "Not found in Clerk" });
          continue;
        }
        const user = users[0];
        try {
          await tagAsAppUser(email, user.id, user.firstName || void 0, user.lastName || void 0);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({ userId: user.id, email, error: error.message });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ userId: "unknown", email, error: `Failed to process: ${error.message}` });
      }
    }
    const durationSeconds = ((Date.now() - results.startTime) / 1e3).toFixed(2);
    return c.json({
      success: true,
      message: "Retry complete",
      results: { ...results, startTime: void 0, durationSeconds: parseFloat(durationSeconds) }
    });
  } catch (error) {
    console.error("[Retry Migration] Fatal error:", error);
    return c.json({ error: "Retry failed", message: error.message }, 500);
  }
});
app10.post("/api/migrations/sync-clerk-to-audienceful", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;
    if (!isAuthorized) return c.json({ error: "Unauthorized" }, 401);
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const dryRunParam = c.req.query("dryRun");
    const limit = limitParam ? parseInt(limitParam, 10) : void 0;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const dryRun = dryRunParam === "true";
    const results = { totalUsers: 0, successful: 0, failed: 0, skipped: 0, errors: [], dryRun, startTime: Date.now() };
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");
    const clerkClient = createClerkClient2({ secretKey: clerkSecretKey });
    if (!process.env.AUDIENCEFUL_API_KEY && !dryRun) throw new Error("AUDIENCEFUL_API_KEY not configured");
    let hasMore = true;
    let currentOffset = offset;
    const batchSize = 100;
    while (hasMore) {
      const { data: users, totalCount } = await clerkClient.users.getUserList({
        limit: limit ? Math.min(batchSize, limit - results.totalUsers) : batchSize,
        offset: currentOffset
      });
      for (const user of users) {
        results.totalUsers++;
        const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        if (!primaryEmail) {
          results.skipped++;
          continue;
        }
        const email = primaryEmail.emailAddress;
        if (dryRun) {
          results.successful++;
          continue;
        }
        try {
          await tagAsAppUser(email, user.id, user.firstName || void 0, user.lastName || void 0);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({ userId: user.id, email, error: error.message });
        }
      }
      hasMore = users.length === batchSize && (!limit || results.totalUsers < limit);
      currentOffset += users.length;
      if (hasMore) await new Promise((resolve2) => setTimeout(resolve2, 100));
    }
    const durationSeconds = ((Date.now() - results.startTime) / 1e3).toFixed(2);
    return c.json({
      success: true,
      message: dryRun ? "Dry run complete" : "Migration complete",
      results: { ...results, startTime: void 0, durationSeconds: parseFloat(durationSeconds) }
    });
  } catch (error) {
    console.error("[Migration] Fatal error:", error);
    const isTimeout = error.name === "TimeoutError" || error.message?.includes("timeout");
    return c.json({ error: "Migration failed", message: error.message, isTimeout }, isTimeout ? 504 : 500);
  }
});
var migrations_default = app10;

// server/routes/admin.ts
import { Hono as Hono22 } from "hono";
init_db();

// server/utils/analytics-aggregator.ts
init_db();
init_dates();
async function aggregateMonthlyAnalytics(month) {
  try {
    const [year, monthNum] = month.split("-").map(Number);
    const monthStart = new Date(year, monthNum - 1, 1).toISOString();
    const monthEnd = new Date(year, monthNum, 1).toISOString();
    const bookStats = await db.select({
      book: ScriptureMetadata.book,
      count: sql`COUNT(*)`.as("count")
    }).from(ScriptureMetadata).where(and(gte(ScriptureMetadata.createdAt, monthStart), lt(ScriptureMetadata.createdAt, monthEnd))).groupBy(ScriptureMetadata.book).all();
    const tagStats = await db.select({
      tagName: Tags.name,
      count: sql`COUNT(*)`.as("count")
    }).from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id)).where(and(gte(NoteTags.createdAt, monthStart), lt(NoteTags.createdAt, monthEnd))).groupBy(Tags.name).all();
    for (const stat of bookStats) {
      if (!stat.book) continue;
      const existing = await db.select().from(MonthlyAnalytics).where(and(eq(MonthlyAnalytics.month, month), eq(MonthlyAnalytics.category, "book"), eq(MonthlyAnalytics.bookName, stat.book))).get();
      if (existing) {
        await db.update(MonthlyAnalytics).set({ count: stat.count, updatedAt: nowISO() }).where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_book_${stat.book.replace(/\s+/g, "_")}_${Date.now()}`,
          month,
          bookName: stat.book,
          tagName: null,
          category: "book",
          count: stat.count,
          createdAt: nowISO()
        });
      }
    }
    for (const stat of tagStats) {
      if (!stat.tagName) continue;
      const existing = await db.select().from(MonthlyAnalytics).where(and(eq(MonthlyAnalytics.month, month), eq(MonthlyAnalytics.category, "tag"), eq(MonthlyAnalytics.tagName, stat.tagName))).get();
      if (existing) {
        await db.update(MonthlyAnalytics).set({ count: stat.count, updatedAt: nowISO() }).where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_tag_${stat.tagName.replace(/\s+/g, "_")}_${Date.now()}`,
          month,
          bookName: null,
          tagName: stat.tagName,
          category: "tag",
          count: stat.count,
          createdAt: nowISO()
        });
      }
    }
  } catch (error) {
    console.error(`Error aggregating analytics for ${month}:`, error);
    throw error;
  }
}
function getCurrentMonth() {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
function getPreviousMonth() {
  const now = /* @__PURE__ */ new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = String(prev.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// server/routes/admin.ts
var app11 = new Hono22();
async function handleAggregateAnalytics(c) {
  try {
    const auth = getAuth(c);
    const authHeader = c.req.header("authorization");
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const previous = c.req.query("previous") === "true";
    const monthParam = c.req.query("month");
    let targetMonth;
    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return c.json({ error: "Invalid month format. Use YYYY-MM" }, 400);
      }
      targetMonth = monthParam;
    } else if (previous) {
      targetMonth = getPreviousMonth();
    } else {
      targetMonth = getCurrentMonth();
    }
    await aggregateMonthlyAnalytics(targetMonth);
    return c.json({ success: true, month: targetMonth, message: `Analytics aggregated for ${targetMonth}` });
  } catch (error) {
    console.error("Error aggregating analytics:", error);
    return c.json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }, 500);
  }
}
app11.post("/api/admin/aggregate-analytics", handleAggregateAnalytics);
app11.get("/api/admin/aggregate-analytics", handleAggregateAnalytics);
app11.get("/api/admin/cleanup-duplicate-note-threads", async (c) => {
  try {
    console.log("Starting cleanup of duplicate NoteThreads entries...");
    const allEntries = await db.select().from(NoteThreads).all();
    console.log(`Total NoteThreads entries: ${allEntries.length}`);
    const groupedEntries = /* @__PURE__ */ new Map();
    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.threadId}`;
      if (!groupedEntries.has(key)) groupedEntries.set(key, []);
      groupedEntries.get(key).push(entry);
    }
    const duplicateGroups = Array.from(groupedEntries.entries()).filter(([_, entries]) => entries.length > 1);
    console.log(`Found ${duplicateGroups.length} groups with duplicates`);
    if (duplicateGroups.length === 0) {
      return c.json({ success: true, message: "No duplicates found. Database is clean!", deleted: 0 });
    }
    let totalDeleted = 0;
    const report = [];
    for (const [_key, entries] of duplicateGroups) {
      const sorted = entries.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      const [kept, ...toDelete] = sorted;
      for (const entry of toDelete) {
        await db.delete(NoteThreads).where(eq(NoteThreads.id, entry.id));
        totalDeleted++;
      }
      report.push({ noteId: kept.noteId, threadId: kept.threadId, kept: kept.id, deleted: toDelete.map((e) => e.id) });
    }
    return c.json({
      success: true,
      message: `Cleanup complete! Deleted ${totalDeleted} duplicate NoteThreads entries.`,
      deleted: totalDeleted,
      duplicateGroups: report.length,
      report
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});
app11.get("/api/admin/cleanup-duplicate-scripture-refs", async (c) => {
  try {
    console.log("Starting cleanup of duplicate scripture reference entries...");
    const allEntries = await db.select().from(NoteScriptureReferences).all();
    const groupedEntries = /* @__PURE__ */ new Map();
    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.scriptureNoteId}`;
      if (!groupedEntries.has(key)) groupedEntries.set(key, []);
      groupedEntries.get(key).push(entry);
    }
    const duplicateGroups = Array.from(groupedEntries.entries()).filter(([_, entries]) => entries.length > 1);
    console.log(`Found ${duplicateGroups.length} groups with duplicates`);
    if (duplicateGroups.length === 0) {
      return c.json({ success: true, message: "No duplicates found. Database is clean!", deleted: 0 });
    }
    let totalDeleted = 0;
    const report = [];
    for (const [_key, entries] of duplicateGroups) {
      const sorted = entries.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      const [kept, ...toDelete] = sorted;
      for (const entry of toDelete) {
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, entry.id));
        totalDeleted++;
      }
      report.push({ noteId: kept.noteId, scriptureNoteId: kept.scriptureNoteId, kept: kept.id, deleted: toDelete.map((e) => e.id) });
    }
    return c.json({
      success: true,
      message: `Cleanup complete! Deleted ${totalDeleted} duplicate entries.`,
      deleted: totalDeleted,
      duplicateGroups: report.length,
      report
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});
app11.get("/api/admin/debug-thread-counts", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threadId = c.req.query("threadId");
    if (!threadId) return c.json({ error: "threadId parameter required" }, 400);
    const allNotes = await db.select({ id: Notes.id, title: Notes.title, noteType: Notes.noteType, content: Notes.content }).from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id)).where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, auth.userId))).all();
    const scriptureDetails = await Promise.all(
      allNotes.filter((n) => n.noteType === "scripture").map(async (note) => {
        const metadata = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id)).get();
        return { id: note.id, title: note.title, reference: metadata?.reference || "Unknown" };
      })
    );
    const counts = {
      all: allNotes.length,
      default: allNotes.filter((n) => !n.noteType || n.noteType === "default").length,
      scripture: allNotes.filter((n) => n.noteType === "scripture").length,
      resource: allNotes.filter((n) => n.noteType === "resource").length
    };
    return c.json({
      success: true,
      threadId,
      counts,
      notes: allNotes.map((n) => ({
        id: n.id,
        title: n.title || "(no title)",
        noteType: n.noteType || "default",
        contentPreview: n.content?.substring(0, 100) || ""
      })),
      scriptureNotes: scriptureDetails
    });
  } catch (error) {
    console.error("Error debugging thread counts:", error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});
app11.get("/api/admin/list-threads", async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: "Authentication required" }, 401);
    const threads = await db.select().from(Threads).where(eq(Threads.userId, auth.userId)).all();
    return c.json({
      success: true,
      userId: auth.userId,
      threadCount: threads.length,
      threads: threads.map((t) => ({ id: t.id, title: t.title, isPinned: t.isPinned }))
    });
  } catch (error) {
    console.error("Error listing threads:", error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});
var admin_default = app11;

// server/app.ts
var app12 = new Hono23();
app12.use("/api/*", cors());
app12.use("/api/*", clerkAuth);
app12.route("/", health_default);
app12.route("/", navigation_default);
app12.route("/", debug_default);
app12.route("/", about_default);
app12.route("/", og_default);
app12.route("/", stats_default);
app12.route("/", search_default);
app12.route("/", content_default);
app12.route("/", threads_default);
app12.route("/", notes_default);
app12.route("/", spaces_default);
app12.route("/", user_default);
app12.route("/", tags_scripture_default);
app12.route("/", shared_default);
app12.route("/", billing_default);
app12.route("/", resource_default);
app12.route("/", inbox_default);
app12.route("/", webflow_default);
app12.route("/", webhooks_default);
app12.route("/", sync_default);
app12.route("/", migrations_default);
app12.route("/", admin_default);
var app_default = app12;

// server/netlify.ts
var netlify_default = handle(app_default);
export {
  netlify_default as default
};
