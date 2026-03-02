import { markdownToHtml } from './markdown-to-html';

// esbuild bundles .md files as text strings via --loader:.md=text
// @ts-ignore: md imports handled by esbuild text loader
import welcome from '../data/onboarding/01-welcome.md';
// @ts-ignore
import createOrganize from '../data/onboarding/02-create-organize.md';
// @ts-ignore
import find from '../data/onboarding/03-find.md';
// @ts-ignore
import addToHomescreen from '../data/onboarding/04-add-to-homescreen.md';

interface OnboardingNote {
  title: string;
  content: string; // HTML content
  order: number; // Based on filename prefix
}

const onboardingFiles: { markdown: string; order: number }[] = [
  { markdown: welcome, order: 1 },
  { markdown: createOrganize, order: 2 },
  { markdown: find, order: 3 },
  { markdown: addToHomescreen, order: 4 },
];

/**
 * Parses a markdown string and returns an OnboardingNote
 */
function parseMarkdownNote(markdown: string, order: number): OnboardingNote {
  const lines = markdown.split('\n');
  let title = '';
  let contentStartIndex = 0;

  // Check if first line is a markdown heading
  if (lines[0].startsWith('# ')) {
    title = lines[0].substring(2).trim();
    contentStartIndex = 1;
  } else if (lines[0].startsWith('## ')) {
    title = lines[0].substring(3).trim();
    contentStartIndex = 1;
  } else {
    // Fallback: use first line as title
    title = lines[0].trim();
    contentStartIndex = 1;
  }

  // Get content (everything after title)
  const contentMarkdown = lines.slice(contentStartIndex).join('\n').trim();

  // Convert markdown content to HTML
  const contentHtml = markdownToHtml(contentMarkdown);

  return {
    title,
    content: contentHtml,
    order
  };
}

/**
 * Loads onboarding notes from markdown files bundled by esbuild.
 *
 * To add/edit onboarding notes, modify the markdown files in src/data/onboarding/
 * and update the imports at the top of this file.
 */
export function loadOnboardingNotes(): OnboardingNote[] {
  try {
    const notes: OnboardingNote[] = onboardingFiles.map(({ markdown, order }) =>
      parseMarkdownNote(markdown, order)
    );

    return notes.sort((a, b) => a.order - b.order);
  } catch (error: any) {
    console.error('[loadOnboardingNotes] Error loading onboarding notes:', error);
    // Return default notes as fallback
    return getDefaultOnboardingNotes();
  }
}

/**
 * Fallback default notes if markdown files can't be loaded
 */
function getDefaultOnboardingNotes(): OnboardingNote[] {
  return [
    {
      title: 'Welcome to Harvous',
      content: '<p>This is your first note! You can edit it, add it to threads, or delete it. Try clicking on this note to see more options.</p>',
      order: 1
    },
    {
      title: 'Organize Your Notes',
      content: '<p>Create threads to organize your notes by topic, study, or theme. You can add notes to multiple threads.</p>',
      order: 2
    },
    {
      title: 'Capture Scripture',
      content: '<p>When you reference Bible verses in your notes, Harvous automatically creates scripture notes that link together.</p>',
      order: 3
    }
  ];
}
