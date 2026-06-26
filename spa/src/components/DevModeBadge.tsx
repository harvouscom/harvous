import { createPortal } from 'react-dom';

/** Fixed pill when Clerk uses a test publishable key (`pk_test_`). */
export default function DevModeBadge() {
  const isDevClerk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_');
  if (!isDevClerk || typeof document === 'undefined') return null;

  return createPortal(
    <div className="proto-dev-badge">
      <div className="proto-dev-badge__surface">DEV MODE</div>
    </div>,
    document.body,
  );
}
