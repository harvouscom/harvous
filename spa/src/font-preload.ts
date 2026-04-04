/**
 * Preload primary Reddit Sans weights before @font-face CSS runs so the first
 * paint after fast navigations (e.g. shared → thread) uses the web font instead
 * of falling through to system-ui (font-display: swap FOUT).
 */
import latin400 from '@fontsource/reddit-sans/files/reddit-sans-latin-400-normal.woff2?url';
import latin500 from '@fontsource/reddit-sans/files/reddit-sans-latin-500-normal.woff2?url';
import latin600 from '@fontsource/reddit-sans/files/reddit-sans-latin-600-normal.woff2?url';
import latin700 from '@fontsource/reddit-sans/files/reddit-sans-latin-700-normal.woff2?url';

function preloadWoff2(href: string) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
}

for (const href of [latin400, latin500, latin600, latin700]) {
  preloadWoff2(href);
}
