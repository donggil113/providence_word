/**
 * 이미 저장된 sermon 본문(contentText) 일괄 청소 (일회성)
 * ================================================================
 * PDF 재추출 없이, DB에 저장된 본문 텍스트에만 cleanBodyText() 를 적용해
 * 머리말/꼬리말·파일명·페이지표시 잔재를 제거한다.
 *
 * - contentText 필드만 수정한다. (제목·날짜·분류 등 다른 필드는 절대 건드리지 않음)
 * - 배치로 처리하며, cleanBodyText 가 멱등이라 언제든 중단·재실행해도 안전하다.
 *   (이미 청소된 본문은 다시 돌려도 바뀌지 않음)
 * - 실행 전후로 바뀐 건수/제거된 글자수를 로그로 보여준다.
 *
 * 사용:
 *   # 1) 먼저 미리보기(쓰기 없음) — 몇 건이 바뀌는지 + 예시 확인
 *   npx tsx scripts/clean-content.ts --dry-run --show 5
 *   # 2) 실제 적용
 *   npx tsx scripts/clean-content.ts
 *
 * 옵션:
 *   --dry-run       실제로 쓰지 않고 바뀔 건수만 계산
 *   --show <N>      바뀌는 예시 N건의 before/after 스니펫 출력 (기본 3)
 *   --batch <N>     배치 크기 (기본 500)
 *   --limit <N>     처음 N건만 처리 (테스트용)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cleanBodyText } from "../src/lib/extract";

const prisma = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

// 바뀐 부분 주변 스니펫(첫 차이 지점) 미리보기용
function firstDiffSnippet(before: string, after: string): { before: string; after: string } {
  let i = 0;
  const n = Math.min(before.length, after.length);
  while (i < n && before[i] === after[i]) i++;
  const from = Math.max(0, i - 30);
  return {
    before: before.slice(from, from + 90).replace(/\n/g, "⏎"),
    after: after.slice(from, from + 90).replace(/\n/g, "⏎"),
  };
}

async function main() {
  const dryRun = flag("dry-run");
  const batch = parseInt(arg("batch", "500")!, 10) || 500;
  const show = parseInt(arg("show", "3")!, 10) || 0;
  const limit = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;

  const total = await prisma.sermon.count({ where: { contentText: { not: null } } });
  console.log("▶ 본문(contentText) 청소" + (dryRun ? " [미리보기 — 쓰기 없음]" : ""));
  console.log(`  본문 있는 말씀: ${total.toLocaleString()}편`);
  console.log(`  모드: ${dryRun ? "DRY-RUN" : "적용"} / 배치 ${batch}${limit ? ` / 최대 ${limit}건` : ""}\n`);

  let scanned = 0;
  let changed = 0;
  let charsRemoved = 0;
  let shown = 0;
  let cursor: string | undefined = undefined;

  while (true) {
    const rows: { id: string; contentText: string | null }[] = await prisma.sermon.findMany({
      where: { contentText: { not: null } },
      select: { id: true, contentText: true },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const r of rows) {
      if (limit && scanned >= limit) break;
      scanned++;
      const before = r.contentText || "";
      const after = cleanBodyText(before);
      if (after !== before) {
        changed++;
        charsRemoved += before.length - after.length;
        if (show && shown < show) {
          const s = firstDiffSnippet(before, after);
          console.log(`  · [${r.id}] (-${before.length - after.length}자)`);
          console.log(`      before: …${s.before}…`);
          console.log(`      after : …${s.after}…`);
          shown++;
        }
        if (!dryRun) {
          // contentText 만 수정 (다른 필드는 건드리지 않음)
          await prisma.sermon.update({ where: { id: r.id }, data: { contentText: after } });
        }
      }
    }

    process.stdout.write(`\r  진행: ${scanned.toLocaleString()}/${total.toLocaleString()} (변경 ${changed.toLocaleString()})   `);
    if (limit && scanned >= limit) break;
  }
  process.stdout.write("\n");

  console.log("\n──────── 결과 ────────");
  console.log(`  검사: ${scanned.toLocaleString()}편`);
  console.log(`  변경${dryRun ? "(예정)" : ""}: ${changed.toLocaleString()}편`);
  console.log(`  제거된 글자수 합계: ${charsRemoved.toLocaleString()}자`);
  if (dryRun) {
    console.log("\n  ※ 미리보기였습니다. 실제 적용하려면 --dry-run 없이 다시 실행하세요.");
  } else {
    console.log("\n✓ 완료 (contentText 외 필드는 변경하지 않았습니다).");
  }
}

main()
  .catch((e) => {
    console.error("\n✗ 실패:", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
