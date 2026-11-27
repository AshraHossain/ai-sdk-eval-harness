# syntax=docker/dockerfile:1
# Multi-stage build: dev dependencies, sources and the build cache stay in the build stage.

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    EVAL_MODE=mock \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 10001 appuser && adduser -S -D -H -u 10001 -G appuser appuser
# No package manager in the runtime image. The app starts with `node server.js`, and npm's own
# bundled dependencies were the only vulnerable packages Trivy found in this base image (10 HIGH,
# all under /usr/local/lib/node_modules/npm). They cannot be patched from here, and a package
# manager in a production image is attack surface we do not need.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/lib/node_modules/corepack /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
# Traced standalone server: only the node_modules the app actually imports.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Datasets, fixtures, thresholds and baselines are read from disk at runtime.
COPY --from=build /app/evals ./evals
RUN mkdir -p reports && chown appuser:appuser reports
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
