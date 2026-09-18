import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/category-store";
import BulkUploader from "@/components/BulkUploader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "여러 말씀 한번에 등록" };

export default async function BulkUploadPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin/bulk");

  const categories = await listCategories();

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-800">
        말씀 종류가 하나도 없습니다. 먼저{" "}
        <Link href="/admin/categories" className="font-medium underline">
          분류 관리
        </Link>
        에서 분류를 추가해주세요.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">여러 말씀 한번에 등록</h1>
      <p className="text-sm text-slate-500 mb-4">
        여러 파일을 한꺼번에 올리고, 표에서 말씀 종류를 지정해 등록합니다.
        파일명에서 날짜·제목·종류를 자동으로 추측해 채워드립니다.
      </p>
      <BulkUploader categories={categories} />
    </div>
  );
}
