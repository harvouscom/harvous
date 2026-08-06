// Shared types for @ mention pills. Lives in its own module so TiptapEditor,
// TiptapMentionPill, and SPA-side data sources can all import it without cycles
// (and because src/ components cannot import from spa/).

export type MentionKind = 'note' | 'thread' | 'folder' | 'library';

export const MENTION_KINDS: readonly MentionKind[] = ['note', 'thread', 'folder', 'library'];

/** One row offered by the @ typeahead picker. */
export interface MentionPickerItem {
  kind: MentionKind;
  /** Note id, study-thread representative note id, raw folder name, or library item id. */
  entityId: string;
  /** Empty for library items — they belong to a library, not a space. */
  spaceId: string;
  title: string;
  subtitle?: string;
}

/** Payload handed to onMentionPillClick when a pill is tapped. */
export interface MentionPillClickPayload {
  kind: MentionKind;
  entityId: string;
  spaceId: string | null;
  label: string;
}
