FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM deps AS build
COPY api/ api/
WORKDIR /app
RUN npm run prisma:generate --workspace=api \
  && npm run build --workspace=api

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api ./api
COPY docker/api-entrypoint.sh /app/docker/api-entrypoint.sh
RUN chmod +x /app/docker/api-entrypoint.sh
WORKDIR /app/api
EXPOSE 3000
ENTRYPOINT ["/app/docker/api-entrypoint.sh"]
