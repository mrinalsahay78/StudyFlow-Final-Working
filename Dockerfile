# ---------------------------------------------------------------------------
# StudyFlow AI — single-container production image.
# Builds the React frontend, then serves it and the API from one Express server
# on one origin (no CORS configuration needed).
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
RUN mkdir -p /app/backend/uploads
EXPOSE 5001
CMD ["node", "server.js"]
