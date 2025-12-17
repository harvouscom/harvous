-- PostgreSQL Schema for Harvous Self-Hosted
-- This schema matches the Astro DB schema defined in db/config.ts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Spaces table
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT,
    background_gradient TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    "order" INTEGER DEFAULT 0
);

-- Threads table
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    space_id TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    is_public BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    color TEXT,
    "order" INTEGER DEFAULT 0
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    space_id TEXT,
    simple_note_id INTEGER,
    note_type TEXT DEFAULT 'default',
    added_by TEXT DEFAULT 'user',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    is_public BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    "order" INTEGER DEFAULT 0
);

-- NoteThreads junction table
CREATE TABLE IF NOT EXISTS note_threads (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    note_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    space_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP NOT NULL
);

-- UserMetadata table
CREATE TABLE IF NOT EXISTS user_metadata (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL DEFAULT 'self-hosted',
    highest_simple_note_id INTEGER DEFAULT 0,
    user_color TEXT DEFAULT 'paper',
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    profile_image_url TEXT,
    clerk_data_updated_at TIMESTAMP,
    church_name TEXT,
    church_city TEXT,
    church_state TEXT,
    church_country TEXT,
    current_season TEXT,
    last_monthly_visit TIMESTAMP,
    church_added_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- UserXP table
CREATE TABLE IF NOT EXISTS user_xp (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    activity_type TEXT NOT NULL,
    xp_amount INTEGER NOT NULL,
    related_id TEXT,
    season TEXT,
    created_at TIMESTAMP NOT NULL,
    metadata TEXT
);

-- UserSeasonalXP table
CREATE TABLE IF NOT EXISTS user_seasonal_xp (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    season TEXT NOT NULL,
    total_xp INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- UserLifetimeXP table
CREATE TABLE IF NOT EXISTS user_lifetime_xp (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL DEFAULT 'self-hosted',
    total_xp INTEGER DEFAULT 0,
    last_updated TIMESTAMP NOT NULL
);

-- WeeklyStreaks table
CREATE TABLE IF NOT EXISTS weekly_streaks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    week_start TIMESTAMP NOT NULL,
    days_with_sessions INTEGER DEFAULT 0,
    xp_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    category TEXT,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- NoteTags junction table
CREATE TABLE IF NOT EXISTS note_tags (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    is_auto_generated BOOLEAN DEFAULT FALSE,
    confidence NUMERIC,
    created_at TIMESTAMP NOT NULL
);

-- ScriptureMetadata table
CREATE TABLE IF NOT EXISTS scripture_metadata (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    reference TEXT NOT NULL,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    verse_end INTEGER,
    translation TEXT NOT NULL,
    original_text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- ResourceMetadata table
CREATE TABLE IF NOT EXISTS resource_metadata (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_domain TEXT,
    source_name TEXT,
    source_title TEXT,
    source_description TEXT,
    source_image TEXT,
    created_at TIMESTAMP NOT NULL
);

-- NoteScriptureReferences junction table
CREATE TABLE IF NOT EXISTS note_scripture_references (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    scripture_note_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- InboxItems table
CREATE TABLE IF NOT EXISTS inbox_items (
    id TEXT PRIMARY KEY,
    webflow_item_id TEXT UNIQUE NOT NULL,
    content_type TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT,
    image_url TEXT,
    color TEXT,
    thread_type TEXT,
    target_audience TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- InboxItemNotes table
CREATE TABLE IF NOT EXISTS inbox_item_notes (
    id TEXT PRIMARY KEY,
    inbox_item_id TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);

-- UserInboxItems table
CREATE TABLE IF NOT EXISTS user_inbox_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'self-hosted',
    inbox_item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    added_at TIMESTAMP,
    archived_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_thread_id ON notes(thread_id);
CREATE INDEX IF NOT EXISTS idx_notes_space_id ON notes(space_id);
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_space_id ON threads(space_id);
CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_note_threads_note_id ON note_threads(note_id);
CREATE INDEX IF NOT EXISTS idx_note_threads_thread_id ON note_threads(thread_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_user_inbox_items_user_id ON user_inbox_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inbox_items_status ON user_inbox_items(status);

