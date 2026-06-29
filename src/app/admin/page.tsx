import Link from "next/link";
import { searchSermons, SermonQuery } from "@/lib/sermons";
import CategoryBadge from "@/components/CategoryBadge";
import DeleteSermonButton from "@/components/DeleteSermonButton";
import Pagination from "@/components/Pagination";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const query: SermonQuery = {
    q: str(searchParams.q),
    page: str(searchParams.page),
    perPage: "20",
  };
  const result = await searchSermons(query);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">말씀 관리</h1>
          <p className="text-sm text-slate-500">총 {result.total.toLocaleString()}편</p>
        </div>
        <Link
          href="/admin/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          + 새 말씀 등록
        </Link>
      </div>

      {/* 간단 검색 */}
      <form action="/admin" className="mb-4">
        <input
          name="q"
          defaultValue={query.q || ""}
          placeholder="제목·본문·설교자 검색"
          className="w-full sm:max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
      </form>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          등록된 말씀이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {result.items.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CategoryBadge category={s.category} />
                  <span className="text-xs text-slate-400">{formatDate(s.preachedAt)}</span>
                  {s.department && (
                    <span className="text-xs text-slate-400">· {s.department}</span>
                  )}
                </div>
                <Link
                  href={`/sermons/${s.id}`}
                  className="mt-0.5 block truncate font-medium text-slate-800 hover:text-brand-600"
                >
                  {s.title}
                </Link>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/sermons/${s.id}/edit`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  수정
                </Link>
                <DeleteSermonButton id={s.id} redirectTo="/admin" />
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        params={{ q: query.q }}
        basePath="/admin"
      />
    </div>
  );
}
