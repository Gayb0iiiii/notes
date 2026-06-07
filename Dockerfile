FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/collab/package.json apps/collab/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

FROM base AS web
RUN pnpm --filter @notes/web build
EXPOSE 5173
CMD ["pnpm", "--filter", "@notes/web", "preview", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS api
RUN pnpm --filter @notes/api build
EXPOSE 4000
CMD ["sh", "-lc", "node apps/api/dist/migrate.js && node apps/api/dist/index.js"]

FROM base AS collab
RUN pnpm --filter @notes/collab build
EXPOSE 4001
CMD ["pnpm", "--filter", "@notes/collab", "start"]

FROM base AS tools
CMD ["sh"]
