# ── Front-end ───────────────────────────────────────────────────
FROM node:20-alpine AS fe
WORKDIR /app

# copy manifests first
COPY frontend/package*.json frontend/vite.config.js ./

# install ALL deps (we need dev-deps to build)
RUN npm install

# copy sources
COPY frontend/index.html ./index.html
COPY frontend/src        ./src
# COPY frontend/public   ./public        # ← uncomment if you use /public

# build → dist/
RUN npm run build


# ── Back-end ────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git openssh

# backend deps (only production ones)
COPY backend/package*.json ./
RUN npm install --omit=dev            # ← works with or without lockfile

# backend source
COPY backend/src ./src

# compiled front-end bundle served statically by Express
COPY --from=fe /app/dist ./public

EXPOSE 8080
CMD ["node", "src/index.js"]
