import { useCallback, useEffect, useState } from 'react';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Live input + debounced string for search APIs (matches Spotlight: 300ms).
 * When the trimmed input is empty, debounced clears immediately (no stale results after clear).
 */
export function useDebouncedSearchState(debounceMs = DEFAULT_DEBOUNCE_MS) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setDebounced('');
      return;
    }
    const t = window.setTimeout(() => setDebounced(input), debounceMs);
    return () => window.clearTimeout(t);
  }, [input, debounceMs]);

  const clear = useCallback(() => {
    setInput('');
    setDebounced('');
  }, []);

  /** Set both values at once (e.g. picking a recent search — show results without waiting for debounce). */
  const applyImmediate = useCallback((term: string) => {
    setInput(term);
    setDebounced(term);
  }, []);

  return { input, setInput, debounced, clear, applyImmediate };
}
