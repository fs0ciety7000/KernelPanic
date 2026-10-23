# syntax=docker/dockerfile:1
# Kernel_Panic web image: Astro site at /, game (SvelteKit SPA) at /play/, /api/ proxied to the server.
# Build context: repository root.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Install with the lockfile only (better layer caching).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/game/package.json apps/game/
COPY apps/site/package.json apps/site/
COPY apps/server/package.json apps/server/
COPY packages/kernel/package.json packages/kernel/
COPY packages/scenario-kit/package.json packages/scenario-kit/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm scenarios \
 && KP_BASE=/play pnpm --filter @kp/game build \
 && pnpm --filter @kp/site build

FROM nginx:1.27-alpine
ENV KP_API_UPSTREAM=server:8080 \
    KP_RESOLVER=127.0.0.11
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/site/dist /usr/share/nginx/html
COPY --from=build /repo/apps/game/build /usr/share/nginx/html/play
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
