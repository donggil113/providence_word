"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { CATEGORY_OPTIONS } from "@/lib/categories";

interface Props {
  years: number[];
  departments: string[];
  // 컴팩트 모드(홈 화면용): 키워드 + 검색 버튼만
  compact?: boolean;
}

export default function SearchForm({ years, departments, compact = false }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [department, setDepartment] = useState(params.get("department") || "");
  const [year, setYear] = useState(params.get("year") || "");
  const [from, setFrom] = useState(params.get("from") || "");
  const [to, setTo] = useState(params.get("to") || "");
  const [sort, setSort] = useState(params.get("sort") || "desc");

  // 뒤로가기 등으로 URL 이 바뀌면 입력값 동기화
  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("category") || "");
    setDepartment(params.get("department") || "");
    setYear(params.get("year") || "");
    setFrom(params.get("from") || "");
    setTo(params.get("to") || "");
    setSort(params.get("sort") || "desc");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (compact) {
      router.push(`/sermons?${sp.toString()}`);
      return;
    }
    if (category) sp.set("category", category);
    if (department) sp.set("department", department);
    if (year) sp.set("year", year);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (sort && sort !== "desc") sp.set("sort", sort);
    router.push(`/sermons?${sp.toString()}`);
  }

  function reset() {
    setQ(""); setCategory(""); setDepartment(""); setYear("");
    setFrom(""); setTo(""); setSort("desc");
    router.push("/sermons");
  }

  if (compact) {
    return (
      <form onSubmit={submit} className="flex gap-2 w-full">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목, 성경구절, 설교자, 본문 내용으로 검색…"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 transition shrink-0"
        >
          검색
        </button>
      </form>
    );
  }

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="키워드: 제목, 성경구절, 설교자, 행사명, 본문 내용…"
        className={`${inputCls} w-full text-base py-2.5`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputCls}
          aria-label="말씀 종류"
        >
          <option value="">전체 종류</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={inputCls}
          aria-label="부서"
        >
          <option value="">전체 부서</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={inputCls}
          aria-label="연도"
        >
          <option value="">전체 연도</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={inputCls}
          aria-label="정렬"
        >
          <option value="desc">최신순</option>
          <option value="asc">오래된순</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <label className="text-sm text-slate-600 shrink-0">기간</label>
        <div className="flex items-center gap-2 flex-1">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputCls} flex-1`}
            aria-label="시작일"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputCls} flex-1`}
            aria-label="종료일"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 transition"
        >
          검색
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50 transition"
        >
          초기화
        </button>
      </div>
    </form>
  );
}
