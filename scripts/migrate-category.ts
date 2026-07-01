/**
 * 안전 마이그레이션: sermons.category(enum) → categories 테이블 + sermons.categoryId
 * ================================================================
 * 기존 데이터(수만 건)를 **초기화하지 않고** 분류를 enum → 관계 테이블로 옮긴다.
 *
 *   ① categories 테이블 생성 + 기본 11개 분류 채우기
 *   ② 각 sermon 의 기존 category(enum) 값에 맞는 categoryId 연결(백필)
 *   ③ categoryId 를 NOT NULL + 외래키로 만들고, 옛 category 컬럼/enum 제거
 *   (+ needsReview 컬럼도 함께 추가)
 *
 * 전 과정이 하나의 트랜잭션 안에서 실행되며(중간 실패 시 전부 롤백),
 * 여러 번 실행해도 안전(idempotent)합니다. 행 수를 전후 비교해 데이터 손실을 검증합니다.
 *
 * 실행:
 *   npx tsx scripts/migrate-category.ts
 *   (먼저 백업 권장:  pg_dump ... > backup.sql)
 *
 * 실행 후 확인:
 *   npx prisma db push   → "already in sync" 로 나와야 정상(리셋 요구 없음)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { BUILTIN_CATEGORIES } from "../src/lib/categories";

const prisma = new PrismaClient();

async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0].count);
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS exists`,
    name
  );
  return rows[0].exists;
}
async function columnExists(table: string, col: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2) AS exists`,
    table,
    col
  );
  return rows[0].exists;
}

async function main() {
  console.log("▶ 분류(enum → 테이블) 안전 마이그레이션 시작\n");

  if (!(await tableExists("sermons"))) {
    console.log("sermons 테이블이 없습니다. 새 설치라면 이 스크립트 대신 'prisma db push' 를 쓰세요.");
    return;
  }

  const beforeCount = await count(`SELECT count(*)::bigint AS count FROM sermons`);
  console.log(`기존 말씀 수        : ${beforeCount.toLocaleString()}편`);

  const hadEnumColumn = await columnExists("sermons", "category");
  const alreadyHasCategoryId = await columnExists("sermons", "categoryId");
  console.log(`옛 category(enum) 컬럼: ${hadEnumColumn ? "있음" : "없음"}`);
  console.log(`categoryId 컬럼      : ${alreadyHasCategoryId ? "있음(재실행)" : "없음"}\n`);

  await prisma.$transaction(
    async (tx) => {
      // ① categories 테이블 + 기본 분류 -----------------------------------
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS categories (
          id text PRIMARY KEY,
          code text NOT NULL,
          label text NOT NULL,
          color text NOT NULL DEFAULT 'slate',
          "sortOrder" integer NOT NULL DEFAULT 100,
          "isBuiltin" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "categories_code_key" ON categories(code)`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "categories_sortOrder_idx" ON categories("sortOrder")`);

      // id = code (결정적) → 옛 enum 값과 바로 대응됨
      for (const c of BUILTIN_CATEGORIES) {
        await tx.$executeRawUnsafe(
          `INSERT INTO categories (id, code, label, color, "sortOrder", "isBuiltin", "createdAt", "updatedAt")
           VALUES ($1, $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (code) DO NOTHING`,
          c.code, c.label, c.color, c.sortOrder
        );
      }

      // ② 컬럼 추가(우선 nullable) + 백필 ---------------------------------
      await tx.$executeRawUnsafe(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS "categoryId" text`);
      await tx.$executeRawUnsafe(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS "needsReview" boolean NOT NULL DEFAULT false`);

      // 옛 enum 값(= code = id)으로 categoryId 채우기. 없으면 ETC 로.
      await tx.$executeRawUnsafe(`
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
        END $$;`);

      // 안전장치: 남은 NULL 이 있으면 예외 → 전체 롤백
      const remaining = await tx.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM sermons WHERE "categoryId" IS NULL`
      );
      if (Number(remaining[0].count) > 0) {
        throw new Error(`백필 실패: ${remaining[0].count}행의 categoryId 가 아직 비어있습니다. (롤백)`);
      }

      // ③ NOT NULL + 외래키 + 인덱스 -------------------------------------
      await tx.$executeRawUnsafe(`ALTER TABLE sermons ALTER COLUMN "categoryId" SET NOT NULL`);
      await tx.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='sermons_categoryId_fkey') THEN
            ALTER TABLE sermons
              ADD CONSTRAINT "sermons_categoryId_fkey"
              FOREIGN KEY ("categoryId") REFERENCES categories(id)
              ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END $$;`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "sermons_categoryId_idx" ON sermons("categoryId")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "sermons_needsReview_idx" ON sermons("needsReview")`);

      // 옛 enum 컬럼/타입 제거 (categoryId 로 이미 복사됨)
      await tx.$executeRawUnsafe(`ALTER TABLE sermons DROP COLUMN IF EXISTS category`);
      await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "Category"`);
    },
    { timeout: 600000 } // 대량 데이터 대비 넉넉하게
  );

  // 검증 ---------------------------------------------------------------
  const afterCount = await count(`SELECT count(*)::bigint AS count FROM sermons`);
  const catCount = await count(`SELECT count(*)::bigint AS count FROM categories`);
  const nullCat = await count(`SELECT count(*)::bigint AS count FROM sermons WHERE "categoryId" IS NULL`);

  console.log("──────── 검증 ────────");
  console.log(`분류 테이블         : ${catCount}종`);
  console.log(`마이그레이션 후 말씀: ${afterCount.toLocaleString()}편`);
  console.log(`categoryId 없는 행  : ${nullCat}`);

  if (afterCount !== beforeCount) {
    throw new Error(`행 수 불일치! before=${beforeCount} after=${afterCount} — 확인 필요`);
  }
  if (nullCat > 0) {
    throw new Error(`categoryId 가 비어있는 행이 ${nullCat}개 있습니다.`);
  }

  const dist = await prisma.$queryRawUnsafe<{ label: string; count: bigint }[]>(
    `SELECT c.label AS label, count(s.id)::bigint AS count
       FROM categories c LEFT JOIN sermons s ON s."categoryId" = c.id
      GROUP BY c.label ORDER BY count DESC`
  );
  console.log("\n분류별 분포:");
  for (const d of dist) console.log(`  - ${d.label}: ${Number(d.count).toLocaleString()}편`);

  console.log("\n✓ 완료 (데이터 손실 없음).");
  console.log("  다음: npx prisma db push   → 'already in sync' 로 나오면 정상입니다.");
}

main()
  .catch((e) => {
    console.error("\n✗ 마이그레이션 실패(변경사항은 롤백됨):", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
