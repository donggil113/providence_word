import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * 달력 보기 / 누락 점검용 집계.
 *
 * preachedAt 은 항상 그 날 00:00(UTC)로 저장되므로, 날짜만 떼어내 비교하면
 * 시간대 때문에 하루가 밀리는 문제가 없다. (SQL 에서 to_char 로 문자열화)
 */

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 요일 선택지 — 주일(일)·수요가 가장 자주 쓰이므로 앞에 둔다. */
export const WEEKDAY_OPTIONS = [
  { value: 0, label: "일요일 (주일)" },
  { value: 3, label: "수요일" },
  { value: 1, label: "월요일" },
  { value: 2, label: "화요일" },
  { value: 4, label: "목요일" },
  { value: 5, label: "금요일" },
  { value: 6, label: "토요일" },
];

export interface DayCell {
  /** YYYY-MM-DD */
  date: string;
  count: number;
  /** 해당 날짜에 있는 분류 코드들(중복 없음) */
  codes: string[];
}

/**
 * 기간 내 날짜별 말씀 수. 달력 칠하기에 사용.
 * categoryCode 를 주면 그 분류만 센다.
 */
export async function dayCells(
  fromISO: string,
  toISO: string,
  categoryCode?: string
): Promise<Map<string, DayCell>> {
  const catFilter = categoryCode
    ? Prisma.sql`AND c.code = ${categoryCode}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { d: string; c: bigint | number; codes: string[] }[]
  >`
    SELECT to_char(s."preachedAt", 'YYYY-MM-DD') AS d,
           COUNT(*) AS c,
           ARRAY_AGG(DISTINCT c.code) AS codes
    FROM sermons s
    JOIN categories c ON c.id = s."categoryId"
    WHERE s."preachedAt" >= ${fromISO}::date
      AND s."preachedAt" < (${toISO}::date + 1)
      ${catFilter}
    GROUP BY 1
  `;

  const map = new Map<string, DayCell>();
  for (const r of rows) {
    map.set(r.d, { date: r.d, count: Number(r.c), codes: r.codes || [] });
  }
  return map;
}

export interface MissingDay {
  /** YYYY-MM-DD */
  date: string;
  /** 그 날 '다른 분류로' 등록된 말씀 수 — 0 이면 아예 없음, 1 이상이면 분류가 다를 가능성 */
  otherCount: number;
}

export interface MissingReport {
  /** 점검 대상 날짜 수 (해당 요일 전체) */
  expected: number;
  /** 말씀이 있는 날 수 */
  present: number;
  missing: MissingDay[];
  /** 연도별 누락 건수 */
  byYear: { year: number; expected: number; missing: number }[];
}

/**
 * 특정 요일에 특정 분류의 말씀이 빠진 날짜를 찾는다.
 * 예) 1978~2026 사이 모든 '일요일' 중 주일말씀이 없는 날.
 *
 * otherCount 로 "그 날 아무것도 없음"과 "다른 분류로는 등록돼 있음"을 구분해
 * 업로드 누락인지 분류 오류인지 가늠할 수 있게 한다.
 */
export async function missingWeekdayReport(opts: {
  weekday: number; // 0=일 … 6=토
  categoryCode?: string;
  fromISO: string;
  toISO: string;
}): Promise<MissingReport> {
  const { weekday, categoryCode, fromISO, toISO } = opts;

  const catCount = categoryCode
    ? Prisma.sql`COUNT(*) FILTER (WHERE c.code = ${categoryCode})`
    : Prisma.sql`COUNT(*)`;
  const otherCount = categoryCode
    ? Prisma.sql`COUNT(*) FILTER (WHERE c.code <> ${categoryCode})`
    : Prisma.sql`0`;

  const rows = await prisma.$queryRaw<
    { d: string; y: number; hit: bigint | number; other: bigint | number }[]
  >`
    WITH days AS (
      SELECT generate_series(${fromISO}::date, ${toISO}::date, interval '1 day')::date AS d
    ),
    agg AS (
      SELECT s."preachedAt"::date AS d,
             ${catCount} AS hit,
             ${otherCount} AS other
      FROM sermons s
      JOIN categories c ON c.id = s."categoryId"
      WHERE s."preachedAt" >= ${fromISO}::date
        AND s."preachedAt" < (${toISO}::date + 1)
      GROUP BY 1
    )
    SELECT to_char(days.d, 'YYYY-MM-DD') AS d,
           EXTRACT(YEAR FROM days.d)::int AS y,
           COALESCE(agg.hit, 0) AS hit,
           COALESCE(agg.other, 0) AS other
    FROM days
    LEFT JOIN agg ON agg.d = days.d
    WHERE EXTRACT(DOW FROM days.d) = ${weekday}
    ORDER BY days.d
  `;

  const missing: MissingDay[] = [];
  const yearMap = new Map<number, { expected: number; missing: number }>();
  let present = 0;

  for (const r of rows) {
    const stat = yearMap.get(r.y) || { expected: 0, missing: 0 };
    stat.expected += 1;
    if (Number(r.hit) > 0) {
      present += 1;
    } else {
      stat.missing += 1;
      missing.push({ date: r.d, otherCount: Number(r.other) });
    }
    yearMap.set(r.y, stat);
  }

  return {
    expected: rows.length,
    present,
    missing,
    byYear: [...yearMap.entries()]
      .map(([year, s]) => ({ year, ...s }))
      .sort((a, b) => a.year - b.year),
  };
}

/** 말씀이 등록된 연도 범위 (달력·점검 기본값용) */
export async function sermonYearRange(): Promise<{ min: number; max: number }> {
  const rows = await prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
    SELECT MIN("year")::int AS min, MAX("year")::int AS max FROM sermons
  `;
  const now = new Date().getFullYear();
  const min = rows[0]?.min ?? now;
  const max = rows[0]?.max ?? now;
  return { min, max };
}
