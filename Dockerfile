# 섭리 말씀 아카이브 - 웹 애플리케이션 이미지
FROM node:22-bookworm-slim AS base

# Prisma 가 필요로 하는 openssl, 그리고 ca-certificates 설치
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── 의존성 설치 ──────────────────────────────────────────────
COPY package.json package-lock.json* ./
# lockfile 이 있으면 ci, 없으면 install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ── 소스 복사 & Prisma 클라이언트 생성 & 빌드 ────────────────
COPY . .
RUN npx prisma generate

# NEXT_PUBLIC_* 값은 빌드 시점에 코드로 박히므로 build args 로 받는다.
# (docker-compose.yml 의 build.args 를 통해 .env 값이 전달된다)
ARG NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 업로드 디렉터리(볼륨 마운트 지점)
RUN mkdir -p /app/uploads

COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "start"]
