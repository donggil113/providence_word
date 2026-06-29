import type { Metadata } from "next";
import Link from "next/link";
import {
  searchSermons,
  yearFacets,
  departmentList,
  SermonQuery,
} from "@/lib/sermons";
import SearchForm from "@/components/SearchForm";
import SermonCard from "@/components/SermonCard";
import Pagination from "@/components/Pagination";
import { categoryLabel, isCategory } from "@/lib/categories";
import { Category } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "말씀 검색",
};

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

function str(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function SermonsPage({ searchParams }: PageProps) {
  const query: SermonQuery = {
    q: str(searchParams.q),
    category: str(searchParams.category),
    department: str(searchParams.department),
    year: str(searchParams.year),
    from: str(searchParams.from),
    to: str(searchParams.to),
    page: str(searchParams.page),
    sort: str(searchParams.sort),
  };

  let result: Awaited<ReturnType<typeof searchSermons>> | null = null;
  let years: number[] = [];
  let departments: string[] = [];
  let dbError = false;

  try {
    const [r, yf, dl] = await Promise.all([
      searchSermons(query),
      yearFacets(),
      departmentList(),
    ]);
    result = r;
    years = yf.map((y) => y.year);
    departments = dl;
  } catch (e) {
    dbError = true;
    console.error("말씀 검색 실패:", e);
  }

  // 현재 활성화된 필터 요약
  const activeFilters: string[] = [];
  if (query.q) activeFilters.push(`"${query.q}"`);
  if (query.category && isCategory(query.category))
    activeFilters.push(categoryLabel(query.category as Category));
  if (query.department) activeFilters.push(query.department);
  if (query.year) activeFilters.push(`${query.year}년`);
  if (query.from || query.to)
    activeFilters.push(`${query.from || "처음"} ~ ${query.to || "오늘"}`);

  const paramsForPagination: Record<string, string | undefined> = {
    q: query.q,
    category: query.category,
    department: query.department,
    year: query.year,
    from: query.from,
    to: query.to,
    sort: query.sort,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 mb-4">말씀 검색</h1>

      <SearchForm years={years} departments={departments} />

      {dbError ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 text-sm">
          데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : result ? (
        <>
          <div className="mt-5 mb-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-600">
              {activeFilters.length > 0 && (
                <span className="text-slate-400">{activeFilters.join(" · ")} — </span>
              )}
              총 <strong className="text-slate-800">{result.total.toLocaleString()}</strong>편
            </p>
          </div>

          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              조건에 맞는 말씀이 없습니다. 검색어나 필터를 바꿔보세요.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((s) => (
                <SermonCard key={s.id} sermon={s as any} />
              ))}
            </div>
          )}

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            params={paramsForPagination}
          />
        </>
      ) : null}

      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← 홈으로
        </Link>
      </div>
    </div>
  );
}
