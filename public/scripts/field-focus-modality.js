/**
 * Text-field focus rings: keyboard only, not on tap or click.
 *
 * `:focus-visible` deliberately does NOT do this for text fields — verified in Chromium and
 * documented at length in `src/styles/global.css`: a clicked input, textarea or select still
 * matches `:focus-visible`, because a click there is usually the start of typing. That is the
 * right call for a screen-reader / keyboard-only user tabbing through a form, and the wrong one
 * for tapping a field with a mouse or a finger, which is what this app's own design preference
 * asks for (Sept 2026).
 *
 * So this reimplements the one heuristic browsers already use for *buttons* — ring on keyboard
 * focus, not on pointer focus — but for text fields, where the platform intentionally does not.
 * It tracks which happened most recently, a keydown or a pointerdown, and stamps that verdict
 * onto the field the moment it gains focus (not continuously — typing afterwards must not
 * retroactively add or remove the ring, only the focus event itself decides).
 *
 * Suppression is an inline style, not a class + stylesheet rule: the ring is applied by ~20
 * different selectors across the app (`input:focus-visible`, `.proto-resource-add__input`,
 * `.proto-inspector-input:focus`, …), some `:focus` and some `:focus-visible`, and an inline
 * declaration beats all of them without this needing to know each one or out-specificity it.
 *
 * Scoped to text-editable form controls only — `input` (minus the button/checkbox/radio/file
 * types, which already behave correctly on their own), `textarea`, `select`. Buttons, links,
 * checkboxes and radios are untouched; their native `:focus-visible` already does the right
 * thing, and the app-wide button ring (`prototype-components.css`) already relies on that.
 */
(function () {
  'use strict';

  var TEXT_FIELD_SELECTOR =
    'input:not([type="button"]):not([type="submit"]):not([type="reset"])' +
    ':not([type="checkbox"]):not([type="radio"]):not([type="range"])' +
    ':not([type="color"]):not([type="file"]):not([type="image"]), textarea, select';

  var lastWasKeyboard = false;

  function onKeyDown(event) {
    // A bare modifier is not navigation — Shift alone before a mouse click (shift-click)
    // must not be read as "the next focus is a keyboard focus".
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') {
      return;
    }
    lastWasKeyboard = true;
  }

  function onPointerDown() {
    lastWasKeyboard = false;
  }

  function onFocusIn(event) {
    var el = event.target;
    if (!el || typeof el.matches !== 'function' || !el.matches(TEXT_FIELD_SELECTOR)) return;
    if (lastWasKeyboard) {
      el.style.removeProperty('outline');
    } else {
      el.style.outline = 'none';
    }
  }

  function onFocusOut(event) {
    var el = event.target;
    if (!el || typeof el.matches !== 'function' || !el.matches(TEXT_FIELD_SELECTOR)) return;
    // Cleared so a node React reuses for a different field doesn't carry a stale verdict.
    el.style.removeProperty('outline');
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
})();
