# Multi-stage Dockerfile for Harvous Self-Hosted
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set self-hosted mode
ENV SELF_HOSTED=true

# Build the application
RUN npm run build:self-hosted

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SELF_HOSTED=true

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 harvous

# Copy necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set ownership
RUN chown -R harvous:nodejs /app

USER harvous

EXPOSE 4321

ENV PORT=4321
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "dist/server/entry.mjs"]

