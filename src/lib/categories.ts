import { FileKind } from "@prisma/client";

// ── 분류 뱃지 색상 팔레트 ────────────────────────────────────
// Tailwind 동적 클래스 purge 문제를 피하기 위해 인라인 스타일(hex)로 관리한다.
export interface PaletteColor {
  bg: string;
  text: string;
}
export const PALETTE: Record<string, PaletteColor> = {
  blue: { bg: "#dbeafe", text: "#1e3a8a" },
  green: { bg: "#dcfce7", text: "#166534" },
  indigo: { bg: "#e0e7ff", text: "#3730a3" },
  amber: { bg: "#fef3c7", text: "#92400e" },
  rose: { bg: "#ffe4e6", text: "#9f1239" },
  cyan: { bg: "#cffafe", text: "#155e63" },
  purple: { bg: "#f3e8ff", text: "#6b21a8" },
  pink: { bg: "#fce7f3", text: "#9d174d" },
  lime: { bg: "#ecfccb", text: "#3f6212" },
  orange: { bg: "#ffedd5", text: "#9a3412" },
  teal: { bg: "#ccfbf1", text: "#115e59" },
  slate: { bg: "#f1f5f9", text: "#334155" },
};
export const PALETTE_NAMES = Object.keys(PALETTE);

export function paletteStyle(color: string): { backgroundColor: string; color: string } {
  const c = PALETTE[color] || PALETTE.slate;
  return { backgroundColor: c.bg, color: c.text };
}

// ── 기본(내장) 분류 정의 — seed 에 사용 ─────────────────────
export interface BuiltinCategory {
  code: string;
  label: string;
  color: string;
  sortOrder: number;
}
export const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { code: "SUNDAY", label: "주일말씀", color: "blue", sortOrder: 10 },
  { code: "WEDNESDAY", label: "수요말씀", color: "green", sortOrder: 20 },
  { code: "DAWN", label: "새벽말씀", color: "indigo", sortOrder: 30 },
  { code: "FRIDAY_PRAYER", label: "금요기도회", color: "amber", sortOrder: 40 },
  { code: "HOLY_SPIRIT_MEETING", label: "성령집회 말씀", color: "rose", sortOrder: 50 },
  { code: "DEPARTMENT", label: "부서 말씀", color: "cyan", sortOrder: 60 },
  { code: "SPECIAL", label: "특별 말씀", color: "purple", sortOrder: 70 },
  { code: "ETC", label: "기타 말씀", color: "slate", sortOrder: 80 },
  { code: "HOLY_SPIRIT_STORY", label: "성령사연", color: "pink", sortOrder: 90 },
  { code: "BIBLE_SCHOOL", label: "성경학교", color: "lime", sortOrder: 100 },
  { code: "THEOLOGY", label: "신학", color: "orange", sortOrder: 110 },
];

// 클라이언트로 전달되는 가벼운 분류 타입
export interface CategoryLite {
  id: string;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
}

// 코드 정규화: 영대문자/숫자/언더스코어
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// ── 파일 종류 ────────────────────────────────────────────────
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  TXT: "TXT",
  PDF: "PDF",
  HWP: "HWP",
  OTHER: "파일",
};

export function fileKindFromName(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "txt") return "TXT";
  if (ext === "pdf") return "PDF";
  if (ext === "hwp" || ext === "hwpx") return "HWP";
  return "OTHER";
}
