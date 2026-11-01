# ---------------------------------------------------------------------------
# StudyFlow AI — single-container production image.
# Builds the React frontend, then serves it and the API from one Express server
# on one origin (no CORS configuration needed).
# Binds 0.0.0.0 so it works in Docker, Render, and any container host.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV CLIENT_DIR=/app/frontend/dist
ENV UPLOAD_DIR=/app/backend/uploads
ENV HOST=0.0.0.0
ENV PORT=5101
RUN mkdir -p /app/backend/uploads
EXPOSE 5101
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:5101/api/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
