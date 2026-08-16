import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import FounderLetterContent, { type FounderLetterPaperPhase } from '@/components/react/FounderLetterContent';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import { useProfile } from '../../hooks/queries/useProfile';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { PROTO_FOUNDER_LETTER_SHEET_EXIT_MS } from '../../layouts/proto-motion';

type Props = {
  open: boolean;
  onClose: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function PrototypeFounderLetterSheet({ open, onClose }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open, {
    exitMs: PROTO_FOUNDER_LETTER_SHEET_EXIT_MS,
  });
  const [paperPhase, setPaperPhase] = useState<FounderLetterPaperPhase>('stacked');
  const { user } = useUser();
  const { data: profile } = useProfile();
  const firstName = useMemo(() => resolveProfileFirstName(user, profile), [user, profile]);

  useEffect(() => {
    if (exiting) {
      setPaperPhase('stacked');
      return;
    }

    if (!open || !mounted) {
      if (!open) setPaperPhase('stacked');
      return;
    }

    if (prefersReducedMotion()) {
      setPaperPhase('fanned');
      return;
    }

    setPaperPhase('stacked');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPaperPhase('fanned'));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, mounted, exiting]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        'proto-votd-sheet-overlay',
        'proto-votd-sheet-overlay--motion',
        exiting ? 'proto-votd-sheet-overlay--exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={[
          'proto-founder-letter-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Letter from the founder"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proto-side-panel__action-btn proto-founder-letter-sheet__close"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>
        <div className="proto-founder-letter-sheet__body">
          <FounderLetterContent firstName={firstName} paperPhase={paperPhase} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
