# iOS: SwiftUI `PlatformTextFieldAdaptor` layout warning

## Symptom

Xcode console repeats a line similar to:

```text
<_TtGC7SwiftUI22AppKitPlatformViewHostGVS_...PlatformTextFieldAdaptor__: 0x…> has an maximum length (18.345171) that doesn't satisfy min (18.345171) <= max (18.345171).
```

The type name mentions **AppKit** even on **iOS** — that is normal for SwiftUI’s internal native text-field bridge logging.

## Severity

**Benign** unless you also see visible problems (clipped text, wrong row height, keyboard/focus bugs). The message is a layout-solver diagnostic, not a character-limit or crash.

“Maximum length” here is a **layout axis size in points** (often ~18pt = one line of text), not `String.count`.

## Likely Harvous sources

| Surface | File |
|--------|------|
| Home hub bottom search pill | [`native/Harvous/ContentView.swift`](../native/Harvous/ContentView.swift) — `HarvousIOSInlineBottomChromeRow` |
| Folder name editor popover | [`native/Harvous/Views/FolderChipPopover.swift`](../native/Harvous/Views/FolderChipPopover.swift) — `FolderNameChromeRow` |
| Note inspector “Add tag” row | [`native/Harvous/Views/NoteInspectorView.swift`](../native/Harvous/Views/NoteInspectorView.swift) — `addTagRow` |

Same pattern was reduced on macOS by giving `TextField` a clear horizontal proposal and avoiding equal `minHeight`/`maxHeight` on the field itself.

## Bisect in Xcode

1. Filter console for `PlatformTextFieldAdaptor` or `maximum length`.
2. Repro one surface at a time:
   - **Hub search**: open app at list hub, tap bottom search capsule, type.
   - **Folder popover**: open a note, folder chip → edit name.
   - **Tags**: open inspector → “Add tag” field.
3. Toggle **Larger Text** once; if warnings spike only then, suspect rigid fixed height on the row (not the field).

## Code rules (when adding new `TextField`s)

1. Put **`.frame(maxWidth: .infinity)`** on the `TextField` inside horizontal stacks (before trailing buttons or overlay padding).
2. **Do not** set equal **`minHeight` and `maxHeight`** on the `TextField` — size the wrapping `HStack` / row instead.
3. Prefer **`.frame(minHeight:)`** on the row over **`.frame(height:)`** when the row should match chrome metrics (e.g. `HarvousIOSMorphingChromeLayout.chromeControlsHeight` for 44pt capsules).
4. Use existing typography tokens (`HarvousTypography.searchField`, `body`, etc.) instead of one-off point sizes that fight intrinsic line height.

## Related

- macOS console triage (same adaptor spam): [macOS TextField console triage](d6274bd6-837a-4ed8-a7b5-4b0a19649cb6) — `HighlightAnnotationPopover` / collection popover width fixes.
- Bottom chrome metrics: [`native/Harvous/Views/MorphingChromeBar.swift`](../native/Harvous/Views/MorphingChromeBar.swift) — `HarvousIOSMorphingChromeLayout`.
