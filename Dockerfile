FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY config ./config

WORKDIR /app/backend
EXPOSE 8080
CMD ["npm", "start"]
