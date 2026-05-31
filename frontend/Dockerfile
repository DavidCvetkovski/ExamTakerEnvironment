# ─────────────────────────────────────────────────────────
# Frontend multi-stage Dockerfile
# Stage 1: deps — install node_modules
# Stage 2: builder — build Next.js production bundle
# Stage 3: runtime — run standalone Next.js server as non-root
# ─────────────────────────────────────────────────────────

# --- Stage 1: deps ---
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- Stage 2: builder ---
FROM node:20-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_API_BASE_URL must be set at build time for the Next.js bundle
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

# --- Stage 3: runtime ---
FROM node:20-alpine AS runtime

RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --ingroup nodejs --shell /bin/sh --disabled-password nextjs

WORKDIR /app

# Copy only the standalone Next.js output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
