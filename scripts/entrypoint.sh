#!/bin/sh
set -e

echo "▶ 섭리 말씀 아카이브 시작"

# 접속 대상 확인용(비밀번호는 가림). 오타·환경변수 누락을 바로 알아채기 위함.
echo "  DATABASE_URL: $(echo "${DATABASE_URL:-(설정되지 않음)}" | sed 's|://[^@]*@|://***:***@|')"

# 1) 데이터베이스 스키마 적용 (DB 가 준비될 때까지 재시도)
echo "▶ 데이터베이스 스키마 적용 중..."
ATTEMPT=0
until OUT=$(npx prisma db push --skip-generate 2>&1); do
  echo "$OUT"

  # P1013 = 연결 문자열 자체가 잘못된 경우. 기다려도 절대 해결되지 않으므로 즉시 중단한다.
  if echo "$OUT" | grep -q "P1013"; then
    echo ""
    echo "✗ DATABASE_URL 형식이 잘못되었습니다. (.env 를 확인하세요)"
    echo "  가장 흔한 원인: DB 비밀번호에 / + = @ : ? 같은 문자가 들어가 URL 이 깨진 경우."
    echo "  해결: 영문+숫자 비밀번호로 바꾸세요 (openssl rand -hex 24)."
    echo "        POSTGRES_PASSWORD 와 DATABASE_URL 안의 비밀번호가 같아야 합니다."
    echo "        이미 만들어진 DB 라면 ALTER USER 로 DB 쪽 비밀번호도 함께 바꿔야 합니다."
    echo "        자세한 절차: docs/deploy-contabo.md 의 'DB 비밀번호 바꾸기'"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 30 ]; then
    echo "✗ 데이터베이스에 연결할 수 없습니다. 종료합니다."
    exit 1
  fi
  echo "  데이터베이스 준비 대기 중... (${ATTEMPT}/30) 3초 후 재시도"
  sleep 3
done
echo "$OUT"

# 2) 한글 검색용 확장/인덱스 설정 (멱등)
echo "▶ 검색 인덱스 설정 중..."
npx tsx scripts/setup-search.ts

# 3) 최초 관리자 계정 시드 (멱등)
echo "▶ 초기 데이터 시드 중..."
npx tsx prisma/seed.ts

# 4) 서버 시작
echo "▶ 웹 서버 시작 (포트 ${PORT:-3000})"
exec "$@"
