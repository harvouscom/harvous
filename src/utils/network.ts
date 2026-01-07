/**
 * Check if an error is a network error (connection failure, timeout, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  // Check if it's a TypeError (common for fetch failures)
  if (error instanceof TypeError) {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network error') ||
      message.includes('load failed')
    );
  }

  // Check if it's an Error with network-related message
  if (error instanceof Error) {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';
    
    return (
      name === 'networkerror' ||
      name === 'typeerror' ||
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('aborted')
    );
  }

  // Check if it's a string
  if (typeof error === 'string') {
    const errorLower = error.toLowerCase();
    return (
      errorLower.includes('network') ||
      errorLower.includes('fetch') ||
      errorLower.includes('connection') ||
      errorLower.includes('timeout')
    );
  }

  return false;
}

