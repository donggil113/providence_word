"use client";

import { useMemo, useState } from "react";
import { CategoryLite, paletteStyle } from "@/lib/categories";
import { buildCategoryRules, guessFromFilename } from "@/lib/filename-rules";
import { formatBytes } from "@/lib/format";

type RowStatus = "ready" | "uploading" | "done" | "error";

interface Row {
  key: string;
  file: File;
  title: string;
  preachedAt: string;
  categoryCode: string;
  guessedDate: boolean;
  guessedCategory: boolean;
  status: RowStatus;
  message: string;
  sermonId?: string;
}

export default function BulkUploader({
  categories,
}: {
  categories: CategoryLite[];
}) {
  const rules = useMemo(() => buildCategoryRules(categories), [categories]);
  const catByCode = useMemo(
    () => new Map(categories.map((c) => [c.code, c])),
    [categories]
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [bulkCategory, setBulkCategory] = useState(categories[0]?.code || "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const existing = new Set(rows.map((r) => `${r.file.name}:${r.file.size}`));
    const next: Row[] = [];
    Array.from(files).forEach((file, i) => {
      const dedupeKey = `${file.name}:${file.size}`;
      if (existing.has(dedupeKey)) return; // 같은 파일 중복 추가 방지
      existing.add(dedupeKey);
      // webkitRelativePath 가 있으면 상위 폴더명도 분류 판정에 쓴다.
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const parts = rel.split("/").filter(Boolean);
      const parentFolder = parts.length > 1 ? parts[parts.length - 2] : "";
      const g = guessFromFilename(file.name, rules, parentFolder);
      const known = catByCode.has(g.categoryCode);
      next.push({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        title: g.title,
        preachedAt: g.preachedAt,
        categoryCode: known ? g.categoryCode : "ETC",
        guessedDate: g.dateMatched,
        guessedCategory: g.categoryMatched && known,
        status: "ready",
        message: "",
      });
    });
    setRows((prev) => [...prev, ...next]);
  }

  function patch(key: string, changes: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function applyCategoryToAll() {
    setRows((prev) =>
      prev.map((r) =>
        r.status === "done" ? r : { ...r, categoryCode: bulkCategory, guessedCategory: true }
      )
    );
  }

  const pending = rows.filter((r) => r.status !== "done");
  const missingDate = pending.filter((r) => !r.preachedAt).length;
  const missingTitle = pending.filter((r) => !r.title.trim()).length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  async function uploadAll() {
    setError("");
    if (pending.length === 0) return;
    if (missingDate > 0) {
      setError(`선포일이 비어 있는 항목이 ${missingDate}개 있습니다. 먼저 채워주세요.`);
      return;
    }
    if (missingTitle > 0) {
      setError(`제목이 비어 있는 항목이 ${missingTitle}개 있습니다. 먼저 채워주세요.`);
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: pending.length });

    // 서버 부담을 줄이려고 한 개씩 차례로 올린다(PDF 텍스트 추출이 무거움).
    let finished = 0;
    for (const row of pending) {
      patch(row.key, { status: "uploading", message: "" });
      try {
        const fd = new FormData();
        fd.set("title", row.title.trim());
        fd.set("category", row.categoryCode);
        fd.set("preachedAt", row.preachedAt);
        fd.set("contentMode", "files");
        fd.append("files", row.file);

        const res = await fetch("/api/sermons", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          patch(row.key, {
            status: "done",
            message: "등록됨",
            sermonId: data?.sermon?.id,
          });
        } else {
          patch(row.key, {
            status: "error",
            message: data?.error || `실패 (HTTP ${res.status})`,
          });
        }
      } catch (e) {
        patch(row.key, { status: "error", message: (e as Error).message || "네트워크 오류" });
      }
      finished += 1;
      setProgress({ done: finished, total: pending.length });
    }

    setBusy(false);
  }

  const inputCls =
    "w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

  return (
    <div className="space-y-4">
      {/* 파일 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="text-sm font-medium text-slate-600">
          말씀 파일 선택 (pdf, txt, hwp — 여러 개 한꺼번에)
        </label>
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.hwp,.hwpx"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ""; // 같은 파일 다시 고를 수 있도록 초기화
          }}
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-brand-700 hover:file:bg-brand-100"
        />
        <p className="mt-2 text-xs text-slate-400">
          파일명 앞의 숫자(YYMMDD·YYYYMMDD)에서 선포일을, 파일명·폴더명의 키워드에서
          말씀 종류를 자동으로 채웁니다. 표에서 바로 고칠 수 있습니다. (파일당 최대 50MB)
        </p>
      </div>

      {rows.length > 0 && (
        <>
          {/* 일괄 지정 바 */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
            <span className="text-sm font-medium text-brand-900">
              {rows.length}개 선택됨
              {doneCount > 0 && <span className="ml-1 text-green-700">· 등록 {doneCount}</span>}
              {errorCount > 0 && <span className="ml-1 text-red-600">· 실패 {errorCount}</span>}
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyCategoryToAll}
                disabled={busy}
                className="rounded-lg border border-brand-400 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                전체에 이 분류 적용
              </button>
              <button
                type="button"
                onClick={uploadAll}
                disabled={busy || pending.length === 0}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy
                  ? `등록 중… ${progress.done}/${progress.total}`
                  : `${pending.length}개 등록`}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {busy && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}

          {(missingDate > 0 || missingTitle > 0) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {missingDate > 0 && <>선포일을 못 찾은 항목 {missingDate}개 </>}
              {missingTitle > 0 && <>· 제목이 빈 항목 {missingTitle}개</>} — 노란 칸을 채워주세요.
            </p>
          )}

          {/* 표 */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">파일</th>
                  <th className="px-3 py-2 font-medium">제목</th>
                  <th className="px-3 py-2 font-medium w-40">선포일</th>
                  <th className="px-3 py-2 font-medium w-44">말씀 종류</th>
                  <th className="px-3 py-2 font-medium w-28">상태</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const cat = catByCode.get(r.categoryCode);
                  const locked = r.status === "done" || r.status === "uploading";
                  return (
                    <tr key={r.key} className={r.status === "done" ? "bg-green-50/50" : ""}>
                      <td className="max-w-[16rem] px-3 py-2">
                        <div className="truncate text-slate-700" title={r.file.name}>
                          {r.file.name}
                        </div>
                        <div className="text-xs text-slate-400">{formatBytes(r.file.size)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.title}
                          onChange={(e) => patch(r.key, { title: e.target.value })}
                          disabled={locked}
                          className={`${inputCls} ${!r.title.trim() ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.preachedAt}
                          onChange={(e) => patch(r.key, { preachedAt: e.target.value })}
                          disabled={locked}
                          className={`${inputCls} ${!r.preachedAt ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                        {!r.guessedDate && r.preachedAt && (
                          <span className="text-[11px] text-slate-400">직접 입력</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.categoryCode}
                          onChange={(e) =>
                            patch(r.key, { categoryCode: e.target.value, guessedCategory: true })
                          }
                          disabled={locked}
                          className={`${inputCls} ${!r.guessedCategory ? "border-amber-400 bg-amber-50" : ""}`}
                        >
                          {categories.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {!r.guessedCategory && (
                          <span className="text-[11px] text-amber-700">자동 판정 실패</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "ready" && cat && (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-xs"
                            style={paletteStyle(cat.color)}
                          >
                            대기
                          </span>
                        )}
                        {r.status === "uploading" && (
                          <span className="text-xs text-brand-700">올리는 중…</span>
                        )}
                        {r.status === "done" && (
                          <span className="text-xs font-medium text-green-700">✓ 등록됨</span>
                        )}
                        {r.status === "error" && (
                          <span className="text-xs text-red-600" title={r.message}>
                            ✗ {r.message}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.status === "done" && r.sermonId ? (
                          <a
                            href={`/sermons/${r.sermonId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand-700 hover:underline"
                          >
                            보기
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeRow(r.key)}
                            disabled={busy}
                            className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-40"
                          >
                            제외
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {errorCount > 0 && !busy && (
            <p className="text-sm text-slate-500">
              실패한 항목은 목록에 남아 있습니다. 내용을 고친 뒤 다시 [등록]을 누르면
              아직 등록되지 않은 것만 올라갑니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
