FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Install exactly what the lockfile pins, production dependencies only.
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3004
CMD ["node", "server.js"]
