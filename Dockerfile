# Harvous API — the Hono server (server/fly.ts) as a long-lived process.
#
# Two stages: the builder holds the full dependency tree only long enough for
# esbuild to produce one self-contained bundle, so the runtime image carries no
# node_modules at all — just Node, Chromium, and dist-server/api.cjs.

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --ignore-scripts

# Everything build:fly touches: the server, the shared/src code it imports via
# the @=src alias, and scripts/generate-founder-letter.js (which generates
# server/routes/founder-letter.inline.generated.ts from src/data before esbuild).
COPY server ./server
COPY src ./src
COPY shared ./shared
COPY scripts ./scripts
COPY tsconfig.json ./

RUN npm run build:fly

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Chromium for OG screenshots. On Netlify this was @sparticuz/chromium plus a
# 22-entry included_files list; a real image just installs the browser.
# og-screenshot.ts picks it up via CHROME_EXECUTABLE_PATH.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    API_PORT=8080 \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=builder /build/dist-server/api.cjs ./api.cjs

USER node
EXPOSE 8080

CMD ["node", "api.cjs"]
