#!/bin/sh
# 섭리 말씀 아카이브 - 백업 (DB + 업로드 파일)
#
# 프로젝트 폴더에서 실행:
#   sh scripts/backup.sh                 # ./backups 에 저장
#   sh scripts/backup.sh /mnt/backup     # 원하는 위치에 저장
#
# 매일 새벽 3시 자동 백업(cron):
#   crontab -e
#   0 3 * * * cd /opt/providence_word && sh scripts/backup.sh >> /var/log/pw-backup.log 2>&1
set -e

DEST=${1:-./backups}
STAMP=$(date +%F_%H%M)
KEEP_DAYS=${KEEP_DAYS:-30}

mkdir -p "$DEST"

echo "▶ 백업 시작: $STAMP → $DEST"

# 1) 데이터베이스 (말씀 메타데이터·본문 텍스트·계정)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$DEST/db_$STAMP.dump"
echo "  ✓ DB      : $(du -h "$DEST/db_$STAMP.dump" | cut -f1)"

# 2) 업로드된 원본 파일 (txt/pdf/hwp)
docker compose exec -T web sh -c 'tar czf - -C /app/uploads .' \
  > "$DEST/uploads_$STAMP.tar.gz"
echo "  ✓ uploads : $(du -h "$DEST/uploads_$STAMP.tar.gz" | cut -f1)"

# 3) 오래된 백업 정리
find "$DEST" -name 'db_*.dump' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
find "$DEST" -name 'uploads_*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true

echo "▶ 완료 (보관 기간 ${KEEP_DAYS}일)"
echo "  ※ 서버가 통째로 고장 날 수 있으니, 이 파일들을 다른 곳에도 복사해 두세요."
