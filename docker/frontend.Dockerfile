FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM deps AS build
COPY frontend/ frontend/
ARG PUBLIC_API_URL=http://localhost:3000
ARG PUBLIC_WS_URL=ws://localhost:3000
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
RUN npm run build --workspace=frontend

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
COPY --from=build /app/frontend/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/package.json ./package.json
EXPOSE 5173
CMD ["node", "build"]
