FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22.22.0-bookworm-slim
WORKDIR /app
ARG JAMRELAY_VERSION=development
LABEL org.opencontainers.image.title="JamRelay" \
      org.opencontainers.image.source="https://github.com/makkiattooo/JamRelay" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version=$JAMRELAY_VERSION
ENV NODE_ENV=production JAMRELAY_INSTALL_MODE=docker JAMRELAY_CONFIG_PATH=/data/jamrelay.env JAMRELAY_DATA_DIR=/data
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY db/migrations ./db/migrations
COPY assets ./assets
COPY CHANGELOG.md LICENSE LICENSING.md README.md ./
COPY .github/cli/notices.json ./.github/cli/notices.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 5267
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5267) + '/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["start"]
