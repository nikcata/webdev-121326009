# One stage is sufficient because this app has no separate build step.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy manifests first so dependency installation is cached while source changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
