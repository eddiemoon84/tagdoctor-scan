FROM node:20-slim

# Playwright Chromium 의존성 설치
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3001
CMD ["node", "server.mjs"]
