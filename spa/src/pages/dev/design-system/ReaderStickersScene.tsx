/**
 * Verse stickers in the Bible reader, on the real pane rather than a copy of its markup: the
 * stickers are measured against the verses as laid out, and a fixture with baked-in tops would
 * agree with nothing. One stage at reading width and one at phone width, where the right inset
 * narrows and the sticker hangs into the paper's padding. Two stickers sit on verses that start
 * on the same line in prose, so the nudge that keeps them from stacking is on screen too.
 *
 * Select a verse and choose Sticker to see the sheet; picks are kept in this scene only. The
 * chapter text comes from `/api/scripture/chapter`, which needs no account.
 */
import { useState } from 'react';
import { ProtoShellProvider } from '../../../layouts/proto-shell-context';
import PrototypeBibleReaderPane from '../../prototype/PrototypeBibleReaderPane';
import type { ReaderSticker } from '../../../../../shared/verse-stickers';

const START: [number, ReaderSticker][] = [
  [3, 'dove'],
  [5, 'sailboat'],
  [6, 'leaf'],
  // A grown-up theme beside the pictures: the wind and the Spirit.
  [8, 'fire-flame-curved'],
  [16, 'heart'],
  [17, 'star'],
];

function Stage({ label, width }: { label: string; width: number }) {
  const [stickers, setStickers] = useState(() => new Map(START));
  return (
    <section data-specimen={label} style={{ width, display: 'grid', gap: 8 }}>
      <p className="pds-caption">{label}</p>
      <div style={{ height: 720, display: 'flex', border: '1px solid var(--pds-border-soft)', overflow: 'hidden' }}>
        <PrototypeBibleReaderPane
          book="John"
          chapter={3}
          translation="NET"
          stickers={stickers}
          onSetSticker={(verse, sticker) =>
            setStickers((current) => {
              const next = new Map(current);
              if (sticker) next.set(verse, sticker);
              else next.delete(verse);
              return next;
            })
          }
        />
      </div>
    </section>
  );
}

export default function ReaderStickersScene() {
  return (
    <ProtoShellProvider>
      <div className="proto-theme" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <Stage label="Reading width" width={720} />
        <Stage label="Phone" width={380} />
      </div>
    </ProtoShellProvider>
  );
}
