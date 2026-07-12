# Backend service (Railway or any container host).
# better-sqlite3 compiles a native module, so build on the full image.
FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY fixtures.seed.json ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/fixtures.seed.json ./
# DB_PATH should point at a mounted volume, e.g. /data/acertana.db
EXPOSE 8787
CMD ["node", "dist/main.js"]
