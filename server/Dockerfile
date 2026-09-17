# --- Production image for the Express API ---
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies separately to leverage Docker layer caching.
# python3/make/g++ are present for any native rebuild of better-sqlite3.
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runtime
# Run as the unprivileged node user.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Persist the SQLite database on a mounted volume.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/stock-system.db

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
