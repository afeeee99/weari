# Recipe for Google Cloud Run: a small Node 24 server that runs server.js.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run tells the app which port to use through PORT (8080 by default)
ENV PORT=8080

# Install only what the server needs to run, exactly as listed in package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the server and the app's public files (never .env — see .dockerignore)
COPY server.js index.html styles.css app.js stylist.js swap-data.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
