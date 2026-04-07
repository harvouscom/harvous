import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

export type DebouncedEntityTitleFormRef = { title: string } & Record<string, unknown>;

export type DebouncedEntityTitleInputProps = {
  pendingStorageKey: string;
  committedTitle: string;
  formDataRef: React.MutableRefObject<DebouncedEntityTitleFormRef>;
  onSave: (title: string) => void | Promise<void>;
  debounceMs?: number;
  storageDebounceMs?: number;
  className?: string;
  inputClassName?: string;
  emptyPlaceholder?: string;
  validationError?: string | null;
  onClearValidation?: () => void;
  /** Increment to force the input back to `committedTitle` (e.g. discard edits). */
  resetKey?: number;
};

function DebouncedEntityTitleInputInner({
  pendingStorageKey,
  committedTitle,
  formDataRef,
  onSave,
  debounceMs = 1500,
  storageDebounceMs = 400,
  className = '',
  inputClassName = '',
  emptyPlaceholder = '',
  validationError,
  onClearValidation,
  resetKey = 0,
}: DebouncedEntityTitleInputProps) {
  const [value, setValue] = useState(committedTitle);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitleSaveRef = useRef<string | null>(null);
  const committedRef = useRef(committedTitle);
  const onSaveRef = useRef(onSave);
  const pendingStorageKeyRef = useRef(pendingStorageKey);
  const flushPendingStorageRef = useRef<() => void>(() => {});

  useEffect(() => {
    committedRef.current = committedTitle;
  }, [committedTitle]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    pendingStorageKeyRef.current = pendingStorageKey;
  }, [pendingStorageKey]);

  const clearPendingStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(pendingStorageKeyRef.current);
  }, []);

  const flushPendingStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const p = pendingTitleSaveRef.current;
    if (p != null && p.trim() !== committedRef.current.trim()) {
      sessionStorage.setItem(pendingStorageKeyRef.current, p);
    }
  }, []);

  useEffect(() => {
    flushPendingStorageRef.current = flushPendingStorage;
  }, [flushPendingStorage]);

  const scheduleStorageWrite = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (storageTimerRef.current) {
      clearTimeout(storageTimerRef.current);
    }
    storageTimerRef.current = setTimeout(() => {
      storageTimerRef.current = null;
      flushPendingStorage();
    }, storageDebounceMs);
  }, [flushPendingStorage, storageDebounceMs]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const scheduleSave = useCallback(
    (raw: string) => {
      formDataRef.current = { ...formDataRef.current, title: raw };
      pendingTitleSaveRef.current = raw;

      const matchesCommitted = raw.trim() === committedRef.current.trim();
      if (matchesCommitted) {
        clearSaveTimer();
        pendingTitleSaveRef.current = null;
        if (storageTimerRef.current) {
          clearTimeout(storageTimerRef.current);
          storageTimerRef.current = null;
        }
        clearPendingStorage();
        return;
      }

      scheduleStorageWrite();

      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushPendingStorage();
        const toSave = pendingTitleSaveRef.current;
        if (toSave != null && toSave.trim() !== committedRef.current.trim()) {
          void onSaveRef.current(toSave);
        }
      }, debounceMs);
    },
    [formDataRef, debounceMs, clearSaveTimer, scheduleStorageWrite, flushPendingStorage, clearPendingStorage],
  );

  useEffect(() => {
    setValue(committedTitle);
  }, [committedTitle, resetKey]);

  useEffect(() => {
    const onPageHide = () => {
      flushPendingStorageRef.current();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushPendingStorageRef.current();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (storageTimerRef.current) {
        clearTimeout(storageTimerRef.current);
        storageTimerRef.current = null;
      }
      const p = pendingTitleSaveRef.current;
      if (typeof window !== 'undefined' && p != null && p.trim() !== committedRef.current.trim()) {
        sessionStorage.setItem(pendingStorageKeyRef.current, p);
      }
      if (p != null && p.trim() !== committedRef.current.trim()) {
        void onSaveRef.current(p);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setValue(raw);
    onClearValidation?.();
    scheduleSave(raw);
  };

  return (
    <div className={className}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={value ? '' : emptyPlaceholder}
        className={inputClassName}
        aria-invalid={!!validationError}
      />
      {validationError ? (
        <div className="text-red-500 text-sm mt-1 text-center">{validationError}</div>
      ) : null}
    </div>
  );
}

export const DebouncedEntityTitleInput = memo(DebouncedEntityTitleInputInner);
