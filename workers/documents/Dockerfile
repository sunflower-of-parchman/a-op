FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY workers/documents/requirements.txt ./workers/documents/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r workers/documents/requirements.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY workers/documents ./workers/documents

ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "workers/documents/index.ts", "--watch"]
