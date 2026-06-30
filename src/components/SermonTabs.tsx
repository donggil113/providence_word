"use client";

import { useState } from "react";

export interface PdfFile {
  id: string;
  originalName: string;
}

export default function SermonTabs({
  contentText,
  pdfs,
}: {
  contentText: string | null;
  pdfs: PdfFile[];
}) {
  const hasContent = Boolean(contentText && contentText.trim());
  const hasPdf = pdfs.length > 0;

  // 기본 탭: 내용 우선, 없으면 PDF
  const [tab, setTab] = useState<"content" | "pdf">(
    hasContent || !hasPdf ? "content" : "pdf"
  );
  const [activePdf, setActivePdf] = useState(pdfs[0]?.id || "");

  const tabBtn = (key: "content" | "pdf", label: string, badge?: number) => (
    <button
      onClick={() => setTab(key)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
        tab === key
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 1 && (
        <span className="ml-1 text-xs text-slate-400">({badge})</span>
      )}
    </button>
  );

  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b border-slate-200">
        {tabBtn("content", "말씀 내용 보기")}
        {tabBtn("pdf", "PDF 원문 보기", pdfs.length)}
      </div>

      {/* 말씀 내용 */}
      {tab === "content" && (
        <div className="mt-4">
          {hasContent ? (
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-[15px] text-slate-800 prose-keep">
              {contentText}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              본문 텍스트가 없습니다.
              {hasPdf && " PDF 원문 보기 탭에서 원문을 확인하세요."}
              <br />
              <span className="text-xs text-slate-400">
                (hwp·스캔 PDF 등은 본문 텍스트가 자동 추출되지 않을 수 있습니다)
              </span>
            </div>
          )}
        </div>
      )}

      {/* PDF 원문 */}
      {tab === "pdf" && (
        <div className="mt-4">
          {hasPdf ? (
            <>
              {pdfs.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pdfs.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePdf(p.id)}
                      className={`max-w-[16rem] truncate rounded-lg border px-2.5 py-1 text-xs transition ${
                        activePdf === p.id
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                      title={p.originalName}
                    >
                      {p.originalName}
                    </button>
                  ))}
                </div>
              )}
              <iframe
                src={`/api/files/${activePdf}`}
                className="h-[80vh] w-full rounded-lg border border-slate-200 bg-slate-100"
                title="PDF 원문"
              />
              <div className="mt-2 text-right">
                <a
                  href={`/api/files/${activePdf}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand-600 hover:underline"
                >
                  새 창에서 열기 ↗
                </a>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              첨부된 PDF 원문이 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
