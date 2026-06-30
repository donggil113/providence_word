import { prisma } from "@/lib/db";
import { CategoryLite } from "@/lib/categories";

// 모든 분류를 정렬 순서대로 가져온다(필터/폼/뱃지용 공용).
export async function listCategories(): Promise<CategoryLite[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, code: true, label: true, color: true, sortOrder: true },
  });
  return rows;
}

// 코드 → 분류 매핑(빠른 조회용)
export async function categoryMapByCode(): Promise<Map<string, CategoryLite>> {
  const list = await listCategories();
  return new Map(list.map((c) => [c.code, c]));
}

// 분류별 말씀 개수
export async function categoryCounts(): Promise<
  { id: string; code: string; label: string; color: string; sortOrder: number; count: number }[]
> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      color: true,
      sortOrder: true,
      _count: { select: { sermons: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    color: r.color,
    sortOrder: r.sortOrder,
    count: r._count.sermons,
  }));
}
