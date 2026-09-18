import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/lib/category-store";
import {
  dayCells,
  missingWeekdayReport,
  sermonYearRange,
  WEEKDAY_LABELS,
  WEEKDAY_OPTIONS,
} from "@/lib/calendar";
import YearCalendar from "@/components/YearCalendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "말씀 달력",
  description: "날짜·요일별로 말씀이 등록된 날과 빠진 날을 한눈에 확인합니다.",
};

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const categories = await listCategories();
  const range = await sermonYearRange();
  const thisYear = new Date().getFullYear();

  const tab = one(searchParams.tab) === "missing" ? "missing" : "calendar";
  const categoryCode = one(searchParams.category) || "";
  const validCategory = categories.some((c) => c.code === categoryCode)
    ? categoryCode
    : "";

  const yearParam = parseInt(one(searchParams.year) || "", 10);
  const year =
    Number.isFinite(yearParam) && yearParam >= 1900 && yearParam <= 2100
      ? yearParam
      : Math.min(Math.max(thisYear, range.min), range.max);

  const years: number[] = [];
  for (let y = range.max; y >= range.min; y--) years.push(y);

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      tab: tab === "missing" ? "missing" : undefined,
      year,
      category: validCategory || undefined,
      weekday: one(searchParams.weekday),
      from: one(searchParams.from),
      to: one(searchParams.to),
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
      active
        ? "border-brand-600 text-brand-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">말씀 달력</h1>
      <p className="mt-1 text-sm text-slate-500">
        말씀이 등록된 날은 진하게, 없는 날은 흐리게 표시됩니다.
        일요일·수요일은 빠진 날도 테두리로 보여 누락을 찾기 쉽습니다.
      </p>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        <Link href={qs({ tab: undefined })} className={tabCls(tab === "calendar")}>
          달력 보기
        </Link>
        <Link href={qs({ tab: "missing" })} className={tabCls(tab === "missing")}>
          빠진 날 찾기
        </Link>
      </div>

      {tab === "calendar" ? (
        <CalendarTab
          year={year}
          years={years}
          categories={categories}
          validCategory={validCategory}
          qs={qs}
        />
      ) : (
        <MissingTab
          searchParams={searchParams}
          categories={categories}
          range={range}
          validCategory={validCategory}
        />
      )}
    </div>
  );
}

// ── 달력 보기 ────────────────────────────────────────────────
async function CalendarTab({
  year,
  years,
  categories,
  validCategory,
  qs,
}: {
  year: number;
  years: number[];
  categories: { code: string; label: string }[];
  validCategory: string;
  qs: (o: Record<string, string | number | undefined>) => string;
}) {
  const cells = await dayCells(
    `${year}-01-01`,
    `${year}-12-31`,
    validCategory || undefined
  );

  let totalSermons = 0;
  for (const c of cells.values()) totalSermons += c.count;

  return (
    <>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
        <select name="year" defaultValue={year} className={selectClsStatic}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select name="category" defaultValue={validCategory} className={selectClsStatic}>
          <option value="">전체 말씀 종류</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          보기
        </button>

        <span className="ml-auto flex items-center gap-2 text-sm">
          <Link
            href={qs({ year: year - 1 })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
          >
            ◀ {year - 1}
          </Link>
          <Link
            href={qs({ year: year + 1 })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
          >
            {year + 1} ▶
          </Link>
        </span>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>
          <strong className="text-slate-800">{year}년</strong> 말씀{" "}
          <strong className="text-slate-800">{totalSermons.toLocaleString()}</strong>편 ·{" "}
          {cells.size}일
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3.5 w-3.5 rounded bg-brand-600" /> 말씀 있음
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3.5 w-3.5 rounded ring-1 ring-inset ring-slate-300" />
          일·수요일인데 없음
        </span>
        <span className="flex items-center gap-1">
          <span className="rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-900">
            2
          </span>
          같은 날 여러 편
        </span>
      </div>

      <div className="mt-4">
        <YearCalendar
          year={year}
          cells={cells}
          categoryCode={validCategory || undefined}
          labels={Object.fromEntries(categories.map((c) => [c.code, c.label]))}
        />
      </div>
    </>
  );
}

const selectClsStatic =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

// ── 빠진 날 찾기 ─────────────────────────────────────────────
async function MissingTab({
  searchParams,
  categories,
  range,
  validCategory,
}: {
  searchParams: SP;
  categories: { code: string; label: string }[];
  range: { min: number; max: number };
  validCategory: string;
}) {
  const wdParam = parseInt(one(searchParams.weekday) ?? "0", 10);
  const weekday = WEEKDAY_OPTIONS.some((o) => o.value === wdParam) ? wdParam : 0;

  const fromYear = clampYear(one(searchParams.from), range.min, range);
  const toYear = clampYear(one(searchParams.to), range.max, range);

  // 분류를 아직 고른 적이 없을 때만(주소에 category 가 아예 없을 때) 요일에 맞는 기본값을 제안한다.
  // 사용자가 '전체 말씀 종류'를 직접 고른 경우(category=)에는 그 선택을 존중한다.
  const categoryProvided = searchParams.category !== undefined;
  const suggested = weekday === 0 ? "SUNDAY" : weekday === 3 ? "WEDNESDAY" : "";
  const effectiveCategory =
    validCategory ||
    (!categoryProvided && categories.some((c) => c.code === suggested)
      ? suggested
      : "");

  const report = await missingWeekdayReport({
    weekday,
    categoryCode: effectiveCategory || undefined,
    fromISO: `${fromYear}-01-01`,
    toISO: `${toYear}-12-31`,
  });

  const catLabel =
    categories.find((c) => c.code === effectiveCategory)?.label || "전체 말씀";
  const wdLabel = WEEKDAY_OPTIONS.find((o) => o.value === weekday)!.label;

  // 너무 길어지지 않도록 화면에는 상한을 둔다(연도별 요약은 전부 보여줌).
  const LIST_CAP = 600;
  const shown = report.missing.slice(0, LIST_CAP);

  return (
    <>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="missing" />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">요일</span>
          <select name="weekday" defaultValue={weekday} className={selectClsStatic}>
            {WEEKDAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">말씀 종류</span>
          <select
            name="category"
            defaultValue={effectiveCategory}
            className={selectClsStatic}
          >
            <option value="">전체 말씀 종류</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">시작 연도</span>
          <input
            type="number"
            name="from"
            defaultValue={fromYear}
            min={1900}
            max={2100}
            className={`${selectClsStatic} w-28`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">끝 연도</span>
          <input
            type="number"
            name="to"
            defaultValue={toYear}
            min={1900}
            max={2100}
            className={`${selectClsStatic} w-28`}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          점검
        </button>
      </form>

      {/* 요약 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="점검한 날" value={`${report.expected.toLocaleString()}일`} />
        <Stat label="말씀 있음" value={`${report.present.toLocaleString()}일`} tone="ok" />
        <Stat
          label="빠진 날"
          value={`${report.missing.length.toLocaleString()}일`}
          tone={report.missing.length ? "bad" : "ok"}
        />
        <Stat
          label="채움률"
          value={
            report.expected
              ? `${((report.present / report.expected) * 100).toFixed(1)}%`
              : "-"
          }
        />
      </div>

      <p className="mt-3 text-sm text-slate-600">
        <strong>{fromYear}~{toYear}년</strong> 사이 모든 <strong>{wdLabel}</strong> 중{" "}
        <strong>{catLabel}</strong>이(가) 등록되지 않은 날입니다.
      </p>

      {report.missing.length === 0 ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-6 text-center text-green-800">
          빠진 날이 없습니다. 모든 {wdLabel}에 {catLabel}이(가) 등록되어 있습니다.
        </div>
      ) : (
        <>
          {/* 연도별 요약 */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">연도</th>
                  <th className="px-3 py-2 font-medium">점검</th>
                  <th className="px-3 py-2 font-medium">빠짐</th>
                  <th className="px-3 py-2 font-medium">채움률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.byYear
                  .filter((y) => y.missing > 0)
                  .map((y) => {
                    const pct = ((1 - y.missing / y.expected) * 100).toFixed(0);
                    return (
                      <tr key={y.year}>
                        <td className="px-3 py-1.5 font-medium text-slate-800">
                          <Link
                            href={`/calendar?year=${y.year}${
                              effectiveCategory ? `&category=${effectiveCategory}` : ""
                            }`}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {y.year}년
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{y.expected}일</td>
                        <td className="px-3 py-1.5 font-semibold text-rose-600">
                          {y.missing}일
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full bg-brand-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* 빠진 날짜 목록 */}
          <h2 className="mt-6 text-sm font-semibold text-slate-700">
            빠진 날짜 ({report.missing.length.toLocaleString()}일)
            {report.missing.length > LIST_CAP && (
              <span className="ml-2 font-normal text-slate-400">
                — 화면에는 앞 {LIST_CAP}일만 표시합니다. 기간을 좁혀서 확인하세요.
              </span>
            )}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((m) => {
              const wd = WEEKDAY_LABELS[new Date(`${m.date}T00:00:00Z`).getUTCDay()];
              return (
                <Link
                  key={m.date}
                  href={`/sermons?from=${m.date}&to=${m.date}`}
                  title={
                    m.otherCount > 0
                      ? `${m.date} — 이 날 다른 종류 말씀 ${m.otherCount}편이 있습니다 (분류가 잘못됐을 수 있음)`
                      : `${m.date} — 이 날 등록된 말씀이 하나도 없습니다`
                  }
                  className={`rounded-lg border px-2 py-1 text-xs transition ${
                    m.otherCount > 0
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  {m.date} ({wd})
                  {m.otherCount > 0 && (
                    <span className="ml-1 font-semibold">+{m.otherCount}</span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-rose-200 bg-rose-50" />
              그 날 등록된 말씀이 아예 없음 → <strong>업로드 누락</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50" />
              다른 종류로는 등록돼 있음 → <strong>분류 오류일 수 있음</strong> (날짜를 눌러 확인)
            </span>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok" ? "text-green-700" : tone === "bad" ? "text-rose-600" : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function clampYear(
  raw: string | undefined,
  fallback: number,
  range: { min: number; max: number }
): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return fallback;
  return n;
}
