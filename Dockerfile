FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium
COPY . .

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.mjs"]
