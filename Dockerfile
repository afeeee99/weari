# Recipe for Google Cloud Run: builds the web app, then runs a small Node 24 server.

# ---- 1. Build the browser app (index.html + src/ -> dist/) ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN npm run build

# ---- 2. The server that runs on Cloud Run ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run tells the app which port to use through PORT (8080 by default)
ENV PORT=8080

# Install only what the server needs to run, exactly as listed in package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
