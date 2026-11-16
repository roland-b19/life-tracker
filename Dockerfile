FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Feature flags are inlined at build time. scripts/azure-deploy.sh turns push on; the Claude Assistant stays off on Azure.
ARG NEXT_PUBLIC_CLAUDE_ENABLED=false
ARG NEXT_PUBLIC_PUSH_ENABLED=false
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
RUN AUTH_DEV=false \
  NEXTAUTH_SECRET=build-only-placeholder \
  NEXTAUTH_URL=http://localhost:3000 \
  AUTH_AZURE_TENANT_ID=build-tenant \
  AUTH_AZURE_CLIENT_ID=build-client \
  AUTH_AZURE_CLIENT_SECRET=build-client-secret \
  AUTH_ISSUER=https://build.example.com/v2.0 \
  DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
  npm run build

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The standalone output has no public/: without it /sw.js, the manifest, the icons and the 3D models are 404 (found live 2026-11-16: no service worker, so no push button).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The Azure migration job runs scripts/db-init.cjs from this image: it needs the Drizzle migrator and the migration files.
COPY --from=dependencies --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=nextjs:nodejs drizzle ./drizzle
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]
