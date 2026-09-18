/**
 * 파일명에서 날짜·분류·제목을 규칙으로 추출한다. (AI 호출 없음)
 *
 * 브라우저(대량 업로드 화면)와 Node 스크립트(scripts/analyze.ts) 양쪽에서
 * 같은 규칙을 쓰기 위해 순수 함수만 둔다. — fs/path 등 Node 전용 모듈 금지.
 */

// ── 분류 키워드 힌트 ─────────────────────────────────────────
export const CATEGORY_HINTS: { code: string; label: string; hints: string[] }[] = [
  { code: "SUNDAY", label: "주일말씀", hints: ["주일말씀", "주일예배", "주일"] },
  { code: "WEDNESDAY", label: "수요말씀", hints: ["수요말씀", "수요예배", "수요"] },
  { code: "DAWN", label: "새벽말씀", hints: ["새벽말씀", "새벽예배", "새벽기도", "새벽"] },
  { code: "FRIDAY_PRAYER", label: "금요기도회", hints: ["금요기도회", "금요기도", "금요철야", "금요", "철야"] },
  { code: "HOLY_SPIRIT_MEETING", label: "성령집회 말씀", hints: ["성령집회", "부흥회", "사경회", "집회"] },
  {
    code: "DEPARTMENT",
    label: "부서 말씀",
    hints: ["부서", "청년부", "학생부", "중고등부", "중등부", "고등부", "유년부", "유치부", "영아부", "장년부", "대학부", "여전도회", "남전도회", "주일학교"],
  },
  {
    code: "SPECIAL",
    label: "특별 말씀",
    hints: ["특별집회", "특별새벽", "특별", "신년", "송구영신", "부활절", "맥추", "성탄", "추수감사", "임직", "헌신예배", "창립"],
  },
  { code: "HOLY_SPIRIT_STORY", label: "성령사연", hints: ["성령사연", "사연", "간증"] },
  { code: "BIBLE_SCHOOL", label: "성경학교", hints: ["여름성경학교", "겨울성경학교", "성경학교"] },
  { code: "THEOLOGY", label: "신학", hints: ["신학", "교리", "세미나", "강좌"] },
  { code: "PASTORAL", label: "교역자 말씀", hints: ["교역자", "사역자", "임직자"] },
  { code: "EDUCATION", label: "교육 말씀", hints: ["교육", "양육", "제자훈련", "훈련"] },
  { code: "ETC", label: "기타 말씀", hints: [] },
];

export interface CategoryRule {
  keyword: string;
  code: string;
}

/**
 * 내장 힌트 + 실제 등록된 분류 라벨을 합쳐 키워드 규칙을 만든다.
 * 긴(구체적인) 키워드가 먼저 매칭되도록 정렬한다.
 * dbCategories 를 넘기면 사용자가 추가한 분류(예: 계시말씀)도 규칙에 포함된다.
 */
export function buildCategoryRules(
  dbCategories: { code: string; label: string }[] = []
): CategoryRule[] {
  const rules: CategoryRule[] = [];
  for (const c of CATEGORY_HINTS) {
    for (const h of c.hints) rules.push({ keyword: h, code: c.code });
  }
  for (const c of dbCategories) {
    const label = c.label.trim();
    if (label) rules.push({ keyword: label, code: c.code });
    // '주일말씀' → '주일' 처럼 접미사를 뗀 형태도 키워드로
    const stripped = label.replace(/\s*(말씀|예배|집회)\s*$/g, "").trim();
    if (stripped && stripped !== label) rules.push({ keyword: stripped, code: c.code });
  }
  // 중복 제거 후 길이 내림차순
  const seen = new Set<string>();
  const unique = rules.filter((r) => {
    const k = `${r.keyword}|${r.code}`;
    if (!r.keyword || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => b.keyword.length - a.keyword.length);
  return unique;
}

// ── 날짜 ─────────────────────────────────────────────────────
export function normalizeDate(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 2자리 연도 → 4자리 (교단 시작 1978년 기준: 78~99 → 19xx, 00~77 → 20xx) */
export function expandYear2(yy: number): number {
  return yy >= 78 ? 1900 + yy : 2000 + yy;
}

/** 파일명 '앞부분'의 숫자(YYYYMMDD 또는 YYMMDD)에서 날짜 추출 — 1순위 규칙 */
export function dateFromFilenameHead(baseName: string): string | null {
  const head = baseName.replace(/^[\s_\-.]+/, "");

  let m = head.match(/^(\d{4})(\d{2})(\d{2})(?:\D|$)/);
  if (m) {
    const r = normalizeDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  m = head.match(/^(\d{4})[._\-]?(\d{1,2})[._\-]?(\d{1,2})(?:\D|$)/);
  if (m && m[1].length === 4) {
    const r = normalizeDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  m = head.match(/^(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (m) {
    const r = normalizeDate(expandYear2(+m[1]), +m[2], +m[3]);
    if (r) return r;
  }
  return null;
}

/** 일반 텍스트(본문/파일명 전체)에서 날짜 추출 — 보조 */
export function findDate(text: string): string | null {
  if (!text) return null;
  let m = text.match(/(19|20)(\d{2})[._\-\/](\d{1,2})[._\-\/](\d{1,2})/);
  if (m) {
    const r = normalizeDate(+(m[1] + m[2]), +m[3], +m[4]);
    if (r) return r;
  }
  m = text.match(/(?<!\d)(19|20)(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const r = normalizeDate(+(m[1] + m[2]), +m[3], +m[4]);
    if (r) return r;
  }
  m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) {
    const r = normalizeDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  return null;
}

// ── 분류 ─────────────────────────────────────────────────────
/** 파일명 + 상위 폴더명에서 키워드로 분류 판정 (긴 키워드 우선) */
export function ruleCategory(
  haystack: string,
  rules: CategoryRule[]
): { code: string; matched: boolean } {
  for (const r of rules) {
    if (r.keyword && haystack.includes(r.keyword)) {
      return { code: r.code, matched: true };
    }
  }
  return { code: "ETC", matched: false };
}

// ── 제목 ─────────────────────────────────────────────────────
/** 파일명에서 확장자를 뗀다. */
export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function tidy(s: string): string {
  return s.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 파일명에서 날짜·분류 키워드를 제거한 나머지를 제목으로 쓴다. */
export function titleFromFilename(baseName: string, rules: CategoryRule[]): string {
  // 1) 날짜 제거
  let dateless = baseName.replace(/^[\s_\-.]*\d{4,8}([._\-]\d{1,2}){0,2}[\s_\-.]*/, " ");
  dateless = dateless.replace(/(19|20)\d{2}[._\-]?\d{1,2}[._\-]?\d{1,2}/g, " ");

  // 2) 분류 키워드 제거
  let title = dateless;
  for (const r of rules) {
    if (r.keyword) title = title.split(r.keyword).join(" ");
  }

  // 3) 남은 게 없으면 덜 지운 쪽으로 물러선다
  //    (예: "2026-06-21 특별집회" → "특별집회". 파일명 전체로 되돌아가지 않는다)
  return tidy(title) || tidy(dateless) || tidy(baseName) || baseName;
}

// ── 한 번에 ──────────────────────────────────────────────────
export interface FilenameGuess {
  title: string;
  preachedAt: string; // YYYY-MM-DD ("" 이면 못 찾음)
  categoryCode: string;
  dateMatched: boolean;
  categoryMatched: boolean;
}

/**
 * 파일명(+선택적으로 상위 폴더명)에서 제목·날짜·분류를 한 번에 추론한다.
 * 대량 업로드 화면에서 파일을 고르는 즉시 표를 채우는 데 쓴다.
 */
export function guessFromFilename(
  fileName: string,
  rules: CategoryRule[],
  parentFolder = ""
): FilenameGuess {
  const baseName = baseNameOf(fileName);
  const date = dateFromFilenameHead(baseName) || findDate(baseName) || "";
  const cat = ruleCategory(`${parentFolder} ${baseName}`, rules);
  return {
    title: titleFromFilename(baseName, rules),
    preachedAt: date,
    categoryCode: cat.code,
    dateMatched: Boolean(date),
    categoryMatched: cat.matched,
  };
}
