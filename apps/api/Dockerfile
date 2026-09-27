# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:26-alpine AS base
ENV HUSKY=0
WORKDIR /repo
COPY package.json ./
RUN npm install -g "$(node -p 'require("./package.json").packageManager')"

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @workspace/api --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
COPY --from=prune /repo/tsconfig.json ./tsconfig.json
RUN pnpm --filter @workspace/api build \
  && pnpm --filter @workspace/api deploy --prod --legacy /app

FROM node:26-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "dist/index.js"]
