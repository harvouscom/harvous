# OS 27 native implementation

Canonical write-up, including the web/native decisions still open:

[docs/future/OS_27_NATIVE_IMPLEMENTATION.md](../../../docs/future/OS_27_NATIVE_IMPLEMENTATION.md)

Short version: adopt the `.notes` App Intents schemas (`createNote`, `appendText`, `updateNote`, plus `note` / `folder` entities) before any new assistant work. The blocking product decision is still containment — native pushes `threadId: ""` and has folders, web has threads. Pick folder-equals-thread or add a real `threadId` before Siri can move a note.
