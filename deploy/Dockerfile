# Registry index digests verified 2026-10-11; do not silently advance tags.
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build
WORKDIR /source
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter goease --filter @goease/api... --filter @goease/web...
RUN pnpm --filter @goease/contracts build && pnpm --filter @goease/api build
RUN pnpm exec node deploy/locked-deploy.mjs production /artifacts/api \
 && pnpm exec node deploy/locked-deploy.mjs operator /artifacts/operator
# Operator tools never enter the runtime allowlist or image.
RUN mkdir -p /artifacts/operator/dist/scripts/lib \
 && cp apps/api/dist/scripts/staging-operator.js /artifacts/operator/dist/scripts/ \
 && cp apps/api/dist/scripts/lib/runtime-role.js /artifacts/operator/dist/scripts/lib/ \
 && cp apps/api/dist/src/database/seed.js /artifacts/operator/dist/src/database/ \
 && cp apps/api/prisma7.config.ts /artifacts/operator/ \
 && cp -R apps/api/prisma /artifacts/operator/
RUN node deploy/prepare-operator.mjs /artifacts/operator
RUN node deploy/prepare-artifact.mjs /artifacts/api && node deploy/verify-artifact.mjs /artifacts/api \
 && node --input-type=module -e "import {isolateProjectLinks} from './deploy/prepare-artifact.mjs'; await isolateProjectLinks('/artifacts/operator')"

FROM build AS web-build
ARG VITE_GOOGLE_WEB_CLIENT_ID
ENV VITE_API_BASE_URL=/api
RUN node deploy/validate.mjs && pnpm --filter @goease/web build

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /artifacts/api/ ./
USER node
EXPOSE 3000
CMD ["node", "--env-file=/run/secrets/api_env", "dist/src/main.js"]

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS operator
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /artifacts/operator/ ./
USER node
ENTRYPOINT ["node", "--env-file=/run/secrets/operator_env", "dist/scripts/staging-operator.js"]
CMD ["verify"]

FROM postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336 AS pg-tools
COPY --chmod=0555 deploy/pg-tools.sh /usr/local/bin/goease-pg-tools
USER postgres
ENTRYPOINT ["/usr/local/bin/goease-pg-tools"]

FROM nginx:1.30.5-alpine3.24@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 AS admin
COPY --from=web-build /source/apps/web/dist/ /srv/goease/
COPY deploy/nginx.conf.template /etc/nginx/goease.conf.template
COPY --chmod=0555 deploy/proxy-entrypoint.sh /usr/local/bin/goease-proxy
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/goease-proxy"]
