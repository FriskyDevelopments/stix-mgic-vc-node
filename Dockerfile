FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_SPOTIFY_CLIENT_ID
ENV VITE_SPOTIFY_CLIENT_ID=${VITE_SPOTIFY_CLIENT_ID}
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-pip ffmpeg bash cmake build-essential curl \
  && python3 -m pip install --no-cache-dir --break-system-packages 'telethon>=1.36,<2' 'py-tgcalls>=2.2,<3' \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-10000}/healthz" >/dev/null || exit 1
CMD ["npx", "tsx", "server/index.ts"]
