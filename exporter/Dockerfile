# Cloud Run: Node + system Chromium (skip Puppeteer's bundled download)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js ./

ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "index.js"]
