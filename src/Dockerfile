# ────────────────────────────────────────────────────────────────
#  Front-end stage
#  • copy *all* source files first
#  • then install deps  → build
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS fe
WORKDIR /app

# 1️⃣  package manifest + lockfile
COPY frontend/package.json frontend/vite.config.js ./

# 2️⃣  install dependencies
RUN npm ci --omit=dev

# 3️⃣  the actual source + static entry HTML
COPY frontend/index.html ./index.html
COPY frontend/src        ./src
# (optionally) COPY frontend/public ./public

# 4️⃣  production build → dist/
RUN npm run build


# ────────────────────────────────────────────────────────────────
#  Back-end stage
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git openssh

# backend deps
COPY backend/package.json ./
RUN npm ci --omit=dev

# backend source
COPY backend/src ./src

# compiled front-end (dist/) served from Express “public/”
COPY --from=fe /app/dist ./public

EXPOSE 8080
CMD ["node", "src/index.js"]
