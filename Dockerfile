# syntax=docker/dockerfile:1
# Multi-stage build: dev dependencies, sources and the build cache stay in the build stage.

FROM node:26-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    EVAL_MODE=mock \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 10001 appuser && adduser -S -D -H -u 10001 -G appuser appuser
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
