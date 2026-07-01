import Link from "next/link";
import { prisma } from "@/lib/db";
import { searchSermons, SermonQuery } from "@/lib/sermons";
import { listCategories } from "@/lib/category-store";
import Pagination from "@/components/Pagination";
import SermonAdminTable, { AdminRow, BulkFilter } from "@/components/SermonAdminTable";
import { toInputDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const q = str(searchParams.q);
  const view = str(searchParams.view) || "all"; // all | review | etc
  const perPage = str(searchParams.perPage) || "50";

  // 보기(필터) → 검색 조건
  const query: SermonQuery = {
    q,
    page: str(searchParams.page),
    perPage,
  };
  if (view === "review") query.needsReview = "1";
  if (view === "etc") query.category = "ETC";

  const [result, categories, etcCount, reviewCount] = await Promise.all([
    searchSermons(query),
    listCategories(),
    prisma.sermon.count({ where: { category: { code: "ETC" } } }),
    prisma.sermon.count({ where: { needsReview: true } }),
  ]);

  const rows: AdminRow[] = result.items.map((s) => ({
    id: s.id,
    title: s.title,
    preachedAt: toInputDate(s.preachedAt),
    scripture: s.scripture,
    preacher: s.preacher,
    needsReview: s.needsReview,
    category: s.category,
  }));

  const bulkFilter: BulkFilter = {
    q,
    category: view === "etc" ? "ETC" : undefined,
    needsReview: view === "review" ? "1" : undefined,
  };

  const tab = (key: string, label: string, count?: number) => {
    const sp = new URLSearchParams();
    if (key !== "all") sp.set("view", key);
    if (q) sp.set("q", q);
    if (perPage !== "50") sp.set("perPage", perPage);
    const href = `/admin${sp.toString() ? `?${sp}` : ""}`;
    const active = view === key;
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          active ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {label}
        {count !== undefined && (
          <span className={`ml-1 ${active ? "text-brand-100" : "text-slate-400"}`}>{count.toLocaleString()}</span>
        )}
      </Link>
    );
  };

  const paginationParams: Record<string, string | undefined> = {
    q,
    view: view === "all" ? undefined : view,
    perPage: perPage === "50" ? undefined : perPage,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">말씀 관리</h1>
          <p className="text-sm text-slate-500">
            총 {result.total.toLocaleString()}편
            {view === "etc" && " · 기타(ETC)만"}
            {view === "review" && " · 검토필요만"}
          </p>
        </div>
        <Link
          href="/admin/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          + 새 말씀 등록
        </Link>
      </div>

      {/* 필터 탭 + 검색 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab("all", "전체")}
        {tab("review", "검토필요만", reviewCount)}
        {tab("etc", "기타(ETC)만", etcCount)}
        <form action="/admin" className="ml-auto flex items-center gap-2">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {perPage !== "50" && <input type="hidden" name="perPage" value={perPage} />}
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="제목·본문·설교자 검색"
            className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            검색
          </button>
        </form>
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          해당하는 말씀이 없습니다.
        </div>
      ) : (
        <SermonAdminTable
          initialRows={rows}
          categories={categories}
          filter={bulkFilter}
          totalMatching={result.total}
        />
      )}

      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-slate-400">
          한 페이지에{" "}
          {["50", "100"].map((n) => {
            const sp = new URLSearchParams();
            if (view !== "all") sp.set("view", view);
            if (q) sp.set("q", q);
            if (n !== "50") sp.set("perPage", n);
            return (
              <Link
                key={n}
                href={`/admin${sp.toString() ? `?${sp}` : ""}`}
                className={`mx-0.5 ${perPage === n ? "font-bold text-brand-600" : "hover:underline"}`}
              >
                {n}
              </Link>
            );
          })}
          개
        </div>
        <Pagination page={result.page} totalPages={result.totalPages} params={paginationParams} basePath="/admin" />
      </div>
    </div>
  );
}
