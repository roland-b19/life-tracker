# Azure-only reminder worker (enqueue + send jobs). Built with the worker/ folder as context: docker build --platform linux/amd64 -t life-tracker-worker worker
# It shares nothing with the web image or the Vercel build.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs worker \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=dependencies --chown=worker:nodejs /app/node_modules ./node_modules
COPY --chown=worker:nodejs package.json clients.mjs enqueue.mjs lib.mjs send.mjs ./
USER worker
# Each job picks its script: command ["node"], args ["enqueue.mjs"] or ["send.mjs"].
CMD ["node", "enqueue.mjs"]
