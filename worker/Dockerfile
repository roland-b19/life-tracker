# Azure-only reminder worker (enqueue + send jobs). Built with the worker/ folder as context: docker build --platform linux/amd64 -t life-tracker-worker worker
# It shares nothing with the web image or the Vercel build.
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner
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
