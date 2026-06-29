import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  // 현재 검색 조건(페이지 제외)
  params: Record<string, string | undefined>;
  basePath?: string;
}

function buildHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({
  page,
  totalPages,
  params,
  basePath = "/sermons",
}: Props) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const linkCls =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm transition";

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-6" aria-label="페이지">
      {page > 1 && (
        <Link
          href={buildHref(basePath, params, page - 1)}
          className={`${linkCls} border-slate-300 text-slate-600 hover:bg-slate-50`}
        >
          이전
        </Link>
      )}
      {start > 1 && (
        <>
          <Link href={buildHref(basePath, params, 1)} className={`${linkCls} border-slate-300 text-slate-600 hover:bg-slate-50`}>1</Link>
          {start > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={buildHref(basePath, params, p)}
          className={
            p === page
              ? `${linkCls} border-brand-600 bg-brand-600 text-white`
              : `${linkCls} border-slate-300 text-slate-600 hover:bg-slate-50`
          }
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
          <Link href={buildHref(basePath, params, totalPages)} className={`${linkCls} border-slate-300 text-slate-600 hover:bg-slate-50`}>{totalPages}</Link>
        </>
      )}
      {page < totalPages && (
        <Link
          href={buildHref(basePath, params, page + 1)}
          className={`${linkCls} border-slate-300 text-slate-600 hover:bg-slate-50`}
        >
          다음
        </Link>
      )}
    </nav>
  );
}
