import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import CategoryManager, { ManagedCategory } from "@/components/CategoryManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "분류 관리" };

export default async function CategoriesAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin/categories");
  if (me.role !== "ADMIN") redirect("/admin");

  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true, code: true, label: true, color: true, sortOrder: true, isBuiltin: true,
      _count: { select: { sermons: true } },
    },
  });
  const initial: ManagedCategory[] = rows.map((c) => ({
    id: c.id, code: c.code, label: c.label, color: c.color,
    sortOrder: c.sortOrder, isBuiltin: c.isBuiltin, count: c._count.sermons,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-1">말씀 종류(분류) 관리</h1>
      <p className="text-sm text-slate-500 mb-4">
        기본 11종 외에 필요한 분류를 직접 추가·수정할 수 있습니다. (관리자 전용)
      </p>
      <CategoryManager initial={initial} />
    </div>
  );
}
