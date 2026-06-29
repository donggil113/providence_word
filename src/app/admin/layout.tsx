import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-slate-100 font-medium">
            말씀 관리
          </Link>
          <Link href="/admin/new" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
            새 말씀 등록
          </Link>
          {user.role === "ADMIN" && (
            <Link href="/admin/users" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
              계정 관리
            </Link>
          )}
        </nav>
        <span className="text-sm text-slate-500">
          {user.name} ({user.role === "ADMIN" ? "관리자" : "편집자"})
        </span>
      </div>
      {children}
    </div>
  );
}
