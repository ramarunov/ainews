# Multi-stage build for @ainews/api (NestJS).
#
# This is a pnpm workspace monorepo, so the build context MUST be the repo
# root, not apps/api/. Build from the repo root with:
#   docker build -f apps/api/Dockerfile -t ainews-api .
#
# `turbo prune` isolates just the subgraph @ainews/api actually depends on
# (its own source plus any internal workspace packages it imports) so the
# install/build stages don't need the whole monorepo.

FROM node:20-alpine AS base
# Alpine ships no libssl by default. Without it, Prisma's own OpenSSL-version
# probe fails silently and falls back to a mismatched engine binary — needed
# in both the installer (so `prisma generate` detects the right target) and
# the runner (so the generated musl-openssl-3.0.x engine has something to
# link against at runtime).
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN npm install -g turbo@^2.0.0

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @ainews/api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter=@ainews/api run db:generate
RUN pnpm turbo run build --filter=@ainews/api
# Note: intentionally NOT pruning devDependencies here — the prisma CLI
# (a devDependency) needs to stay in the image so migration-job.yaml can
# run `prisma migrate deploy` from this same image.

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=installer --chown=nestjs:nodejs /app .

USER nestjs
EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "apps/api/dist/main.js"]
