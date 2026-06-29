/**
 * 한글 검색 성능을 위한 PostgreSQL 확장/인덱스 설정.
 *
 * pg_trgm 확장을 켜고, 검색에 사용하는 컬럼들에 GIN trigram 인덱스를 만든다.
 * 이렇게 하면 ILIKE '%단어%' 형태의 부분 일치(한글 포함) 검색이 빨라진다.
 *
 * 모든 구문은 IF NOT EXISTS 로 멱등(idempotent)하게 작성되어,
 * 컨테이너가 재시작될 때마다 안전하게 다시 실행할 수 있다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements: string[] = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,

  // 본문/제목 등 자유 텍스트 컬럼 — trigram GIN 인덱스
  `CREATE INDEX IF NOT EXISTS sermons_title_trgm
     ON sermons USING gin (title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_content_trgm
     ON sermons USING gin ("contentText" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_scripture_trgm
     ON sermons USING gin (scripture gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_preacher_trgm
     ON sermons USING gin (preacher gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_event_trgm
     ON sermons USING gin ("eventName" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_department_trgm
     ON sermons USING gin (department gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS sermons_summary_trgm
     ON sermons USING gin (summary gin_trgm_ops)`,
];

async function main() {
  for (const sql of statements) {
    process.stdout.write(`  • ${sql.split("\n")[0].trim()} ...\n`);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ 검색 인덱스 설정 완료");
}

main()
  .catch((e) => {
    console.error("검색 인덱스 설정 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
