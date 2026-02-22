# Fixes

Documentation for troubleshooting fixes that have been implemented. Each doc describes the problem, root cause, and solution.

## Index

1. **[Desktop panel close on route change](./01-desktop-panel-close-on-route-change.md)** – Panels were closing immediately after opening on the same route due to effect running on every pathname (including initial mount).
2. **[Space member Add Note / Add Thread](./02-space-member-add-note-add-thread.md)** – Space members had no "Add Note" or "Add Thread" in the context menu, and ActionStrip did not open those panels.
3. **[Scripture verses reprocess](./03-scripture-verses-reprocess.md)** – Scripture notes created before the mobile timeout fix were saved with only the reference; a script and API endpoint reprocess them.

## Related

- **Runnable fix scripts** (data repairs): [scripts/fixes/](../../scripts/fixes/README.md)
- **Troubleshooting guides** (how to debug): [docs/troubleshooting/](../troubleshooting/README.md)
- **Known bugs** (not yet fixed): [docs/bugs/](../bugs/README.md)
