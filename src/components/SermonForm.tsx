"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_OPTIONS, FILE_KIND_LABELS } from "@/lib/categories";
import { formatBytes } from "@/lib/format";

export interface ExistingFile {
  id: string;
  originalName: string;
  kind: keyof typeof FILE_KIND_LABELS;
  size: number;
}

export interface SermonInitial {
  id?: string;
  title?: string;
  category?: string;
  department?: string | null;
  eventName?: string | null;
  preacher?: string | null;
  scripture?: string | null;
  summary?: string | null;
  preachedAt?: string; // YYYY-MM-DD
  files?: ExistingFile[];
}

export default function SermonForm({ initial }: { initial?: SermonInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "SUNDAY");
  const [preachedAt, setPreachedAt] = useState(initial?.preachedAt || "");
  const [scripture, setScripture] = useState(initial?.scripture || "");
  const [preacher, setPreacher] = useState(initial?.preacher || "");
  const [department, setDepartment] = useState(initial?.department || "");
  const [eventName, setEventName] = useState(initial?.eventName || "");
  const [summary, setSummary] = useState(initial?.summary || "");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deleteFileIds, setDeleteFileIds] = useState<string[]>([]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleDelete(id: string) {
    setDeleteFileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("제목을 입력하세요.");
    if (!preachedAt) return setError("선포일을 입력하세요.");

    const fd = new FormData();
    fd.set("title", title);
    fd.set("category", category);
    fd.set("preachedAt", preachedAt);
    fd.set("scripture", scripture);
    fd.set("preacher", preacher);
    fd.set("department", department);
    fd.set("eventName", eventName);
    fd.set("summary", summary);
    newFiles.forEach((f) => fd.append("files", f));
    deleteFileIds.forEach((id) => fd.append("deleteFileIds", id));

    setBusy(true);
    const url = isEdit ? `/api/sermons/${initial!.id}` : "/api/sermons";
    const res = await fetch(url, { method: "POST", body: fd });
    setBusy(false);

    if (res.ok) {
      const data = await res.json();
      router.push(`/sermons/${data.sermon.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "저장에 실패했습니다.");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";
  const labelCls = "text-sm font-medium text-slate-600";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div>
        <label className={labelCls}>제목 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={`mt-1 ${inputCls}`}
          placeholder="말씀 제목"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>말씀 종류 *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`mt-1 ${inputCls}`}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>선포일 *</label>
          <input
            type="date"
            value={preachedAt}
            onChange={(e) => setPreachedAt(e.target.value)}
            required
            className={`mt-1 ${inputCls}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>성경 본문</label>
          <input
            value={scripture}
            onChange={(e) => setScripture(e.target.value)}
            className={`mt-1 ${inputCls}`}
            placeholder="예: 창세기 1:1-5"
          />
        </div>
        <div>
          <label className={labelCls}>설교자</label>
          <input
            value={preacher}
            onChange={(e) => setPreacher(e.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </div>
        <div>
          <label className={labelCls}>부서 (부서 말씀일 때)</label>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={`mt-1 ${inputCls}`}
            placeholder="예: 청년부, 학생부"
          />
        </div>
        <div>
          <label className={labelCls}>행사명 (집회 등)</label>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className={`mt-1 ${inputCls}`}
            placeholder="예: 여름 성령집회"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>요약 / 설명</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className={`mt-1 ${inputCls}`}
        />
      </div>

      {/* 기존 파일 (수정 모드) */}
      {isEdit && initial?.files && initial.files.length > 0 && (
        <div>
          <label className={labelCls}>기존 첨부 파일</label>
          <ul className="mt-1 space-y-1.5">
            {initial.files.map((f) => {
              const marked = deleteFileIds.includes(f.id);
              return (
                <li
                  key={f.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                    marked ? "border-red-200 bg-red-50 opacity-60" : "border-slate-200"
                  }`}
                >
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                    {FILE_KIND_LABELS[f.kind]}
                  </span>
                  <span className={`flex-1 truncate ${marked ? "line-through" : ""}`}>
                    {f.originalName}
                  </span>
                  <span className="text-xs text-slate-400">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => toggleDelete(f.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {marked ? "취소" : "삭제"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <label className={labelCls}>
          {isEdit ? "파일 추가" : "말씀 파일 첨부"} (txt, pdf, hwp — 여러 개 가능)
        </label>
        <input
          type="file"
          multiple
          accept=".txt,.pdf,.hwp,.hwpx"
          onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-brand-700 hover:file:bg-brand-100"
        />
        {newFiles.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            선택됨: {newFiles.map((f) => f.name).join(", ")}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          txt·pdf 파일은 본문 내용이 자동으로 추출되어 검색에 포함됩니다. (파일당 최대 50MB)
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
        >
          {busy ? "저장 중…" : isEdit ? "수정 저장" : "등록"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition"
        >
          취소
        </button>
      </div>
    </form>
  );
}
