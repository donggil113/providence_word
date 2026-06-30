import iconv from "iconv-lite";
import { FileKind } from "@prisma/client";

// 한글 텍스트 파일은 UTF-8 또는 EUC-KR(CP949)로 저장된 경우가 많다.
// UTF-8 로 디코딩했을 때 깨짐(U+FFFD)이 많으면 EUC-KR 로 다시 디코딩한다.
function decodeText(buf: Buffer): string {
  const utf8 = buf.toString("utf-8");
  const replacementCount = (utf8.match(/�/g) || []).length;
  // 깨진 문자가 일정 비율 이상이면 EUC-KR 로 간주
  if (replacementCount > 0 && replacementCount / Math.max(utf8.length, 1) > 0.005) {
    try {
      return iconv.decode(buf, "euc-kr");
    } catch {
      return utf8;
    }
  }
  return utf8;
}

async function extractPdf(buf: Buffer): Promise<string> {
  try {
    // pdf-parse 가 함께 번들하는 최신 pdf.js(v2.0.550)를 직접 사용한다.
    // pdf-parse 의 기본 엔진(pdf.js v1.10)은 일부 정상 PDF의 xref도
    // 거부하는 버그가 있어, 더 견고한 v2 엔진으로 텍스트 레이어를 읽는다.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableFontFace: true,
      // 콘솔 잡음 억제
      verbosity: 0,
    }).promise;
    const maxPages = Math.min(doc.numPages, 500);
    const parts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      parts.push(tc.items.map((it: any) => it.str).join(" "));
    }
    return parts.join("\n").trim();
  } catch (e) {
    console.warn("PDF 텍스트 추출 실패(검색 본문 없이 저장합니다):", (e as Error).message);
    return "";
  }
}

/**
 * 업로드된 파일에서 검색용 본문 텍스트를 추출한다.
 * - TXT: UTF-8/EUC-KR 자동 판별 후 디코딩
 * - PDF: pdf-parse 로 텍스트 레이어 추출(스캔 PDF 는 결과가 없을 수 있음)
 * - HWP: 신뢰할 수 있는 순수 JS 파서가 없어 자동 추출하지 않음(메타데이터로 검색)
 */
export async function extractContent(
  buf: Buffer,
  kind: FileKind
): Promise<string> {
  let text = "";
  if (kind === "TXT") {
    text = decodeText(buf);
  } else if (kind === "PDF") {
    text = await extractPdf(buf);
  }
  // 과도한 공백 정리 + 검색 인덱스 비대화 방지를 위한 길이 제한
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const MAX = 500_000; // 약 50만자
  return text.length > MAX ? text.slice(0, MAX) : text;
}
