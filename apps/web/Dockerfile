# Multi-stage build for @ainews/web (Next.js, standalone output).
#
# This is a pnpm workspace monorepo, so the build context MUST be the repo
# root, not apps/web/. Build from the repo root with:
#   docker build -f apps/web/Dockerfile -t ainews-web .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN npm install -g turbo@^2.0.0

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @ainews/web --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Public, build-time API base URL. Override with --build-arg if the API
# lives at a different origin for a given environment.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm turbo run build --filter=@ainews/web

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=installer /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3100
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
