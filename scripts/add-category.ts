/**
 * 말씀 종류(분류) 추가 — 명령줄 버전
 * ================================================================
 * 평소에는 웹에서 [관리 → 분류 관리] 화면으로 추가하는 것이 편합니다.
 * 이 스크립트는 아직 웹에 접속할 수 없을 때(도메인 연결 전 등)나
 * 서버에서 한 번에 처리하고 싶을 때 사용합니다.
 *
 * 사용:
 *   # 현재 분류 목록 보기
 *   npx tsx scripts/add-category.ts --list
 *
 *   # 추가 (코드는 CSV 일괄 등록에서 쓰이므로 영문 대문자로 직접 주는 것을 권장)
 *   npx tsx scripts/add-category.ts --label 계시말씀 --code REVELATION --color teal
 *
 * docker compose 로 운영 중이라면:
 *   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
 *     run --rm --entrypoint sh web -c 'npx tsx scripts/add-category.ts --label 계시말씀 --code REVELATION'
 *
 * 옵션:
 *   --list            현재 분류 목록만 출력하고 종료
 *   --label <이름>    화면에 표시될 분류명 (필수)
 *   --code <코드>     영문 대문자 코드. 생략하면 분류명에서 자동 생성
 *   --color <색>      뱃지 색 (기본 teal)
 *   --order <숫자>    표시 순서. 생략하면 맨 뒤
 */
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { normalizeCode, PALETTE_NAMES } from "../src/lib/categories";

const prisma = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--"))
    return process.argv[i + 1];
  return fallback;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

async function listCategories() {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      code: true, label: true, color: true, sortOrder: true, isBuiltin: true,
      _count: { select: { sermons: true } },
    },
  });
  console.log(`현재 분류 ${rows.length}종:\n`);
  for (const r of rows) {
    const badge = r.isBuiltin ? "기본" : "추가";
    console.log(
      `  [${badge}] ${r.label}` +
        `\n         코드: ${r.code} / 색: ${r.color} / 순서: ${r.sortOrder} / ${r._count.sermons.toLocaleString()}편`
    );
  }
}

async function main() {
  if (flag("list")) {
    await listCategories();
    return;
  }

  const label = arg("label")?.trim();
  if (!label) {
    console.error("--label 이 필요합니다.");
    console.error("  예: npx tsx scripts/add-category.ts --label 계시말씀 --code REVELATION");
    console.error("  현재 목록 보기: npx tsx scripts/add-category.ts --list");
    process.exit(1);
  }
  if (label.length > 50) {
    console.error("분류명은 50자 이하여야 합니다.");
    process.exit(1);
  }

  // 코드: 지정값 우선, 없으면 분류명에서 생성. 한글만 있으면 남는 글자가 없어 자동 코드가 된다.
  const givenCode = arg("code");
  let code = normalizeCode(givenCode || label);
  let autoCode = false;
  if (!code) {
    code = "CAT_" + crypto.randomBytes(3).toString("hex").toUpperCase();
    autoCode = true;
  }

  const colorArg = arg("color", "teal")!;
  if (!PALETTE_NAMES.includes(colorArg)) {
    console.error(`색 '${colorArg}' 은(는) 사용할 수 없습니다.`);
    console.error(`  가능한 값: ${PALETTE_NAMES.join(", ")}`);
    process.exit(1);
  }

  // 중복 확인 — 코드는 유일해야 하고, 같은 이름이 이미 있으면 실수일 가능성이 높다.
  const byCode = await prisma.category.findUnique({ where: { code } });
  if (byCode) {
    console.error(`이미 사용 중인 코드입니다: ${code} (${byCode.label})`);
    console.error("  --code 로 다른 코드를 지정하세요.");
    process.exit(1);
  }
  const byLabel = await prisma.category.findFirst({ where: { label } });
  if (byLabel) {
    console.error(`'${label}' 분류가 이미 있습니다. (코드: ${byLabel.code})`);
    console.error("  같은 이름을 또 만들면 헷갈리니, 기존 분류를 사용하세요.");
    process.exit(1);
  }

  // 순서: 지정 없으면 맨 뒤
  let sortOrder = arg("order") ? parseInt(arg("order")!, 10) : undefined;
  if (sortOrder === undefined || isNaN(sortOrder)) {
    const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
    sortOrder = (max._max.sortOrder ?? 0) + 10;
  }

  const created = await prisma.category.create({
    data: { code, label, color: colorArg, sortOrder, isBuiltin: false },
  });

  console.log(`✓ 말씀 종류 '${created.label}' 을(를) 추가했습니다.`);
  console.log(`  코드  : ${created.code}`);
  console.log(`  색    : ${created.color}`);
  console.log(`  순서  : ${created.sortOrder}`);
  if (autoCode) {
    console.log("");
    console.log("  ※ 분류명이 한글이라 코드를 자동 생성했습니다.");
    console.log("     CSV 일괄 등록(import.ts)을 쓰실 계획이면 --code 로");
    console.log("     알아보기 쉬운 영문 코드를 직접 지정하는 편이 좋습니다.");
  }
  console.log("");
  console.log("  홈 화면 '말씀 종류', 검색 필터, 새 말씀 등록 폼에 바로 반영됩니다.");
  console.log("  이름·색·순서는 [관리 → 분류 관리] 에서 언제든 바꿀 수 있습니다.");
}

main()
  .catch((e) => {
    console.error("실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
