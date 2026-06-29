/// <reference types="vite/client" />

interface Window {
  __harvousCheckServiceWorkerUpdate?: () => void;
  __harvousShowAppUpdateNotice?: (opts?: { needsReload?: boolean }) => void;
}
