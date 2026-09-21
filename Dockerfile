FROM oven/bun:1.4.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG BASE_PATH=/
RUN bun run build

FROM oven/bun:1.4.0-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3213
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER bun
EXPOSE 3213
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD curl --fail http://localhost:3213/api/health || exit 1
CMD ["bun", "server/index.ts"]
