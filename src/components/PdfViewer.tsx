"use client";

import { useEffect, useRef, useState } from "react";

/**
 * pdfjs-dist(PDF.js)로 PDF를 canvas 에 렌더링하는 뷰어.
 * 브라우저 내장 PDF 뷰어(iframe)에 의존하지 않으므로 모바일(iOS Safari/
 * Android Chrome)에서도 페이지 안에서 스크롤로 열람할 수 있다.
 */
export default function PdfViewer({
  url,
  downloadUrl,
  fileName,
}: {
  url: string;
  downloadUrl: string;
  fileName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "rendering" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const [rendered, setRendered] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = 0;

    async function renderAllPages() {
      const container = containerRef.current;
      if (!container || !pdfDoc) return;
      const width = Math.max(280, Math.floor(container.clientWidth || 800));
      lastWidth = width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      container.innerHTML = "";
      setStatus("rendering");
      setRendered(0);

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.className = "mb-2 block w-full rounded bg-white shadow-sm";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        container.appendChild(canvas);

        await page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
        if (cancelled) return;
        setRendered(i);
      }
      if (!cancelled) setStatus("ready");
    }

    async function load() {
      setStatus("loading");
      setError("");
      try {
        // 구형 Safari(iOS 16 등) 대응: Promise.withResolvers 폴리필
        if (typeof (Promise as any).withResolvers === "undefined") {
          (Promise as any).withResolvers = function () {
            let resolve: any, reject: any;
            const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
            return { promise, resolve, reject };
          };
        }
        // @ts-ignore - 서브패스에는 번들 타입이 없어 any 로 사용
        const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const task = pdfjs.getDocument({ url, disableAutoFetch: false });
        pdfDoc = await task.promise;
        if (cancelled) return;
        setNumPages(pdfDoc.numPages);
        await renderAllPages();
      } catch (e: any) {
        if (!cancelled) {
          console.error("PDF 렌더링 실패:", e);
          setError(e?.message || "PDF를 불러오지 못했습니다.");
          setStatus("error");
        }
      }
    }

    load();

    // 화면 회전/크기 변경 시 다시 렌더(디바운스, 폭 변화가 클 때만)
    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = containerRef.current?.clientWidth || 0;
        if (pdfDoc && Math.abs(w - lastWidth) > 40) renderAllPages();
      }, 300);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      try { pdfDoc?.destroy?.(); } catch { /* ignore */ }
    };
  }, [url]);

  return (
    <div>
      {/* 상단 바: 상태 + 다운로드 버튼 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {status === "loading" && "PDF 불러오는 중…"}
          {status === "rendering" && `렌더링 중… ${rendered}/${numPages}쪽`}
          {status === "ready" && `${numPages}쪽`}
          {status === "error" && "표시할 수 없음"}
        </span>
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          download={fileName}
        >
          ⬇ PDF 다운로드
        </a>
      </div>

      {status === "error" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-800">
          이 브라우저에서 PDF를 페이지 안에 표시하지 못했습니다.
          <br />
          <a href={downloadUrl} className="mt-2 inline-block font-medium text-brand-600 underline">
            PDF 다운로드로 열기
          </a>
          {error && <p className="mt-2 text-xs text-amber-600">({error})</p>}
        </div>
      ) : (
        <div className="relative">
          {(status === "loading" || status === "rendering") && (
            <div className="mb-2 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-10 text-sm text-slate-400">
              <span className="animate-pulse">PDF 준비 중…</span>
            </div>
          )}
          {/* 스크롤 가능한 페이지 영역 */}
          <div
            ref={containerRef}
            className="max-h-[80vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-2"
          />
        </div>
      )}
    </div>
  );
}
