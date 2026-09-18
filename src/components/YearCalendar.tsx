import Link from "next/link";
import { DayCell, WEEKDAY_LABELS } from "@/lib/calendar";

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 그 달의 날짜 수 */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** 1일이 무슨 요일인지 (0=일) */
function firstWeekday(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 1)).getUTCDay();
}

function MonthGrid({
  year,
  month,
  cells,
  categoryParam,
  today,
  labels,
}: {
  year: number;
  month: number;
  cells: Map<string, DayCell>;
  categoryParam: string;
  today: string;
  labels: Record<string, string>;
}) {
  const total = daysInMonth(year, month);
  const lead = firstWeekday(year, month);
  const blanks = Array.from({ length: lead });
  const days = Array.from({ length: total }, (_, i) => i + 1);

  // 이 달의 통계
  let have = 0;
  for (const d of days) if (cells.get(iso(year, month, d))) have += 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-800">{MONTH_LABELS[month]}</h3>
        <span className="text-[11px] text-slate-400">{have}일</span>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={`pb-1 text-[10px] font-medium ${
              i === 0 ? "text-rose-500" : i === 3 ? "text-brand-600" : "text-slate-400"
            }`}
          >
            {w}
          </div>
        ))}

        {blanks.map((_, i) => (
          <div key={`b${i}`} />
        ))}

        {days.map((d) => {
          const key = iso(year, month, d);
          const cell = cells.get(key);
          const dow = (lead + d - 1) % 7;
          const isToday = key === today;

          // 있는 날은 진하게, 없는 날은 흐리게. 주일/수요는 테두리로 구분.
          const base =
            "relative flex h-7 items-center justify-center rounded text-[11px] transition";
          const style = cell
            ? "bg-brand-600 font-semibold text-white hover:bg-brand-700"
            : dow === 0 || dow === 3
              ? "bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              : "text-slate-300 hover:bg-slate-50";

          const inner = (
            <>
              {d}
              {cell && cell.count > 1 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-900">
                  {cell.count}
                </span>
              )}
            </>
          );

          if (!cell) {
            return (
              <div
                key={key}
                className={`${base} ${style} ${isToday ? "ring-2 ring-brand-400" : ""}`}
                title={`${key} (${WEEKDAY_LABELS[dow]}) — 말씀 없음`}
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={key}
              href={`/sermons?from=${key}&to=${key}${categoryParam}`}
              className={`${base} ${style} ${isToday ? "ring-2 ring-brand-400" : ""}`}
              title={`${key} (${WEEKDAY_LABELS[dow]}) — ${cell.count}편${
                cell.codes.length
                  ? " · " + cell.codes.map((c) => labels[c] || c).join(", ")
                  : ""
              }`}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function YearCalendar({
  year,
  cells,
  categoryCode,
  labels,
}: {
  year: number;
  cells: Map<string, DayCell>;
  categoryCode?: string;
  /** 분류 코드 → 이름 (날짜 위에 마우스를 올렸을 때 표시) */
  labels: Record<string, string>;
}) {
  const categoryParam = categoryCode ? `&category=${categoryCode}` : "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => (
        <MonthGrid
          key={m}
          year={year}
          month={m}
          cells={cells}
          categoryParam={categoryParam}
          today={today}
          labels={labels}
        />
      ))}
    </div>
  );
}
