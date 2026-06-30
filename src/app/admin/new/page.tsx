import type { Metadata } from "next";
import Link from "next/link";
import SermonForm from "@/components/SermonForm";
import { listCategories } from "@/lib/category-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "새 말씀 등록" };

export default async function NewSermonPage() {
  const categories = await listCategories();

  if (categories.length === 0) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold text-slate-900 mb-4">새 말씀 등록</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          등록된 말씀 종류가 없습니다. 먼저{" "}
          <Link href="/admin/categories" className="font-medium underline">
            분류 관리
          </Link>
          에서 말씀 종류를 추가하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-4">새 말씀 등록</h1>
      <SermonForm categories={categories} />
    </div>
  );
}
