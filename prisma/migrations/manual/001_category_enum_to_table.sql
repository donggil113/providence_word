-- 안전 마이그레이션: sermons.category(enum) → categories 테이블 + sermons.categoryId
-- 기존 데이터를 초기화하지 않고 분류를 관계 테이블로 이전한다.
-- 하나의 트랜잭션으로 실행되며 여러 번 실행해도 안전(idempotent)하다.
--
-- 실행(둘 중 하나):
--   psql "$DATABASE_URL" -f prisma/migrations/manual/001_category_enum_to_table.sql
--   npx prisma db execute --file prisma/migrations/manual/001_category_enum_to_table.sql --schema prisma/schema.prisma
--
-- (참고: 행 수 전후 검증까지 원하면 `npx tsx scripts/migrate-category.ts` 를 쓰세요.)
-- 먼저 백업 권장:  pg_dump "$DATABASE_URL" > backup.sql

BEGIN;

-- ① categories 테이블 + 기본 11개 분류 (id = code 로 결정적 매핑) --------------
CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,
  code        text NOT NULL,
  label       text NOT NULL,
  color       text NOT NULL DEFAULT 'slate',
  "sortOrder" integer NOT NULL DEFAULT 100,
  "isBuiltin" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "categories_code_key"      ON categories(code);
CREATE INDEX        IF NOT EXISTS "categories_sortOrder_idx" ON categories("sortOrder");

INSERT INTO categories (id, code, label, color, "sortOrder", "isBuiltin", "createdAt", "updatedAt") VALUES
  ('SUNDAY','SUNDAY','주일말씀','blue',10,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('WEDNESDAY','WEDNESDAY','수요말씀','green',20,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('DAWN','DAWN','새벽말씀','indigo',30,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('FRIDAY_PRAYER','FRIDAY_PRAYER','금요기도회','amber',40,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('HOLY_SPIRIT_MEETING','HOLY_SPIRIT_MEETING','성령집회 말씀','rose',50,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('DEPARTMENT','DEPARTMENT','부서 말씀','cyan',60,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('SPECIAL','SPECIAL','특별 말씀','purple',70,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ETC','ETC','기타 말씀','slate',80,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('HOLY_SPIRIT_STORY','HOLY_SPIRIT_STORY','성령사연','pink',90,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('BIBLE_SCHOOL','BIBLE_SCHOOL','성경학교','lime',100,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('THEOLOGY','THEOLOGY','신학','orange',110,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;

-- ② 컬럼 추가(우선 nullable) + 백필 -------------------------------------------
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS "categoryId"  text;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS "needsReview" boolean NOT NULL DEFAULT false;

-- 옛 enum 값(= code = id)으로 categoryId 채우기(없으면 ETC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sermons' AND column_name='category') THEN
    UPDATE sermons s
       SET "categoryId" = COALESCE(
         (SELECT c.id FROM categories c WHERE c.code = s.category::text),
         (SELECT c.id FROM categories c WHERE c.code = 'ETC'))
     WHERE s."categoryId" IS NULL;
  ELSE
    UPDATE sermons
       SET "categoryId" = (SELECT id FROM categories WHERE code='ETC')
     WHERE "categoryId" IS NULL;
  END IF;
END $$;

-- 안전장치: categoryId 가 비어있는 행이 남으면 예외 → 전체 롤백
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM sermons WHERE "categoryId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'categoryId 백필 실패: % 행이 아직 NULL 입니다 (롤백).', n;
  END IF;
END $$;

-- ③ NOT NULL + 외래키 + 인덱스 -----------------------------------------------
ALTER TABLE sermons ALTER COLUMN "categoryId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='sermons_categoryId_fkey') THEN
    ALTER TABLE sermons
      ADD CONSTRAINT "sermons_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES categories(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sermons_categoryId_idx"  ON sermons("categoryId");
CREATE INDEX IF NOT EXISTS "sermons_needsReview_idx" ON sermons("needsReview");

-- 옛 enum 컬럼/타입 제거 (categoryId 로 이미 복사됨)
ALTER TABLE sermons DROP COLUMN IF EXISTS category;
DROP TYPE IF EXISTS "Category";

COMMIT;
