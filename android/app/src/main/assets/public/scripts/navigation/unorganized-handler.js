// Hide unorganized thread if it's been closed
function hideUnorganizedThread() {
  const isClosed = localStorage.getItem('unorganized-thread-closed') === 'true';
  if (isClosed) {
    const unorganizedElement = document.querySelector('[data-navigation-item="thread_unorganized"]');
    if (unorganizedElement) {
      unorganizedElement.style.display = 'none';
    }
  }
}

// Run immediately and on page events
hideUnorganizedThread();
document.addEventListener('DOMContentLoaded', hideUnorganizedThread);
document.addEventListener('astro:page-load', hideUnorganizedThread);

