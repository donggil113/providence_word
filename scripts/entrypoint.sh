#!/bin/sh
set -e

echo "▶ 섭리 말씀 아카이브 시작"

# 1) 데이터베이스 스키마 적용 (DB 가 준비될 때까지 재시도)
echo "▶ 데이터베이스 스키마 적용 중..."
ATTEMPT=0
until npx prisma db push --skip-generate; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 30 ]; then
    echo "✗ 데이터베이스에 연결할 수 없습니다. 종료합니다."
    exit 1
  fi
  echo "  데이터베이스 준비 대기 중... (${ATTEMPT}/30) 3초 후 재시도"
  sleep 3
done

# 2) 한글 검색용 확장/인덱스 설정 (멱등)
echo "▶ 검색 인덱스 설정 중..."
npx tsx scripts/setup-search.ts

# 3) 최초 관리자 계정 시드 (멱등)
echo "▶ 초기 데이터 시드 중..."
npx tsx prisma/seed.ts

# 4) 서버 시작
echo "▶ 웹 서버 시작 (포트 ${PORT:-3000})"
exec "$@"
