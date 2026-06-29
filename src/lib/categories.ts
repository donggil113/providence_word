import { Category, FileKind } from "@prisma/client";

// 말씀 종류: 코드 ↔ 한글 라벨. 화면 표시 순서도 이 순서를 따른다.
export const CATEGORY_LABELS: Record<Category, string> = {
  SUNDAY: "주일말씀",
  WEDNESDAY: "수요말씀",
  DAWN: "새벽말씀",
  FRIDAY_PRAYER: "금요기도회",
  HOLY_SPIRIT_MEETING: "성령집회 말씀",
  DEPARTMENT: "부서 말씀",
  SPECIAL: "특별 말씀",
  ETC: "기타 말씀",
  HOLY_SPIRIT_STORY: "성령사연",
  BIBLE_SCHOOL: "성경학교",
  THEOLOGY: "신학",
};

// 선택 박스/필터에 쓰는 정렬된 목록
export const CATEGORY_ORDER: Category[] = [
  "SUNDAY",
  "WEDNESDAY",
  "DAWN",
  "FRIDAY_PRAYER",
  "HOLY_SPIRIT_MEETING",
  "DEPARTMENT",
  "SPECIAL",
  "ETC",
  "HOLY_SPIRIT_STORY",
  "BIBLE_SCHOOL",
  "THEOLOGY",
];

export const CATEGORY_OPTIONS = CATEGORY_ORDER.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

export function categoryLabel(c: Category): string {
  return CATEGORY_LABELS[c] ?? c;
}

export function isCategory(value: string): value is Category {
  return (CATEGORY_ORDER as string[]).includes(value);
}

// 색상(뱃지용) — Tailwind 클래스
export const CATEGORY_COLORS: Record<Category, string> = {
  SUNDAY: "bg-brand-100 text-brand-800",
  WEDNESDAY: "bg-emerald-100 text-emerald-800",
  DAWN: "bg-indigo-100 text-indigo-800",
  FRIDAY_PRAYER: "bg-amber-100 text-amber-800",
  HOLY_SPIRIT_MEETING: "bg-rose-100 text-rose-800",
  DEPARTMENT: "bg-cyan-100 text-cyan-800",
  SPECIAL: "bg-purple-100 text-purple-800",
  ETC: "bg-slate-100 text-slate-700",
  HOLY_SPIRIT_STORY: "bg-pink-100 text-pink-800",
  BIBLE_SCHOOL: "bg-lime-100 text-lime-800",
  THEOLOGY: "bg-orange-100 text-orange-800",
};

// 파일 종류 라벨/색상
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
