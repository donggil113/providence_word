import Link from "next/link";
import { prisma } from "@/lib/db";
import { searchSermons, yearFacets, departmentList } from "@/lib/sermons";
import { categoryCounts } from "@/lib/category-store";
import SearchForm from "@/components/SearchForm";
import SermonCard from "@/components/SermonCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let total = 0;
  let years: { year: number; count: number }[] = [];
  let cats: Awaited<ReturnType<typeof categoryCounts>> = [];
  let recent: Awaited<ReturnType<typeof searchSermons>>["items"] = [];
  let dbError = false;

  try {
    [total, years, cats] = await Promise.all([
      prisma.sermon.count(),
      yearFacets(),
      categoryCounts(),
    ]);
    const result = await searchSermons({ perPage: "6" });
    recent = result.items;
  } catch (e) {
    dbError = true;
    console.error("홈 데이터 로딩 실패:", e);
  }

  return (
    <div>
      {/* 히어로 + 검색 */}
      <section className="bg-gradient-to-b from-brand-800 to-brand-700 text-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 text-center">
          <p className="text-brand-200 text-sm font-medium">1978년부터 오늘까지</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-bold leading-tight">
            선포된 모든 말씀을<br className="sm:hidden" /> 한 곳에서
          </h1>
          <p className="mt-3 text-brand-100 text-sm sm:text-base">
            연도별·부서별·행사별로 정리된 말씀을 날짜, 기간, 키워드로 찾아보세요.
          </p>
          <div className="mt-6 max-w-2xl mx-auto">
            <SearchForm years={[]} departments={[]} categories={[]} compact />
          </div>
          {total > 0 && (
            <p className="mt-3 text-brand-200 text-sm">
              현재 <strong className="text-white">{total.toLocaleString()}</strong>편의 말씀이 정리되어 있습니다.
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-10">
        {dbError && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 text-sm">
            데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.
          </div>
        )}

        {/* 말씀 종류별 바로가기 */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3">말씀 종류</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {cats.map((c) => (
              <Link
                key={c.code}
                href={`/sermons?category=${c.code}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-brand-400 hover:shadow-sm transition"
              >
                <span className="font-medium text-slate-800">{c.label}</span>
                <span className="text-sm text-slate-400">
                  {c.count.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* 연도별 바로가기 */}
        {years.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">연도별 보기</h2>
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <Link
                  key={y.year}
                  href={`/sermons?year=${y.year}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-brand-400 hover:bg-brand-50 transition"
                >
                  {y.year}년 <span className="text-slate-400">({y.count})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 최근 등록된 말씀 */}
        {recent.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">최근 등록된 말씀</h2>
              <Link href="/sermons" className="text-sm text-brand-600 hover:underline">
                전체 보기 →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((s) => (
                <SermonCard key={s.id} sermon={s as any} />
              ))}
            </div>
          </section>
        )}

        {total === 0 && !dbError && (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-500">아직 등록된 말씀이 없습니다.</p>
            <Link
              href="/admin/new"
              className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-white font-medium hover:bg-brand-700 transition"
            >
              첫 말씀 등록하기
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
