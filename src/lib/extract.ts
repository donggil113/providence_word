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

// 문서 확장자(머리말/꼬리말에 섞여 들어오는 원본 파일명 판별용)
const DOC_EXT = "(?:hwpx?|pdf|docx?|pptx?|xlsx?)";

/**
 * 본문 텍스트에서 원본 파일의 머리말/꼬리말 잔재를 걸러낸다. (보수적)
 * 대상(HWP/워드 등을 PDF로 만들 때 페이지마다 반복되는 것):
 *   - "[페이지번호][파일명].hwp - N -"  같은  파일명+페이지표시 결합형
 *   - " - N - "  단독 페이지 표시
 *   - "12세 축복식.hwp" 처럼 날짜/번호가 붙은 파일명만 있는 줄
 *   - "-----" 류 구분선 줄
 * 실제 설교 문장은 확장자(.hwp 등)나 " - N - " 페이지표시를 포함하지 않으므로
 * 위 특징(파일 확장자 + 페이지표시 + 앞자리 숫자런)을 앵커로 삼아 오삭제를 방지한다.
 */
export function cleanBodyText(input: string): string {
  if (!input) return input;
  let text = input.replace(/\r\n/g, "\n");

  // (a) 결합형: [옵션 페이지번호][날짜/숫자런][파일명].(확장자) - N -
  //     숫자런(\d{4,})에서 매치를 시작하므로 앞의 한글/실제 문장은 지워지지 않는다.
  const combined = new RegExp(
    String.raw`(?:\d{1,3}\s+)?\d{4,}[^\n]{0,150}?\.` +
      DOC_EXT +
      String.raw`\s*[\-–—]\s*\d{1,4}\s*[\-–—]`,
    "gi"
  );
  text = text.replace(combined, " ");

  // (b) 단독 페이지 표시 " - N - " (앞뒤가 공백/문두문미일 때만)
  text = text.replace(
    /(^|\s)[\-–—]\s?\d{1,4}\s?[\-–—](?=\s|$)/g,
    "$1"
  );

  // (c) 줄 단위: 파일명만 있는 줄 / 구분선 줄 제거
  const fileOnlyLine = new RegExp(
    String.raw`^(?:\d{1,3}\s+)?\d{4,}[^\n]{0,150}?\.` + DOC_EXT + String.raw`\s*$`,
    "i"
  );
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (fileOnlyLine.test(t)) return false; // 날짜 붙은 파일명만 있는 줄
      if (/^[\s\-–—_=~·•]{3,}$/.test(t)) return false; // 구분선
      return true;
    })
    .join("\n");

  // (d) 공백/빈 줄 정리
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
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
  // 머리말/꼬리말·파일명·페이지표시 잔재 제거
  text = cleanBodyText(text);
  // 과도한 공백 정리 + 검색 인덱스 비대화 방지를 위한 길이 제한
  text = text.replace(/[ \t]+/g, " ").trim();
  const MAX = 500_000; // 약 50만자
  return text.length > MAX ? text.slice(0, MAX) : text;
}
