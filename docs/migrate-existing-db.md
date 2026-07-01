# 기존 DB 안전 마이그레이션 (분류 enum → 테이블)

이미 말씀이 등록된 DB(예: 12,859편)에서 분류를 **enum 컬럼 → Category 테이블**로
바꾸는 방법입니다. `prisma db push` 는 이 변경을 자동 적용할 수 없고 "리셋"을 요구하는데,
아래 마이그레이션을 쓰면 **데이터를 초기화하지 않고** 안전하게 옮길 수 있습니다.

> 증상: `prisma db push` 실행 시
> *"categoryId 를 required 로 추가할 수 없다 / DB 를 reset 해야 한다"* 오류.
> 원인: 기존 행이 있어 NOT NULL 컬럼을 값 없이 추가할 수 없기 때문.

## 무엇을 하나 (순서)

1. `categories` 테이블을 만들고 **기본 11개 분류**를 채운다 (id = 분류코드).
2. 각 `sermon` 의 기존 `category`(enum) 값에 맞는 **`categoryId` 를 연결**(백필)한다.
3. `categoryId` 를 **NOT NULL + 외래키**로 만들고, `needsReview` 컬럼을 추가한 뒤,
   더 이상 필요 없는 옛 `category` 컬럼과 enum 타입을 제거한다.

전 과정이 **하나의 트랜잭션**으로 실행되어 중간에 실패하면 전부 롤백되고,
여러 번 실행해도 안전(idempotent)합니다. 행 수를 전후 비교해 손실이 없는지 검증합니다.

## 실행

```bash
# 0) (강력 권장) 백업
pg_dump "$DATABASE_URL" > backup_$(date +%F).sql
#   docker compose 사용 시:
#   docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql

# 1) 마이그레이션 (행 수 전후 검증 + 분포 출력)
npx tsx scripts/migrate-category.ts
#   또는 npm run db:migrate-category

# 2) 스키마 동기화 확인 — "already in sync" 로 나오면 정상(리셋 요구 없음)
npx prisma db push

# 3) 검색 인덱스/기본 분류 보정(멱등, 안전)
npx tsx scripts/setup-search.ts
npx tsx prisma/seed.ts
```

`scripts/migrate-category.ts` 출력 예:

```
기존 말씀 수        : 12,859편
마이그레이션 후 말씀: 12,859편
categoryId 없는 행  : 0
분류별 분포:
  - 주일말씀: 8,201편
  - 기타 말씀: 2,634편
  ...
✓ 완료 (데이터 손실 없음).
```

행 수가 다르거나 `categoryId` 가 비어있는 행이 남으면 예외를 던지고 **전부 롤백**합니다.

## 순수 SQL 로 실행하고 싶다면

동일한 마이그레이션을 SQL 파일로도 제공합니다(자체 `BEGIN/COMMIT` 포함).

```bash
npx prisma db execute --file prisma/migrations/manual/001_category_enum_to_table.sql --schema prisma/schema.prisma
# 또는
psql "$DATABASE_URL" -f prisma/migrations/manual/001_category_enum_to_table.sql
```

## 마이그레이션 후

- 옛 enum 값과 새 분류의 매핑은 코드가 동일합니다(주일말씀=SUNDAY 등)이라 그대로 이어집니다.
- `기타(ETC)` 로 잘못 들어간 자료는 관리 페이지에서 **필터 → 일괄 재분류**로 정리하세요
  (docs 없이도 관리 → ‘기타(ETC)만’ 탭 → ‘현재 목록 전체 N개 이동’).
- 이후에는 `prisma db push` 가 정상 동작합니다(리셋 불필요).
