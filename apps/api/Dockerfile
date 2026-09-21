# Build context: raiz do repositório (ver docker-compose.yml).
FROM node:24-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.9
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# ---- build: todas as deps, gera Prisma Client e compila ----
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @diagram/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @diagram/api db:generate && pnpm --filter @diagram/api build

# ---- runtime: só deps de produção, usuário não-root ----
FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @diagram/api...
COPY apps/api/prisma apps/api/prisma
COPY apps/api/docker-entrypoint.sh apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
RUN ./node_modules/.bin/prisma generate \
  && sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh
USER node
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
