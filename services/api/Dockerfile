FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates clamav ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN groupadd --system --gid 10001 tudimedia && useradd --system --uid 10001 --gid tudimedia --home-dir /app tudimedia
COPY --from=dependencies --chown=tudimedia:tudimedia /app/node_modules ./node_modules
COPY --chown=tudimedia:tudimedia package.json ./
COPY --chown=tudimedia:tudimedia db ./db
COPY --chown=tudimedia:tudimedia src ./src
USER 10001
EXPOSE 3000
CMD ["node", "src/server.js"]
