FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY workers/shared ./workers/shared
COPY workers/media ./workers/media

ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "workers/media/service.ts"]
