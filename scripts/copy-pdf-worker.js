/**
 * pdfjs-dist 워커 파일을 public/ 로 복사한다.
 * PdfViewer 컴포넌트가 /pdf.worker.min.mjs 로 워커를 로드하므로,
 * 개발/빌드 시 설치된 버전과 동일한 워커를 정적 파일로 제공해야 한다.
 * (dev / build 스크립트에서 호출)
 */
const fs = require("fs");
const path = require("path");

const candidates = [
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "pdfjs-dist/build/pdf.worker.min.mjs",
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
];

function resolveWorker() {
  for (const c of candidates) {
    try {
      return require.resolve(c);
    } catch {
      /* try next */
    }
  }
  return null;
}

const src = resolveWorker();
const destDir = path.join(process.cwd(), "public");
const dest = path.join(destDir, "pdf.worker.min.mjs");

if (!src) {
  console.warn("⚠ pdfjs-dist 워커 파일을 찾지 못했습니다. PDF 뷰어가 동작하지 않을 수 있습니다.");
  process.exit(0); // 빌드를 막지 않는다
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`✓ PDF 워커 복사: ${path.relative(process.cwd(), src)} → public/pdf.worker.min.mjs`);
