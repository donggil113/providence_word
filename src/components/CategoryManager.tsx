"use client";

import { useState } from "react";
import { PALETTE, PALETTE_NAMES, paletteStyle } from "@/lib/categories";

export interface ManagedCategory {
  id: string;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
  isBuiltin: boolean;
  count: number;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PALETTE_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          title={name}
          className={`h-6 w-6 rounded-full border-2 ${
            value === name ? "border-slate-800" : "border-transparent"
          }`}
          style={{ backgroundColor: PALETTE[name].bg }}
        />
      ))}
    </div>
  );
}

export default function CategoryManager({
  initial,
}: {
  initial: ManagedCategory[];
}) {
  const [cats, setCats] = useState<ManagedCategory[]>(initial);
  const [error, setError] = useState("");

  // 새 분류 입력값
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("teal");
  const [busy, setBusy] = useState(false);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, code: code || undefined, color }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCats((c) =>
        [...c, { ...data.category, count: 0 }].sort((a, b) => a.sortOrder - b.sortOrder)
      );
      setLabel(""); setCode(""); setColor("teal");
    } else {
      setError(data.error || "추가에 실패했습니다.");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCats((list) =>
        list
          .map((c) => (c.id === id ? { ...c, ...data.category } : c))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      );
    } else {
      alert(data.error || "변경에 실패했습니다.");
    }
  }

  async function remove(id: string) {
    if (!confirm("이 분류를 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setCats((c) => c.filter((x) => x.id !== id));
    else alert(data.error || "삭제에 실패했습니다.");
  }

  return (
    <div className="space-y-6">
      {/* 목록 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3 flex-wrap">
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={paletteStyle(c.color)}
            >
              {c.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">{c.code}</span>
            <span className="text-xs text-slate-400">· {c.count}편</span>
            {c.isBuiltin && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">기본</span>
            )}

            <div className="ml-auto flex items-center gap-3">
              {/* 라벨 수정 */}
              <input
                defaultValue={c.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.label) patch(c.id, { label: v });
                }}
                className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              {/* 색 */}
              <ColorPicker value={c.color} onChange={(col) => patch(c.id, { color: col })} />
              {/* 순서 */}
              <input
                type="number"
                defaultValue={c.sortOrder}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v !== c.sortOrder) patch(c.id, { sortOrder: v });
                }}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                title="표시 순서"
              />
              {!c.isBuiltin && c.count === 0 && (
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 새 분류 추가 */}
      <form onSubmit={addCategory} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">새 말씀 종류 추가</h2>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-600">분류명 *</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="예: 교역자 말씀"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">코드 (선택, 비우면 자동)</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="예: PASTORAL (영문 대문자)"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-slate-600">색상</label>
          <div className="mt-1">
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
        >
          {busy ? "추가 중…" : "분류 추가"}
        </button>
      </form>

      <p className="text-xs text-slate-400">
        · 코드는 CSV 일괄 등록(import.ts)의 category 값과 일치해야 합니다.<br />
        · 기본 분류는 삭제할 수 없고, 말씀이 등록된 분류도 삭제할 수 없습니다(먼저 다른 분류로 이동).<br />
        · 라벨·색·순서는 입력 후 칸 밖을 클릭하면 저장됩니다.
      </p>
    </div>
  );
}
