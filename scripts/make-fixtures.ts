/**
 * 테스트용 샘플 PDF 생성 (개발/검증 전용).
 *   - 텍스트 레이어가 있는 PDF 몇 개 (본문 추출 경로 테스트)
 *   - 텍스트가 없는(스캔 흉내) PDF 1개 (OCR/처리불가 경로 테스트)
 *
 * pdf-parse(구버전 pdf.js) 호환을 위해 압축 없는 고전적 PDF를 직접 생성한다.
 * (실제 운영에서는 사용하지 않으며, 파이프라인 검증 용도다.)
 *
 * 실행: npx tsx scripts/make-fixtures.ts <출력폴더>
 */
import { promises as fs } from "fs";
import path from "path";

// 압축 없는 단순 PDF를 바이트 오프셋을 직접 계산해 생성한다.
function buildPdf(contentStream: string, withFont: boolean): Buffer {
  const objects: string[] = [];
  objects.push(`<</Type/Catalog/Pages 2 0 R>>`);
  objects.push(`<</Type/Pages/Kids[3 0 R]/Count 1>>`);
  const resources = withFont
    ? `/Resources<</Font<</F1 5 0 R>>>>`
    : `/Resources<<>>`;
  objects.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R${resources}>>`);
  objects.push(`<</Length ${Buffer.byteLength(contentStream, "utf-8")}>>\nstream\n${contentStream}\nendstream`);
  if (withFont) {
    objects.push(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`);
  }

  let pdf = `%PDF-1.4\n`;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf-8");
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${count}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textPdf(text: string): Buffer {
  const lines = text.split("\n");
  let content = `BT /F1 12 Tf 50 800 Td 16 TL\n`;
  lines.forEach((line, i) => {
    content += `(${escapePdf(line)}) Tj`;
    content += i < lines.length - 1 ? " T*\n" : "\n";
  });
  content += `ET`;
  return buildPdf(content, true);
}

function imageOnlyPdf(): Buffer {
  // 텍스트 연산자 없이 채워진 사각형만 → 추출 텍스트가 비어 스캔본처럼 동작
  const content = `0.85 0.85 0.85 rg\n80 600 400 120 re f\n0.9 0.9 0.9 rg\n80 400 300 80 re f`;
  return buildPdf(content, false);
}

async function main() {
  const outDir = process.argv[2] || "fixtures-pdfs";
  await fs.mkdir(outDir, { recursive: true });

  const body =
    "Providence Word Archive sample sermon.\n" +
    "Scripture John 3:16  Preacher Rev. Hong Gil-dong.\n" +
    "This body text verifies that PDF text extraction works.\n" +
    "It has enough characters to count as a real document.";

  const files: { name: string; bytes: Buffer }[] = [
    // 분류/날짜가 서로 다른 텍스트 PDF (AI/규칙 분류 검증용)
    { name: "1995-03-05_주일말씀_생명의빛.pdf", bytes: textPdf("Date 1995-03-05\n" + body) },
    { name: "2003-11-12_수요말씀_기도의능력.pdf", bytes: textPdf("Date 2003-11-12\n" + body) },
    { name: "2010-01-01_신년특별예배_새해의소망.pdf", bytes: textPdf("Date 2010-01-01\n" + body) },
    { name: "2015-07-20_여름성령집회_성령의불.pdf", bytes: textPdf("Date 2015-07-20\n" + body) },
    { name: "2018-06-10_청년부_믿음으로.pdf", bytes: textPdf("Date 2018-06-10\n" + body) },
    // 텍스트 없는 스캔 흉내 (OCR/처리불가 경로용) — 정렬상 마지막에 오도록 zz_ 접두
    { name: "zz_2001_새벽말씀_scanned.pdf", bytes: imageOnlyPdf() },
  ];

  for (const f of files) {
    await fs.writeFile(path.join(outDir, f.name), f.bytes);
    console.log("작성:", path.join(outDir, f.name), `(${f.bytes.length}B)`);
  }
  console.log(`\n총 ${files.length}개 생성 → ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
