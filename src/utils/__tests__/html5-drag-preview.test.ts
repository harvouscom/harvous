import { describe, expect, it } from 'vitest';
import { resolveThreadTrailDragPreviewSource } from '../html5-drag-preview';

describe('resolveThreadTrailDragPreviewSource', () => {
  it('resolves sidebar trail step-body from divider list item', () => {
    document.body.innerHTML = `
      <ul>
        <li class="proto-thread-trail__step" id="step">
          <div class="proto-thread-trail__step-body" id="body"></div>
        </li>
        <li class="proto-thread-trail__reorder-divider-item">
          <div class="proto-thread-trail__reorder-divider">
            <div class="proto-thread-trail__reorder-divider__handle" id="handle"></div>
          </div>
        </li>
      </ul>
    `;
    const handle = document.getElementById('handle')!;
    const body = document.getElementById('body');
    expect(resolveThreadTrailDragPreviewSource(handle)).toBe(body);
  });

  it('resolves panel trail step-body from divider sibling', () => {
    document.body.innerHTML = `
      <div>
        <div class="proto-thread-trail__step" id="step">
          <div class="proto-thread-trail__step-body" id="body"></div>
        </div>
        <div class="proto-thread-trail__reorder-divider">
          <div class="proto-thread-trail__reorder-divider__handle" id="handle"></div>
        </div>
      </div>
    `;
    const handle = document.getElementById('handle')!;
    const body = document.getElementById('body');
    expect(resolveThreadTrailDragPreviewSource(handle)).toBe(body);
  });

  it('resolves trail step-body from ⋮ menu trigger inside the step', () => {
    document.body.innerHTML = `
      <li class="proto-thread-trail__step" id="step">
        <div class="proto-thread-trail__step-body" id="body">
          <button type="button" class="proto-note-row__menu-trigger" id="handle"></button>
        </div>
      </li>
    `;
    const handle = document.getElementById('handle')!;
    const body = document.getElementById('body');
    expect(resolveThreadTrailDragPreviewSource(handle)).toBe(body);
  });
});
