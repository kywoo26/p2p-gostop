# RP-03A: 릴리스 웹 번들과 공개 중계 소스만 실행 이미지에 둔다.
# 빌드 전에 개발 이미지에서 `npm ci && npm run build -w packages/web`를 실행한다.
FROM p2p-gostop-dev:4 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ai/package.json packages/ai/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/relay-dev/package.json packages/relay-dev/package.json
COPY packages/web/package.json packages/web/package.json
COPY tools/sim/package.json tools/sim/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24.20.0-alpine
ENV NODE_ENV=production PORT=17777 HOST=0.0.0.0
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node packages/engine/package.json packages/engine/package.json
COPY --chown=node:node packages/engine/src packages/engine/src
COPY --chown=node:node packages/protocol/package.json packages/protocol/package.json
COPY --chown=node:node packages/protocol/src packages/protocol/src
COPY --chown=node:node packages/relay-dev/package.json packages/relay-dev/package.json
COPY --chown=node:node packages/relay-dev/src packages/relay-dev/src
COPY --chown=node:node packages/web/dist packages/web/dist
USER node
EXPOSE 17777
CMD ["node", "packages/relay-dev/src/cli.ts"]
