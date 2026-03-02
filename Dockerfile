# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Install all dependencies (shared by builder and worker)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Build Next.js application
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: Production web runner (Next.js dashboard + API)
# Runs DB migrations then starts the Next.js standalone server.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Production deps for migration script (drizzle-orm, pg)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && rm -rf /root/.npm

# Next.js standalone output (overlays on top of node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Service config + migration script + SQL migration files
COPY --chown=nextjs:nodejs services.yaml ./services.yaml
COPY --chown=nextjs:nodejs scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrations ./migrations

# Startup script: runs migrations then boots Next.js
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["/bin/sh", "./scripts/start.sh"]

# ──────────────────────────────────────────────────────────────────────────────
# Stage 4: Worker (standalone poller — for ECS Fargate worker task)
# Runs the same poller logic as the web container without the Next.js overhead.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Full node_modules needed for tsx + all runtime deps
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY services.yaml ./

USER nextjs
CMD ["node_modules/.bin/tsx", "src/worker.ts"]
