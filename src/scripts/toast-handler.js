// Toast handler - checks URL parameters and displays toasts
// Note: toast utility must be imported in Layout.astro frontmatter to initialize window.toast

// Check for toast parameters in URL and show toast
const urlParams = new URLSearchParams(window.location.search);
const toastType = urlParams.get('toast');
const message = urlParams.get('message');

if (toastType && message) {
  const decodedMessage = decodeURIComponent(message);
  
  // Small delay to ensure Sonner is fully initialized
  setTimeout(() => {
    try {
      // Use global toast if available
      if (window.toast) {
        switch (toastType) {
          case 'success':
            window.toast.success(decodedMessage);
            break;
          case 'error':
            window.toast.error(decodedMessage);
            break;
          case 'info':
            window.toast.info(decodedMessage);
            break;
          case 'warning':
            window.toast.warning(decodedMessage);
            break;
        }
      }
    } catch (error) {
      console.error('Error calling toast function:', error);
    }
  }, 1000);
  
  // Clean up URL parameters
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.delete('toast');
  newUrl.searchParams.delete('message');
  window.history.replaceState({}, '', newUrl.toString());
}
