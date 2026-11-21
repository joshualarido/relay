FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Self-contained migration runner (better-sqlite3 resolves from the standalone node_modules).
RUN npx esbuild scripts/migrate.ts --bundle --platform=node --format=esm --external:better-sqlite3 \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --outfile=migrate.mjs

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=/app/data/relay.db
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/migrate.mjs ./migrate.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
