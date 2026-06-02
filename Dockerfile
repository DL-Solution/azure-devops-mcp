# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and compile TypeScript ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Husky git hooks are irrelevant inside the image; disable them so `npm ci`
# does not try to install them (there is no .git here).
ENV HUSKY=0

# Install dependencies first for better layer caching. --ignore-scripts skips
# the `prepare` lifecycle (which would run a build before sources are copied).
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the sources and build to dist/.
COPY . .
RUN npm run build

# ---- Runtime stage: production dependencies + compiled output only ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HUSKY=0 \
    MCP_TRANSPORT=http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as the built-in non-root user provided by the node image.
USER node

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
