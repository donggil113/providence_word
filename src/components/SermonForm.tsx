"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryLite, FILE_KIND_LABELS } from "@/lib/categories";
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
  contentText?: string | null; // 편집기에 실을 본문(너무 길면 서버에서 비워서 내려보냄)
  contentTooLong?: boolean; // 본문이 너무 길어 편집기에 싣지 않은 경우
}

// 본문 직접 입력 최대 길이 (서버와 동일)
const MAX_BODY_CHARS = 500_000;

export default function SermonForm({
  initial,
  categories,
}: {
  initial?: SermonInitial;
  categories: CategoryLite[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(
    initial?.category || categories[0]?.code || ""
  );
  const [preachedAt, setPreachedAt] = useState(initial?.preachedAt || "");
  const [scripture, setScripture] = useState(initial?.scripture || "");
  const [preacher, setPreacher] = useState(initial?.preacher || "");
  const [department, setDepartment] = useState(initial?.department || "");
  const [eventName, setEventName] = useState(initial?.eventName || "");
  const [summary, setSummary] = useState(initial?.summary || "");
  const [contentText, setContentText] = useState(initial?.contentText || "");
  const [bodyTouched, setBodyTouched] = useState(false);
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
    if (!isEdit && !contentText.trim() && newFiles.length === 0) {
      return setError("말씀 본문을 입력하거나 파일을 첨부하세요.");
    }
    if (contentText.length > MAX_BODY_CHARS) {
      return setError(`본문이 너무 깁니다. (최대 ${MAX_BODY_CHARS.toLocaleString()}자)`);
    }

    // 본문 처리 방식을 서버에 알려준다.
    //   manual : 편집기의 본문을 그대로 저장
    //   keep   : 본문이 길어 편집기에 싣지 않았고 건드리지도 않음 → 기존 본문 유지
    //   files  : 첨부 파일에서 다시 추출 (본문을 비운 경우)
    let contentMode: "manual" | "keep" | "files" = "manual";
    if (isEdit && initial?.contentTooLong && !bodyTouched) contentMode = "keep";
    else if (isEdit && !contentText.trim() && !bodyTouched) contentMode = "files";

    const fd = new FormData();
    fd.set("contentMode", contentMode);
    fd.set("contentText", contentText);
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
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
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

      {/* 본문 직접 입력 */}
      <div>
        <label className={labelCls}>말씀 본문 (직접 입력)</label>
        {initial?.contentTooLong && !bodyTouched ? (
          <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            본문이 너무 길어 편집기에 불러오지 않았습니다. 그대로 두면 기존 본문이 유지됩니다.
            <button
              type="button"
              onClick={() => setBodyTouched(true)}
              className="ml-2 font-medium text-brand-700 underline"
            >
              그래도 직접 편집하기
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={contentText}
              onChange={(e) => {
                setContentText(e.target.value);
                setBodyTouched(true);
              }}
              rows={14}
              className={`mt-1 font-mono text-[13px] leading-relaxed ${inputCls}`}
              placeholder={
                "파일 없이 말씀 본문을 여기에 붙여넣거나 입력하세요.\n\n" +
                "· 입력한 본문은 그대로 검색 대상이 됩니다.\n" +
                "· PDF 원문을 첨부하지 않으면, 이 본문으로 명조체 PDF가 자동 생성되어\n" +
                "  다른 말씀들과 똑같이 'PDF 원문 보기' 탭에서 볼 수 있습니다."
              }
            />
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
              <span>{contentText.length.toLocaleString()}자</span>
              <span>· 빈 줄로 문단을 나누면 PDF에서도 문단이 유지됩니다.</span>
              {isEdit && bodyTouched && (
                <span className="text-amber-600">· 저장하면 기존 본문을 덮어씁니다.</span>
              )}
            </p>
          </>
        )}
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
          {isEdit ? "파일 추가" : "말씀 파일 첨부"} (txt, pdf, hwp — 여러 개 가능, 선택)
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
