# ---------------------------------------------------------------------------
# Holy Sai Smart School 360 — single image serving the REST API and the web app
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY database/package.json database/
RUN npm ci
COPY . .
RUN npm run build --workspace backend && npm run build --workspace frontend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST_DIR=/app/frontend/dist \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY database/package.json database/
RUN npm ci --omit=dev --workspace backend && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
COPY database/migrations database/migrations
COPY docs/openapi docs/openapi
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Runs pending migrations, then the server, in one process so that node is PID 1
# and receives SIGTERM for a graceful shutdown.
CMD ["node", "backend/dist/scripts/start.js"]
