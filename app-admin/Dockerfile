# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false \
	NPM_CONFIG_FUND=false \
	NPM_CONFIG_PROGRESS=false
COPY app-admin/package*.json ./
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY app-admin/ ./
COPY packages/shared/ ./packages/shared/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
	NPM_CONFIG_AUDIT=false \
	NPM_CONFIG_FUND=false \
	NPM_CONFIG_PROGRESS=false
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund
EXPOSE 3001
CMD ["node", "build"]
