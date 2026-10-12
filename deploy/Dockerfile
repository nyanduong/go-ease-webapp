# Registry index digests verified 2026-10-11; do not silently advance tags.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS node-base
# Signed official bookworm repositories; missing reviewed versions fail the build.
RUN apt-get update \
 && apt-get install -y --only-upgrade --no-install-recommends perl-base=5.36.0-7+deb12u4 \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && test "$(dpkg-query -W -f='${Version}' perl-base)" = '5.36.0-7+deb12u4' \
 && rm -rf /var/lib/apt/lists/*

FROM node-base AS build
WORKDIR /source
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter goease --filter @goease/api... --filter @goease/web...
RUN pnpm --filter @goease/contracts build && pnpm --filter @goease/api build
RUN pnpm run deploy:artifact production /artifacts/api \
 && pnpm run deploy:artifact operator /artifacts/operator
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

FROM node-base AS runtime-base
# The app/operator invoke Node directly. Keep build tooling only in build stages.
RUN rm -rf /usr/local/lib/node_modules/npm \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx \
 && test ! -e /usr/local/lib/node_modules/npm \
 && test ! -L /usr/local/bin/npm && test ! -L /usr/local/bin/npx

FROM runtime-base AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /artifacts/api/ ./
USER node
EXPOSE 3000
CMD ["node", "--env-file=/run/secrets/api_env", "dist/src/main.js"]

FROM runtime-base AS operator
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /artifacts/operator/ ./
USER node
ENTRYPOINT ["node", "--env-file=/run/secrets/operator_env", "dist/scripts/staging-operator.js"]
CMD ["verify"]

FROM postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336 AS pg-tools
RUN apt-get update \
 && apt-get install -y --only-upgrade --no-install-recommends liblzma5=5.8.1-1+deb13u2 xz-utils=5.8.1-1+deb13u2 \
 && test "$(dpkg-query -W -f='${Version}' liblzma5)" = '5.8.1-1+deb13u2' \
 && test "$(dpkg-query -W -f='${Version}' xz-utils)" = '5.8.1-1+deb13u2' \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /usr/local/bin/gosu
# This custom non-root entrypoint never uses gosu. Upstream DB image is separate.
COPY --chmod=0555 deploy/pg-tools.sh /usr/local/bin/goease-pg-tools
USER postgres
ENTRYPOINT ["/usr/local/bin/goease-pg-tools"]

FROM nginx:1.30.5-alpine3.24@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 AS admin
RUN apk add --no-cache --upgrade libexpat=2.8.5-r0 libpng=1.6.59-r0 nghttp2-libs=1.70.0-r0 pcre2=10.49-r0 tiff=4.7.2-r0 zlib=1.3.2-r1
COPY --from=web-build /source/apps/web/dist/ /srv/goease/
COPY deploy/nginx.conf.template /etc/nginx/goease.conf.template
COPY --chmod=0555 deploy/proxy-entrypoint.sh /usr/local/bin/goease-proxy
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/goease-proxy"]
