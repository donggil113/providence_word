/**
 * 대량 말씀 일괄 등록 스크립트 (1978년부터의 기존 자료 마이그레이션용)
 *
 * CSV 파일을 읽어 말씀과 첨부 파일을 한꺼번에 등록한다.
 *
 * CSV 컬럼(헤더 필수, 순서 무관):
 *   preachedAt  - 선포일 (YYYY-MM-DD)            [필수]
 *   category    - 말씀 종류 코드                  [필수]
 *                 SUNDAY, WEDNESDAY, DAWN, FRIDAY_PRAYER, HOLY_SPIRIT_MEETING,
 *                 DEPARTMENT, SPECIAL, ETC, HOLY_SPIRIT_STORY, BIBLE_SCHOOL, THEOLOGY
 *   title       - 제목                            [필수]
 *   department  - 부서명                          [선택]
 *   eventName   - 행사명                          [선택]
 *   preacher    - 설교자                          [선택]
 *   scripture   - 성경 본문                       [선택]
 *   summary     - 요약                            [선택]
 *   files       - 첨부 파일 경로(여러 개는 ; 로 구분, --base 기준 상대경로 허용) [선택]
 *
 * 실행:
 *   npx tsx scripts/import.ts --csv data/sermons.csv --base data/files
 *   (UPLOAD_DIR 환경변수 또는 ./uploads 로 파일이 복사됩니다.)
 */
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient, FileKind } from "@prisma/client";
import { extractContent } from "../src/lib/extract";
import { normalizeCode } from "../src/lib/categories";

const prisma = new PrismaClient();

// 자동 생성 시 보기 좋은 기본 라벨(코드 → 한글). 없으면 코드를 라벨로 사용.
const KNOWN_LABELS: Record<string, string> = {
  PASTORAL: "교역자 말씀",
  EDUCATION: "교육 말씀",
};

// 분류 코드 → categoryId 캐시. 없는 코드는 사용자 정의 분류로 자동 생성한다.
const categoryIdCache = new Map<string, string>();
async function resolveCategoryId(rawCode: string): Promise<string> {
  const code = normalizeCode(rawCode) || "ETC";
  const cached = categoryIdCache.get(code);
  if (cached) return cached;
  let cat = await prisma.category.findUnique({ where: { code } });
  if (!cat) {
    // CSV 에 새 분류 코드가 있으면 자동 생성(관리자가 나중에 라벨/색 수정 가능)
    const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
    cat = await prisma.category.create({
      data: {
        code,
        label: KNOWN_LABELS[code] || rawCode.trim() || code,
        color: "teal",
        sortOrder: (max._max.sortOrder ?? 0) + 10,
        isBuiltin: false,
      },
    });
    console.log(`  + 새 분류 자동 생성: ${code} (${cat.label})`);
  }
  categoryIdCache.set(code, cat.id);
  return cat.id;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function kindFromName(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "txt") return "TXT";
  if (ext === "pdf") return "PDF";
  if (ext === "hwp" || ext === "hwpx") return "HWP";
  return "OTHER";
}

function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "txt") return "text/plain; charset=utf-8";
  if (ext === "pdf") return "application/pdf";
  if (ext === "hwp") return "application/x-hwp";
  if (ext === "hwpx") return "application/hwp+zip";
  return "application/octet-stream";
}

// 아주 단순한 CSV 파서(따옴표/줄바꿈 포함 필드 지원)
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
      return obj;
    });
}

async function main() {
  const csvPath = arg("csv");
  const base = arg("base", ".")!;
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

  if (!csvPath) {
    console.error("사용법: npx tsx scripts/import.ts --csv <파일.csv> [--base <파일베이스경로>]");
    process.exit(1);
  }

  await fs.mkdir(uploadDir, { recursive: true });
  const text = await fs.readFile(csvPath, "utf-8");
  const records = parseCsv(text);
  console.log(`총 ${records.length}개 행 발견`);

  let ok = 0;
  let fail = 0;

  for (const [idx, rec] of records.entries()) {
    try {
      if (!rec.preachedAt || !rec.title || !rec.category) {
        throw new Error("preachedAt/title/category 누락");
      }
      const preachedAt = new Date(rec.preachedAt);
      if (isNaN(preachedAt.getTime())) throw new Error(`잘못된 날짜: ${rec.preachedAt}`);
      // 분류 코드 → categoryId (없는 코드는 자동 생성)
      const categoryId = await resolveCategoryId(rec.category);

      // 파일 처리
      const filePaths = (rec.files || "")
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean);

      const contentParts: string[] = [];
      const fileRecords: {
        originalName: string; storedName: string; kind: FileKind; mimeType: string; size: number;
      }[] = [];

      for (const rel of filePaths) {
        const src = path.isAbsolute(rel) ? rel : path.join(base, rel);
        const buf = await fs.readFile(src);
        const originalName = path.basename(src);
        const kind = kindFromName(originalName);
        const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(originalName).toLowerCase()}`;
        await fs.writeFile(path.join(uploadDir, storedName), buf);
        const txt = await extractContent(buf, kind);
        if (txt) contentParts.push(txt);
        fileRecords.push({
          originalName, storedName, kind,
          mimeType: mimeFromName(originalName), size: buf.length,
        });
      }

      await prisma.sermon.create({
        data: {
          title: rec.title,
          categoryId,
          department: rec.department || null,
          eventName: rec.eventName || null,
          preacher: rec.preacher || null,
          scripture: rec.scripture || null,
          summary: rec.summary || null,
          contentText: contentParts.join("\n\n").trim() || null,
          preachedAt,
          year: preachedAt.getFullYear(),
          files: { create: fileRecords },
        },
      });
      ok++;
      if (ok % 50 === 0) console.log(`  ...${ok}개 등록 완료`);
    } catch (e) {
      fail++;
      console.error(`  [행 ${idx + 2}] 실패: ${(e as Error).message}`);
    }
  }

  console.log(`\n완료: 성공 ${ok}건, 실패 ${fail}건`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
