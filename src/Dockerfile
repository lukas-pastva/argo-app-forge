# ——— Front‑end ———
FROM node:20-alpine AS fe
WORKDIR /app
COPY frontend/package.json frontend/vite.config.js ./
COPY frontend/index.html ./
COPY frontend/src ./src
RUN npm i && npm run build

# ——— Back‑end ———
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git openssh

COPY backend/package.json ./
RUN npm i --omit=dev
COPY backend/src ./src
COPY --from=fe /app/dist ./public
EXPOSE 8080
CMD ["node","src/index.js"]