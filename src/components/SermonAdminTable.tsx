"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CategoryLite, paletteStyle } from "@/lib/categories";
import DeleteSermonButton from "./DeleteSermonButton";

export interface AdminRow {
  id: string;
  title: string;
  preachedAt: string; // YYYY-MM-DD
  scripture: string | null;
  preacher: string | null;
  needsReview: boolean;
  category: { code: string; label: string; color: string } | null;
}

export interface BulkFilter {
  q?: string;
  category?: string;
  needsReview?: string;
}

export default function SermonAdminTable({
  initialRows,
  categories,
  filter,
  totalMatching,
}: {
  initialRows: AdminRow[];
  categories: CategoryLite[];
  filter: BulkFilter;
  totalMatching: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCode, setBulkCode] = useState(categories[0]?.code || "");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  function flashRow(id: string) {
    setFlash((f) => new Set(f).add(id));
    setTimeout(() => setFlash((f) => { const n = new Set(f); n.delete(id); return n; }), 1200);
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAllPage() {
    setSelected((s) => {
      const n = new Set(s);
      if (allPageSelected) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  }
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // 한 행의 필드 인라인 수정 (PATCH). 수정하면 검토필요 해제.
  async function patchRow(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/sermons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRows((list) =>
        list.map((r) =>
          r.id === id
            ? {
                ...r,
                needsReview: data.sermon.needsReview ?? false,
                category: data.sermon.category ?? r.category,
              }
            : r
        )
      );
      flashRow(id);
      return true;
    } else {
      alert(data.error || "저장에 실패했습니다.");
      return false;
    }
  }

  // 값이 바뀌었을 때만 저장 (onBlur)
  function onFieldBlur(id: string, field: string, value: string, original: string | null) {
    const v = value.trim();
    if (v === (original || "").trim()) return;
    patchRow(id, { [field]: v });
  }

  // 일괄 이동 (선택 목록)
  async function bulkSelected() {
    if (selected.size === 0 || !bulkCode) return;
    const label = categories.find((c) => c.code === bulkCode)?.label || bulkCode;
    if (!confirm(`선택한 ${selected.size}개 말씀을 '${label}' 분류로 이동할까요?`)) return;
    setBusy(true);
    const res = await fetch("/api/sermons/bulk-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryCode: bulkCode, ids: Array.from(selected) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setSelected(new Set());
      alert(`${data.count}개를 '${data.category.label}'(으)로 이동했습니다.`);
      router.refresh();
    } else {
      alert(data.error || "일괄 이동에 실패했습니다.");
    }
  }

  // 현재 필터에 해당하는 전체 이동 (페이지 넘어서 모두)
  async function bulkAllFilter() {
    if (!bulkCode) return;
    const label = categories.find((c) => c.code === bulkCode)?.label || bulkCode;
    if (!confirm(`현재 목록에 해당하는 전체 ${totalMatching}개 말씀을 '${label}' 분류로 이동할까요?\n(되돌리기 어려우니 신중히 진행하세요)`)) return;
    setBusy(true);
    const res = await fetch("/api/sermons/bulk-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryCode: bulkCode, filter }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setSelected(new Set());
      alert(`${data.count}개를 '${data.category.label}'(으)로 이동했습니다.`);
      router.refresh();
    } else {
      alert(data.error || "일괄 이동에 실패했습니다.");
    }
  }

  const inputCls =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500 outline-none";

  return (
    <div>
      {/* 일괄 작업 바 */}
      <div className="sticky top-14 z-20 mb-3 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            선택 <strong className="text-brand-700">{selected.size}</strong>개
          </span>
          <span className="text-slate-300">→</span>
          <select
            value={bulkCode}
            onChange={(e) => setBulkCode(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={bulkSelected}
            disabled={busy || selected.size === 0}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            선택 {selected.size}개 이동
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={bulkAllFilter}
              disabled={busy || totalMatching === 0}
              className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100 disabled:opacity-40"
              title="현재 필터(예: 기타 전체)를 페이지 넘어서 모두 이동"
            >
              현재 목록 전체 {totalMatching.toLocaleString()}개 이동
            </button>
          </div>
        </div>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="w-10 px-2 py-2">
                <input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} aria-label="이 페이지 전체 선택" />
              </th>
              <th className="w-32 px-2 py-2">선포일</th>
              <th className="w-36 px-2 py-2">분류</th>
              <th className="px-2 py-2">제목</th>
              <th className="w-40 px-2 py-2">성경본문</th>
              <th className="w-28 px-2 py-2">설교자</th>
              <th className="w-24 px-2 py-2">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`${selected.has(r.id) ? "bg-brand-50/60" : flash.has(r.id) ? "bg-green-50" : "hover:bg-slate-50"} transition-colors`}
              >
                <td className="px-2 py-1.5 align-top">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1.5" />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="date"
                    defaultValue={r.preachedAt}
                    onBlur={(e) => onFieldBlur(r.id, "preachedAt", e.target.value, r.preachedAt)}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={r.category?.code || ""}
                    onChange={(e) => patchRow(r.id, { category: e.target.value })}
                    className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    style={r.category ? paletteStyle(r.category.color) : undefined}
                  >
                    {categories.map((c) => (
                      <option key={c.code} value={c.code} style={{ backgroundColor: "white", color: "#0f172a" }}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {r.needsReview && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" title="검토필요">
                        검토
                      </span>
                    )}
                    <input
                      defaultValue={r.title}
                      onBlur={(e) => onFieldBlur(r.id, "title", e.target.value, r.title)}
                      className={inputCls}
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={r.scripture || ""}
                    placeholder="—"
                    onBlur={(e) => onFieldBlur(r.id, "scripture", e.target.value, r.scripture)}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={r.preacher || ""}
                    placeholder="—"
                    onBlur={(e) => onFieldBlur(r.id, "preacher", e.target.value, r.preacher)}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/sermons/${r.id}/edit`} className="text-xs text-brand-600 hover:underline" title="전체 수정(파일 등)">
                      상세
                    </Link>
                    <DeleteSermonButton
                      id={r.id}
                      redirectTo="/admin"
                      className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        제목·날짜·성경본문·설교자는 칸을 클릭해 고친 뒤 다른 곳을 클릭하면 저장됩니다(초록색 표시). 분류는 드롭다운으로 즉시 변경됩니다.
        수정하면 ‘검토’ 표시가 해제됩니다.
      </p>
    </div>
  );
}
