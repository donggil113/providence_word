/**
 * 과거 말씀 PDF 자동 분석 → 검토용 CSV 생성 스크립트
 * ============================================================
 * 지정한 폴더의 모든 PDF를 읽어:
 *   1) 본문 텍스트를 추출 (텍스트 PDF는 그대로, 스캔 PDF는 한국어 OCR)
 *   2) 파일명 + 본문을 분석해 메타데이터(제목/날짜/분류/설교자/성경본문/
 *      행사/부서/요약)를 자동으로 채운다. (Claude API 사용; 키가 없으면 규칙 기반)
 *   3) 결과를 scripts/import.ts 가 받는 컬럼에 맞춘 CSV로 저장한다.
 *      → 사람이 이 CSV를 검토·수정한 뒤 import.ts 로 일괄 등록한다.
 *
 * ⚠️ 이 스크립트는 DB에 직접 넣지 않는다. CSV만 만든다.
 *
 * 사용 예:
 *   # 먼저 10~20개 샘플로 정확도 확인
 *   npx tsx scripts/analyze.ts --dir ./pdfs --out data/sample.csv --limit 15
 *
 *   # 전체 실행
 *   npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv
 *
 *   # 검토·수정 후 등록 (원본 PDF가 각 말씀에 첨부됨)
 *   npx tsx scripts/import.ts --csv data/sermons.generated.csv
 *
 * 주요 옵션:
 *   --dir <폴더>        PDF가 들어있는 폴더 (하위 폴더까지 재귀 검색) [필수]
 *   --out <파일.csv>    결과 CSV 경로 (기본 data/sermons.generated.csv)
 *   --limit <N>         앞에서 N개만 처리 (샘플 테스트용)
 *   --model <id>        Claude 모델 (기본 claude-opus-4-8)
 *   --effort <level>    low|medium|high (기본 low — 대량 처리 비용 절감)
 *   --concurrency <N>   동시 처리 개수 (기본 4)
 *   --ocr <mode>        auto|on|off (기본 auto — 텍스트 없는 PDF만 OCR)
 *   --ocr-lang <langs>  tesseract 언어 (기본 kor+eng)
 *   --ocr-pages <N>     OCR 할 최대 페이지 수 (기본 15)
 *   --no-llm            Claude 미사용(규칙 기반만). 키가 없으면 자동으로 이 모드.
 *   --cache <폴더>      파일별 분석 결과 캐시(재실행 시 건너뜀) 기본 .analyze-cache
 *   --base <경로>       files 컬럼을 이 경로 기준 상대경로로 기록 (기본: 절대경로)
 */
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import { extractContent } from "../src/lib/extract";

// ── 분류(카테고리) 정의 ──────────────────────────────────────
const CATEGORIES: { code: string; label: string; hints: string[] }[] = [
  { code: "SUNDAY", label: "주일말씀", hints: ["주일", "주일말씀", "주일예배"] },
  { code: "WEDNESDAY", label: "수요말씀", hints: ["수요", "수요예배", "수요말씀"] },
  { code: "DAWN", label: "새벽말씀", hints: ["새벽", "새벽예배", "새벽기도"] },
  { code: "FRIDAY_PRAYER", label: "금요기도회", hints: ["금요", "금요기도", "금요철야", "철야"] },
  { code: "HOLY_SPIRIT_MEETING", label: "성령집회 말씀", hints: ["성령집회", "집회", "부흥회", "사경회"] },
  { code: "DEPARTMENT", label: "부서 말씀", hints: ["부서", "청년부", "학생부", "중등부", "고등부", "유년부", "유치부", "장년부", "대학부", "여전도회", "남전도회"] },
  { code: "SPECIAL", label: "특별 말씀", hints: ["특별", "특별집회", "신년", "송구영신", "부활절", "성탄", "추수감사", "임직", "헌신예배"] },
  { code: "HOLY_SPIRIT_STORY", label: "성령사연", hints: ["성령사연", "사연", "간증"] },
  { code: "BIBLE_SCHOOL", label: "성경학교", hints: ["성경학교", "여름성경학교", "겨울성경학교", "성경"] },
  { code: "THEOLOGY", label: "신학", hints: ["신학", "교리", "강좌", "세미나"] },
  { code: "ETC", label: "기타 말씀", hints: [] },
];
const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

// ── CLI 인자 파싱 ────────────────────────────────────────────
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface Options {
  dir: string;
  out: string;
  limit?: number;
  model: string;
  effort: string;
  concurrency: number;
  ocrMode: "auto" | "on" | "off";
  ocrLang: string;
  ocrPages: number;
  useLlm: boolean;
  cacheDir: string;
  base?: string;
}

// ── 추출 결과 타입 ───────────────────────────────────────────
interface Meta {
  title: string;
  preachedAt: string; // YYYY-MM-DD 또는 ""
  dateSource: "filename" | "body" | "none";
  category: string; // CATEGORY_CODES 중 하나
  categoryConfidence: "high" | "medium" | "low";
  preacher: string;
  scripture: string;
  eventName: string;
  department: string;
  summary: string;
  needsReview: boolean;
  reviewReason: string;
}

interface RowResult {
  meta: Meta;
  sourcePdf: string; // 절대경로
  extractMethod: "text" | "ocr" | "none";
  textChars: number;
}

// ── 유틸: 외부 도구 존재 확인 ────────────────────────────────
const toolCache = new Map<string, boolean>();
function run(cmd: string, args: string[], opts: { timeout?: number; maxBuffer?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeout ?? 120000, maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024, encoding: "utf-8" }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || "", stderr: stderr || "", code: err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0 });
    });
  });
}
async function hasTool(tool: string): Promise<boolean> {
  if (toolCache.has(tool)) return toolCache.get(tool)!;
  const res = await run("which", [tool], { timeout: 5000 });
  const ok = res.code === 0 && res.stdout.trim() !== "";
  toolCache.set(tool, ok);
  return ok;
}

// ── 날짜 파싱 (파일명/본문에서) ──────────────────────────────
function normalizeDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
function findDate(text: string): string | null {
  if (!text) return null;
  // YYYY-MM-DD / YYYY.MM.DD / YYYY_MM_DD / YYYY/MM/DD
  let m = text.match(/(19|20)(\d{2})[._\-\/](\d{1,2})[._\-\/](\d{1,2})/);
  if (m) {
    const r = normalizeDate(parseInt(m[1] + m[2]), parseInt(m[3]), parseInt(m[4]));
    if (r) return r;
  }
  // YYYYMMDD (8자리 연속)
  m = text.match(/(?<!\d)(19|20)(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const r = normalizeDate(parseInt(m[1] + m[2]), parseInt(m[3]), parseInt(m[4]));
    if (r) return r;
  }
  // YYYY년 M월 D일
  m = text.match(/(19|20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) {
    const r = normalizeDate(parseInt(m[1].length === 2 ? "20" + m[1] : m[1]), parseInt(m[2]), parseInt(m[3]));
    if (r) return r;
  }
  m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) {
    const r = normalizeDate(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
    if (r) return r;
  }
  return null;
}

// ── 규칙 기반 분류 (LLM 미사용 시 fallback) ─────────────────
function heuristicCategory(haystack: string): { code: string; confidence: "high" | "medium" | "low" } {
  const h = haystack;
  // 각 분류에서 가장 길게 일치하는 단서를 찾아, 가장 구체적인 매치를 채택
  let best: { code: string; len: number } | null = null;
  for (const cat of CATEGORIES) {
    if (cat.code === "ETC") continue;
    for (const hint of cat.hints) {
      if (h.includes(hint) && (!best || hint.length > best.len)) {
        best = { code: cat.code, len: hint.length };
      }
    }
  }
  if (best) return { code: best.code, confidence: best.len >= 3 ? "medium" : "low" };
  return { code: "ETC", confidence: "low" };
}

function heuristicMeta(fileName: string, text: string): Meta {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const hay = `${baseName}\n${text.slice(0, 2000)}`;

  // 날짜: 파일명 우선 → 본문 → 없음
  let preachedAt = "";
  let dateSource: Meta["dateSource"] = "none";
  const fromName = findDate(baseName);
  if (fromName) {
    preachedAt = fromName;
    dateSource = "filename";
  } else {
    const fromBody = findDate(text.slice(0, 4000));
    if (fromBody) {
      preachedAt = fromBody;
      dateSource = "body";
    }
  }

  const cat = heuristicCategory(hay);

  // 성경본문 추정 (예: "요한복음 3:16", "창 1:1-5")
  let scripture = "";
  const sm = text.slice(0, 3000).match(/([가-힣]{1,6}(?:복음|서|기|記)?)\s*\d{1,3}\s*[:장]\s*\d{1,3}(?:[-~]\d{1,3})?/);
  if (sm) scripture = sm[0].replace(/\s+/g, " ").trim();

  // 제목: 파일명에서 날짜/분류 토큰 제거한 나머지, 없으면 파일명
  let title = baseName
    .replace(/(19|20)\d{2}[._\-\/]?\d{1,2}[._\-\/]?\d{1,2}/g, " ")
    .replace(/[_\-]+/g, " ")
    .trim();
  if (!title) title = baseName;

  const needsReview = dateSource === "none" || cat.confidence === "low";
  const reasons: string[] = [];
  if (dateSource === "none") reasons.push("날짜확인필요");
  if (cat.confidence === "low") reasons.push("분류확인필요");

  return {
    title,
    preachedAt,
    dateSource,
    category: cat.code,
    categoryConfidence: cat.confidence,
    preacher: "",
    scripture,
    eventName: "",
    department: "",
    summary: "",
    needsReview,
    reviewReason: reasons.join(","),
  };
}

// ── Claude API 기반 추출 ─────────────────────────────────────
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "말씀 제목. 명확하지 않으면 핵심 주제로 간결하게." },
    preachedAt: { type: "string", description: "선포일 YYYY-MM-DD. 알 수 없으면 빈 문자열." },
    dateSource: { type: "string", enum: ["filename", "body", "none"], description: "날짜 출처" },
    category: { type: "string", enum: CATEGORY_CODES, description: "말씀 종류 코드" },
    categoryConfidence: { type: "string", enum: ["high", "medium", "low"] },
    preacher: { type: "string", description: "설교자. 없으면 빈 문자열." },
    scripture: { type: "string", description: "성경 본문(예: 요한복음 3:16). 없으면 빈 문자열." },
    eventName: { type: "string", description: "행사명(집회/특별예배 등). 없으면 빈 문자열." },
    department: { type: "string", description: "부서명. 부서 말씀이 아니면 빈 문자열." },
    summary: { type: "string", description: "2~3문장 요약. 본문이 없으면 빈 문자열." },
    needsReview: { type: "boolean", description: "분류나 날짜가 애매하면 true" },
    reviewReason: { type: "string", description: "검토가 필요한 이유(간단히). 없으면 빈 문자열." },
  },
  required: [
    "title", "preachedAt", "dateSource", "category", "categoryConfidence",
    "preacher", "scripture", "eventName", "department", "summary",
    "needsReview", "reviewReason",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 교회의 설교/말씀 자료를 정리하는 사서입니다.
주어진 PDF 파일명과 본문에서 메타데이터를 추출해 JSON으로 출력합니다.

규칙:
- category(말씀 종류)는 반드시 다음 코드 중 하나입니다:
${CATEGORIES.map((c) => `  - ${c.code}: ${c.label}`).join("\n")}
- 날짜(preachedAt): 파일명에 날짜가 있으면 그것을 우선 사용(dateSource="filename"),
  없으면 본문에서 찾고(dateSource="body"), 둘 다 없으면 빈 문자열 + dateSource="none".
  형식은 반드시 YYYY-MM-DD. 연도만 있으면 그 해 1월 1일로 추정하지 말고 빈 문자열로 두세요.
- 분류가 모호하거나(여러 종류에 걸침/단서 부족) 날짜를 확신할 수 없으면
  needsReview=true 로 표시하고 reviewReason에 이유를 적으세요.
- 부서 말씀(DEPARTMENT)일 때만 department를 채웁니다.
- 성령집회/특별집회 등 행사가 있으면 eventName에 적습니다.
- 본문이 비어 있거나 OCR 품질이 낮으면 추정 가능한 항목만 채우고 needsReview=true.
- 확실하지 않은 값은 지어내지 말고 빈 문자열로 두세요.`;

// LLM 초기화(모듈 로드/키 확인) 단계의 오류 — 시작 시 한 번에 잡아 명확히 안내한다.
class LlmInitError extends Error {}

let anthropicClient: any = null;
function getClient(): any {
  if (anthropicClient) return anthropicClient;

  // 1) SDK 모듈 로드
  let mod: any;
  try {
    mod = require("@anthropic-ai/sdk");
  } catch (e) {
    throw new LlmInitError(
      `@anthropic-ai/sdk 모듈을 불러올 수 없습니다. 의존성이 설치되지 않았을 수 있습니다.\n` +
        `    해결: 프로젝트 루트에서  npm install  (운영 컨테이너라면 devDependencies 제외 설치인지 확인)\n` +
        `    원인: ${(e as Error).message.split("\n")[0]}`
    );
  }
  const Ctor = mod.default || mod.Anthropic || mod;

  // 2) API 키 확인 (SDK는 키가 없어도 생성은 되지만 호출 시 실패하므로 미리 검증)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey && !authToken) {
    throw new LlmInitError(
      `ANTHROPIC_API_KEY 가 설정되지 않았습니다.\n` +
        `    해결: export ANTHROPIC_API_KEY=sk-ant-...  또는 프로젝트 .env 에 추가\n` +
        `    (도커라면 컨테이너 환경변수로 전달했는지 확인:  -e ANTHROPIC_API_KEY=... )`
    );
  }

  // 3) 클라이언트 생성 (키를 명시적으로 전달 — 전달 경로를 분명히 한다)
  try {
    anthropicClient = new Ctor(apiKey ? { apiKey } : { authToken });
  } catch (e) {
    throw new LlmInitError(`Anthropic 클라이언트 생성 실패: ${(e as Error).message.split("\n")[0]}`);
  }
  return anthropicClient;
}

// 시작 시 1회: 키/모델/연결을 실제 호출로 검증(빠른 실패).
async function probeLlm(opts: Options): Promise<void> {
  const client = getClient();
  await client.messages.create({
    model: opts.model,
    max_tokens: 8,
    messages: [{ role: "user", content: "ping" }],
  });
}

async function llmMeta(opts: Options, fileName: string, text: string): Promise<Meta> {
  const client = getClient();
  const userContent = `[파일명]\n${fileName}\n\n[본문 발췌]\n${text.slice(0, 8000) || "(본문 없음)"}`;

  let resp: any;
  let lastErr: any;
  // 일시적 오류(네트워크/429/5xx) 대비 1회 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resp = await client.messages.create({
        model: opts.model,
        max_tokens: 1500,
        output_config: {
          format: { type: "json_schema", name: "sermon_metadata", schema: SCHEMA },
          effort: opts.effort,
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const status = (e as any)?.status;
      // 인증/요청 오류(4xx, 단 429 제외)는 재시도 무의미 → 즉시 중단
      if (status && status !== 429 && status < 500) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  if (lastErr) throw lastErr;

  if (resp.stop_reason === "refusal") {
    throw new Error("LLM 거부됨(refusal)");
  }
  const textBlock = (resp.content || []).find((b: any) => b.type === "text");
  const raw = textBlock?.text ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("LLM 응답 JSON 파싱 실패");
    parsed = JSON.parse(m[0]);
  }
  // 방어적 정규화
  const category = CATEGORY_CODES.includes(parsed.category) ? parsed.category : "ETC";
  return {
    title: String(parsed.title || "").trim() || fileName.replace(/\.[^.]+$/, ""),
    preachedAt: /^\d{4}-\d{2}-\d{2}$/.test(parsed.preachedAt || "") ? parsed.preachedAt : "",
    dateSource: ["filename", "body", "none"].includes(parsed.dateSource) ? parsed.dateSource : "none",
    category,
    categoryConfidence: ["high", "medium", "low"].includes(parsed.categoryConfidence) ? parsed.categoryConfidence : "low",
    preacher: String(parsed.preacher || "").trim(),
    scripture: String(parsed.scripture || "").trim(),
    eventName: String(parsed.eventName || "").trim(),
    department: String(parsed.department || "").trim(),
    summary: String(parsed.summary || "").trim(),
    needsReview: Boolean(parsed.needsReview),
    reviewReason: String(parsed.reviewReason || "").trim(),
  };
}

// ── OCR (스캔 PDF) ───────────────────────────────────────────
async function ocrPdf(opts: Options, pdfPath: string): Promise<string | null> {
  if (!(await hasTool("pdftoppm")) || !(await hasTool("tesseract"))) return null;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pwocr-"));
  try {
    const prefix = path.join(tmp, "page");
    // 200dpi PNG로 변환 (최대 페이지 제한)
    await run("pdftoppm", ["-png", "-r", "200", "-l", String(opts.ocrPages), pdfPath, prefix], { timeout: 300000 });
    const files = (await fs.readdir(tmp)).filter((f) => f.endsWith(".png")).sort();
    if (files.length === 0) return null;
    const parts: string[] = [];
    for (const f of files) {
      const res = await run("tesseract", [path.join(tmp, f), "stdout", "-l", opts.ocrLang, "--psm", "3"], { timeout: 120000 });
      if (res.stdout) parts.push(res.stdout);
    }
    const text = parts.join("\n").replace(/[ \t]+/g, " ").trim();
    return text || null;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ── 단일 PDF 처리 ────────────────────────────────────────────
const TEXT_MIN_CHARS = 40; // 이보다 적으면 스캔본으로 간주

async function processPdf(opts: Options, pdfPath: string): Promise<{ row?: RowResult; needsOcr?: boolean }> {
  const fileName = path.basename(pdfPath);
  const buf = await fs.readFile(pdfPath);

  // 1) 텍스트 레이어 추출
  let text = "";
  try {
    text = await extractContent(buf, "PDF");
  } catch {
    text = "";
  }
  let method: RowResult["extractMethod"] = "text";

  // 2) 텍스트가 거의 없으면 스캔본 → OCR
  const meaningful = text.replace(/\s/g, "").length;
  if (meaningful < TEXT_MIN_CHARS) {
    if (opts.ocrMode === "off") {
      return { needsOcr: true };
    }
    const ocrText = await ocrPdf(opts, pdfPath);
    if (ocrText && ocrText.replace(/\s/g, "").length >= TEXT_MIN_CHARS) {
      text = ocrText;
      method = "ocr";
    } else {
      // OCR 도구가 없거나 결과가 비었음 → 처리 불가 목록으로
      return { needsOcr: true };
    }
  } else if (opts.ocrMode === "on") {
    // 강제 OCR 모드
    const ocrText = await ocrPdf(opts, pdfPath);
    if (ocrText) {
      text = ocrText;
      method = "ocr";
    }
  }

  // 3) 메타데이터 추출
  let meta: Meta;
  if (opts.useLlm) {
    try {
      meta = await llmMeta(opts, fileName, text);
    } catch (e) {
      // 시작 시 probeLlm 으로 모듈/키/연결은 이미 검증되었으므로, 여기 도달하면
      // 특정 문서에 대한 일시적/개별적 오류다. 실제 오류 메시지를 기록한다.
      const msg = ((e as Error).message || "오류").split("\n")[0].slice(0, 80);
      console.warn(`  ⚠ LLM 개별 오류(${fileName}) → 규칙 기반 대체: ${msg}`);
      meta = heuristicMeta(fileName, text);
      meta.needsReview = true;
      meta.reviewReason = (meta.reviewReason ? meta.reviewReason + "," : "") + `LLM오류:${msg}`;
    }
  } else {
    meta = heuristicMeta(fileName, text);
  }

  return { row: { meta, sourcePdf: path.resolve(pdfPath), extractMethod: method, textChars: text.length } };
}

// ── CSV 쓰기 ─────────────────────────────────────────────────
function csvCell(v: string | number | boolean): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const CSV_HEADER = [
  "preachedAt", "category", "title", "department", "eventName",
  "preacher", "scripture", "summary", "files",
  // 아래는 검토 보조용 컬럼 (import.ts 는 무시함)
  "source_pdf", "date_source", "category_confidence", "needs_review", "review_reason", "extract_method",
];

function rowToCsv(opts: Options, r: RowResult): string {
  const m = r.meta;
  const filesCol = opts.base ? path.relative(opts.base, r.sourcePdf) : r.sourcePdf;
  const preachedAt = m.preachedAt || "확인필요";
  const needsReview = m.needsReview ? "검토필요" : "";
  const cells = [
    preachedAt,
    m.category,
    m.title,
    m.department,
    m.eventName,
    m.preacher,
    m.scripture,
    m.summary,
    filesCol,
    r.sourcePdf,
    m.dateSource,
    m.categoryConfidence,
    needsReview,
    m.reviewReason,
    r.extractMethod,
  ];
  return cells.map(csvCell).join(",");
}

// ── 재귀 PDF 검색 ────────────────────────────────────────────
async function findPdfs(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".pdf")) out.push(full);
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

// ── 동시성 제한 풀 ───────────────────────────────────────────
async function pool<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── 캐시 (파일 경로+크기 기준) ──────────────────────────────
function cacheKey(pdfPath: string, size: number): string {
  return crypto.createHash("sha1").update(`${path.resolve(pdfPath)}:${size}`).digest("hex");
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const dir = arg("dir");
  if (!dir) {
    console.error("사용법: npx tsx scripts/analyze.ts --dir <PDF폴더> [--out data/sermons.generated.csv] [--limit N]");
    process.exit(1);
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const opts: Options = {
    dir,
    out: arg("out", "data/sermons.generated.csv")!,
    limit: arg("limit") ? parseInt(arg("limit")!, 10) : undefined,
    model: arg("model", "claude-opus-4-8")!,
    effort: arg("effort", "low")!,
    concurrency: parseInt(arg("concurrency", "4")!, 10) || 4,
    ocrMode: (arg("ocr", "auto") as Options["ocrMode"]),
    ocrLang: arg("ocr-lang", "kor+eng")!,
    ocrPages: parseInt(arg("ocr-pages", "15")!, 10) || 15,
    useLlm: !flag("no-llm") && hasKey,
    cacheDir: arg("cache", ".analyze-cache")!,
    base: arg("base"),
  };

  // 환경 점검 안내
  console.log("▶ 섭리 말씀 PDF 분석 시작");
  console.log(`  대상 폴더 : ${opts.dir}`);
  console.log(`  메타추출  : ${opts.useLlm ? `Claude (${opts.model}, effort=${opts.effort})` : "규칙 기반(LLM 미사용)"}`);
  if (!opts.useLlm && !flag("no-llm")) {
    console.log("  ※ ANTHROPIC_API_KEY 가 없어 규칙 기반으로 동작합니다. (정확도↓)");
    console.log("    더 정확한 자동 분류를 원하면 ANTHROPIC_API_KEY 설정 후 다시 실행하세요.");
  }
  const ocrAvailable = (await hasTool("pdftoppm")) && (await hasTool("tesseract"));
  console.log(`  OCR 도구  : ${ocrAvailable ? `사용 가능 (${opts.ocrLang})` : "없음 → 스캔 PDF는 '처리불가 목록'으로 분리"}`);
  if (!ocrAvailable && opts.ocrMode !== "off") {
    console.log("    스캔 PDF OCR을 원하면: sudo apt-get install -y tesseract-ocr tesseract-ocr-kor poppler-utils");
  }

  // LLM 사용 시: 모듈/키/연결을 시작 단계에서 실제 호출로 검증(빠른 실패).
  // (예전엔 문서마다 조용히 실패해 'LLM실패'로 잘못 표시되었음)
  if (opts.useLlm) {
    process.stdout.write("  LLM 점검  : 연결 확인 중...");
    try {
      await probeLlm(opts);
      console.log(" OK ✓");
    } catch (e) {
      console.log(" 실패 ✗");
      const msg = e instanceof LlmInitError ? (e as Error).message : `API 호출 실패: ${(e as Error).message.split("\n")[0]}`;
      console.error("\n✗ Claude API를 사용할 수 없습니다:\n  " + msg);
      console.error("\n  키/설치 문제를 해결한 뒤 다시 실행하거나, 규칙 기반으로 진행하려면 --no-llm 을 붙이세요.");
      process.exit(1);
    }
  }

  let pdfs = await findPdfs(opts.dir);
  console.log(`  PDF 발견  : ${pdfs.length}개`);
  if (opts.limit) {
    pdfs = pdfs.slice(0, opts.limit);
    console.log(`  샘플 모드 : 앞 ${pdfs.length}개만 처리`);
  }
  if (pdfs.length === 0) {
    console.log("처리할 PDF가 없습니다.");
    return;
  }

  await fs.mkdir(opts.cacheDir, { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });

  const rows: RowResult[] = [];
  const needsOcrList: string[] = [];
  let done = 0;

  await pool(pdfs, opts.concurrency, async (pdfPath) => {
    const fileName = path.basename(pdfPath);
    try {
      const stat = await fs.stat(pdfPath);
      const cacheFile = path.join(opts.cacheDir, cacheKey(pdfPath, stat.size) + ".json");
      // 캐시 확인
      try {
        const cached = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
        if (cached.needsOcr) needsOcrList.push(pdfPath);
        else if (cached.row) rows.push(cached.row);
        done++;
        process.stdout.write(`\r  진행: ${done}/${pdfs.length}   `);
        return;
      } catch {
        /* 캐시 없음 → 처리 */
      }

      const res = await processPdf(opts, pdfPath);
      if (res.needsOcr) needsOcrList.push(pdfPath);
      else if (res.row) rows.push(res.row);
      await fs.writeFile(cacheFile, JSON.stringify(res), "utf-8");
    } catch (e) {
      console.warn(`\n  ⚠ 처리 실패: ${fileName} — ${(e as Error).message}`);
      needsOcrList.push(pdfPath);
    } finally {
      done++;
      process.stdout.write(`\r  진행: ${done}/${pdfs.length}   `);
    }
  });
  process.stdout.write("\n");

  // CSV 출력 (날짜 → 분류 순 정렬: 검토 편의)
  rows.sort((a, b) => {
    const da = a.meta.preachedAt || "9999";
    const db = b.meta.preachedAt || "9999";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const lines = [CSV_HEADER.join(","), ...rows.map((r) => rowToCsv(opts, r))];
  await fs.writeFile(path.resolve(opts.out), lines.join("\n") + "\n", "utf-8");

  // 처리 불가(스캔/OCR 실패) 목록
  let needsOcrPath = "";
  if (needsOcrList.length) {
    needsOcrPath = opts.out.replace(/\.csv$/i, "") + ".needs-ocr.txt";
    await fs.writeFile(path.resolve(needsOcrPath), needsOcrList.map((p) => path.resolve(p)).join("\n") + "\n", "utf-8");
  }

  // 요약
  const reviewCount = rows.filter((r) => r.meta.needsReview).length;
  const noDate = rows.filter((r) => !r.meta.preachedAt).length;
  const ocrCount = rows.filter((r) => r.extractMethod === "ocr").length;
  console.log("\n──────── 결과 요약 ────────");
  console.log(`  총 처리      : ${pdfs.length}개`);
  console.log(`  CSV 행       : ${rows.length}개  → ${opts.out}`);
  console.log(`    · 텍스트 추출 : ${rows.length - ocrCount}개`);
  console.log(`    · OCR 추출    : ${ocrCount}개`);
  console.log(`    · 검토필요    : ${reviewCount}개`);
  console.log(`    · 날짜확인필요: ${noDate}개`);
  if (needsOcrList.length) {
    console.log(`  처리불가(스캔): ${needsOcrList.length}개 → ${needsOcrPath}`);
  }
  console.log("\n다음 단계:");
  console.log(`  1) ${opts.out} 를 엑셀/스프레드시트로 열어 '검토필요'·'확인필요' 행을 수정하세요.`);
  console.log(`  2) 등록:  npx tsx scripts/import.ts --csv ${opts.out}${opts.base ? ` --base ${opts.base}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
