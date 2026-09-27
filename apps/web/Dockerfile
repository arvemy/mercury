# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:26-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HUSKY=0 TURBO_TELEMETRY_DISABLED=1
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /repo
COPY package.json ./
RUN corepack install

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.4 prune web --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
COPY --from=prune /repo/tsconfig.json ./tsconfig.json
RUN pnpm exec turbo run build --filter=web

FROM caddy:2-alpine
RUN addgroup -S web && adduser -S -G web web && chown -R web:web /data /config
COPY --from=build /repo/apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
USER web
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1
