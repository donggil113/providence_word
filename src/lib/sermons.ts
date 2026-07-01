import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface SermonQuery {
  q?: string; // 키워드
  category?: string; // 말씀 종류
  department?: string; // 부서
  year?: string; // 연도
  from?: string; // 기간 시작 (YYYY-MM-DD)
  to?: string; // 기간 끝 (YYYY-MM-DD)
  needsReview?: string; // '1' 이면 검토필요만
  page?: string;
  perPage?: string;
  sort?: string; // 'desc' (최신순) | 'asc' (오래된순)
}

export type SermonListItem = Prisma.SermonGetPayload<{
  include: {
    files: true;
    category: { select: { code: true; label: true; color: true } };
  };
}>;

export interface SermonSearchResult {
  items: SermonListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export function buildWhere(query: SermonQuery): Prisma.SermonWhereInput {
  const where: Prisma.SermonWhereInput = {};
  const and: Prisma.SermonWhereInput[] = [];

  // 키워드: 제목/본문/성경본문/설교자/행사/부서/요약 전체에서 부분 일치 검색
  const q = query.q?.trim();
  if (q) {
    const insensitive: Prisma.QueryMode = "insensitive";
    and.push({
      OR: [
        { title: { contains: q, mode: insensitive } },
        { contentText: { contains: q, mode: insensitive } },
        { scripture: { contains: q, mode: insensitive } },
        { preacher: { contains: q, mode: insensitive } },
        { eventName: { contains: q, mode: insensitive } },
        { department: { contains: q, mode: insensitive } },
        { summary: { contains: q, mode: insensitive } },
      ],
    });
  }

  // 분류 코드로 필터(관계 필터)
  if (query.category?.trim()) {
    where.category = { code: query.category.trim() };
  }

  // 검토필요만
  if (query.needsReview === "1") {
    where.needsReview = true;
  }

  if (query.department?.trim()) {
    where.department = { contains: query.department.trim(), mode: "insensitive" };
  }

  if (query.year && /^\d{4}$/.test(query.year)) {
    where.year = parseInt(query.year, 10);
  }

  // 기간 필터
  const from = parseDate(query.from);
  const to = parseDate(query.to, true);
  if (from || to) {
    where.preachedAt = {};
    if (from) where.preachedAt.gte = from;
    if (to) where.preachedAt.lte = to;
  }

  if (and.length) where.AND = and;
  return where;
}

export async function searchSermons(
  query: SermonQuery
): Promise<SermonSearchResult> {
  const where = buildWhere(query);

  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  let perPage = parseInt(query.perPage || String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE;
  perPage = Math.min(Math.max(1, perPage), MAX_PER_PAGE);

  const order: Prisma.SortOrder = query.sort === "asc" ? "asc" : "desc";

  const [total, items] = await Promise.all([
    prisma.sermon.count({ where }),
    prisma.sermon.findMany({
      where,
      orderBy: [{ preachedAt: order }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        files: { orderBy: { createdAt: "asc" } },
        category: { select: { code: true, label: true, color: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

// 연도별 개수(연도 네비게이션용)
export async function yearFacets(): Promise<{ year: number; count: number }[]> {
  const rows = await prisma.sermon.groupBy({
    by: ["year"],
    _count: { _all: true },
    orderBy: { year: "desc" },
  });
  return rows.map((r) => ({ year: r.year, count: r._count._all }));
}

// (분류별 개수는 lib/category-store.ts 의 categoryCounts 사용)

// 부서 목록(부서 필터용)
export async function departmentList(): Promise<string[]> {
  const rows = await prisma.sermon.findMany({
    where: { department: { not: null } },
    distinct: ["department"],
    select: { department: true },
    orderBy: { department: "asc" },
  });
  return rows.map((r) => r.department!).filter(Boolean);
}
