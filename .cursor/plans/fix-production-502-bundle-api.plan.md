---
name: ""
overview: ""
todos: []
isProject: false
---

# Fix production 502: bundle API dependencies

## Root cause (confirmed)

Netlify function crashes on import with:

```text
Error: Cannot find package 'drizzle-orm' imported from /var/task/api.mjs
```

The `build:api` script uses `**--packages=external**`, so npm packages are not bundled into `api.mjs`. At runtime only `api.mjs` (and whatever Netlify puts in `/var/task/`) is present—there is no `node_modules` with `drizzle-orm`, `@libsql/client`, `hono`, etc. So Node fails to resolve the imports and the function crashes before handling any request → 502 for all `/api/*` (including `/api/health`).

## Fix: bundle dependencies into the function

Stop externalizing packages so the function is self-contained and does not rely on `node_modules` at runtime.

### 1. Update `build:api` in [package.json](package.json)

**Current (line 26):**

```json
"build:api": "esbuild server/netlify.ts --bundle --platform=node --target=node22 --format=esm --packages=external --alias:@=src --outfile=netlify/functions/api.mjs",
```

**Change:** Remove `--packages=external` so esbuild bundles all imports (drizzle-orm, @libsql/client, hono, @clerk/backend, etc.) into the output.

**New:**

```json
"build:api": "esbuild server/netlify.ts --bundle --platform=node --target=node22 --format=esm --alias:@=src --outfile=netlify/functions/api.mjs",
```

Optional: if you hit a package that must stay external (e.g. native addon), add it back with `--external:package-name` for that one only.

### 2. Verify build and deploy

- Run locally: `npm run build:api`
  - Should complete without errors.
  - `netlify/functions/api.mjs` will be larger (deps inlined).
- Commit and push, or trigger a Netlify deploy so the new function is deployed.
- In the browser, open `https://app.harvous.com/api/health` — expect 200 and `{"status":"ok","timestamp":...}`.
- Confirm app data loads (navigation, profile, content, etc.).

### 3. Optional: keep function smaller (advanced)

If the bundled `api.mjs` is too large (Netlify has a 50MB uncompressed limit), you can:

- Mark only a few heavy or problematic packages as external and ensure they are available at runtime (e.g. by using Netlify’s default bundler for the function instead of pre-bundling), or
- Split the function into smaller entry points (more involved).

For most stacks, a single bundled function is fine; only revisit if Netlify reports size or timeout issues.

## Summary


| Step | Action                                                                        |
| ---- | ----------------------------------------------------------------------------- |
| 1    | In `package.json`, remove `--packages=external` from the `build:api` script.  |
| 2    | Run `npm run build:api` and confirm `netlify/functions/api.mjs` is generated. |
| 3    | Deploy to Netlify and test `/api/health` and app data loading.                |


