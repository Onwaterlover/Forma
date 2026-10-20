# Optional container deployment. Data lives in the mounted /app/data volume.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data
COPY --from=build /app ./
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["npm", "start"]
