/**
 * The command context, captured for a surface that outlives the moment it opened.
 *
 * `prototype-command-context-store` publishes a *getter* rather than a value, and the
 * reason is stated in its own header: part of the context is which row holds keyboard
 * focus, and focus moves without re-rendering React, so a published snapshot would hand
 * you whatever was true at the last render.
 *
 * The palette could read that getter once during its mount render and be done, because
 * mounting *was* opening and its autofocus had not run yet. This surface has the same
 * ordering available — the panel's focus effect runs after render — but unlike the palette
 * it stays mounted while you type. So a naive re-read would eventually overwrite the good
 * mount-time answer with `null`, for the worst possible reason: focus is now in *this*
 * panel's own search field, which is exactly the surface asking the question.
 *
 * Hence the asymmetry below. A later read may only ever improve the answer.
 */
import { useEffect, useState } from 'react';
import {
  usePrototypeCommandContext,
  type PrototypeCommandRunner,
} from '../../../lib/prototype-command-context-store';
import type { CommandContext } from '../../../lib/prototype-commands';

export function useLibraryCommandContext(): {
  ctx: CommandContext | null;
  run: PrototypeCommandRunner | null;
} {
  const published = usePrototypeCommandContext();

  /* Read during the mount render — before this panel's focus effect moves focus off the
     row the reader was standing on. */
  const [ctx, setCtx] = useState<CommandContext | null>(() => published.getContext?.() ?? null);

  useEffect(() => {
    const next = published.getContext?.() ?? null;
    /* Only ever an improvement: a selection that appeared, or a different list publishing.
       A `null` here is not news that the context is gone — it is news that focus left, and
       this surface is where it went. */
    if (next) setCtx(next);
  }, [published]);

  /*
   * `run` is read live rather than snapshotted, matching the palette. The runner is a
   * stable handle into whichever list published it, and calling a captured one after that
   * list re-published would act on a stale closure.
   */
  return { ctx, run: published.run };
}
