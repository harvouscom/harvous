import { Mark, markPasteRule, mergeAttributes } from '@tiptap/core';

export interface UrlLinkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    urlLink: {
      setUrlLink: (attributes: { href: string; title?: string | null; favicon?: string | null }) => ReturnType;
      unsetUrlLink: () => ReturnType;
      updateUrlLink: (attributes: { href: string }) => ReturnType;
    };
  }
}

// Match bare http(s) URLs as a whole token. Paste rule converts them to url-link marks.
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

/** Only allow http(s) external URLs — rejects javascript:, data:, etc. */
export function isAllowedExternalHref(href: string | null | undefined): href is string {
  if (!href) return false;
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * External URL link mark. Distinct from `noteLink` (internal note refs) and `scripturePill`
 * (scripture refs). Renders as <span data-url-link="..."> so the editor's hover hook can
 * detect it via `[data-url-link]`. Uses span, not anchor, so internal click handling stays
 * predictable — navigation is owned by the LinkPreviewCard's Open action.
 */
export const UrlLink = Mark.create<UrlLinkOptions>({
  name: 'urlLink',
  inclusive: false,
  // URL link pills are visually styled with inline CSS (font-weight:500, no italics, etc.).
  // Exclude all formatting marks so surrounding bold/italic/code/strike/underline can't
  // bleed into the pill and wrap it in <strong>/<em>/etc.
  excludes: 'bold italic code strike underline',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => {
          const href = element.getAttribute('data-url-link') || element.getAttribute('href');
          return isAllowedExternalHref(href) ? href.trim() : null;
        },
        renderHTML: (attributes) =>
          isAllowedExternalHref(attributes.href) ? { 'data-url-link': attributes.href } : {},
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-url-title'),
        renderHTML: (attributes) => (attributes.title ? { 'data-url-title': attributes.title } : {}),
      },
      favicon: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-url-favicon'),
        renderHTML: (attributes) => (attributes.favicon ? { 'data-url-favicon': attributes.favicon } : {}),
      },
    };
  },

  parseHTML() {
    return [
      // Lower priority so existing note/scripture spans win
      {
        tag: 'span[data-url-link]',
        priority: 50,
        getAttrs: (el) => {
          const href = (el as HTMLElement).getAttribute('data-url-link');
          if (!isAllowedExternalHref(href)) return false;
          return { href: href.trim() };
        },
      },
      {
        tag: 'a[href]:not([data-note-id]):not([data-scripture-reference])',
        priority: 40,
        getAttrs: (el) => {
          const href = (el as HTMLElement).getAttribute('href');
          if (!isAllowedExternalHref(href)) return false;
          return { href: href.trim() };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Inline style matches scripture pill exactly (highest specificity, nothing can override).
    // gap: 4px creates the space between text and the ::after arrow icon (flex child).
    const pillStyle =
      'background-color: var(--color-paper); border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 500; font-style: normal; font-size: inherit; color: var(--color-deep-grey); vertical-align: baseline; line-height: inherit; user-select: all; white-space: normal; cursor: pointer; text-decoration: none;';
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'url-link url-link-pill',
        style: pillStyle,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setUrlLink: (attributes) => ({ chain }) => {
        if (!isAllowedExternalHref(attributes.href)) return false;
        return chain().setMark(this.name, { ...attributes, href: attributes.href.trim() }).run();
      },
      unsetUrlLink: () => ({ chain }) => chain().unsetMark(this.name).run(),
      updateUrlLink: (attributes) => ({ commands }) => {
        if (!isAllowedExternalHref(attributes.href)) return false;
        return commands.updateAttributes(this.name, { href: attributes.href.trim() });
      },
    };
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: URL_REGEX,
        type: this.type,
        getAttributes: (match) => ({ href: match[0] }),
      }),
    ];
  },
});
