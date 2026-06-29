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
    // pdf-parse 는 패키지 루트 import 시 테스트 파일을 읽으려 하므로
    // 내부 모듈을 직접 require 하고, 실패해도 검색 본문 없이 진행한다.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(buf);
    return (data.text || "").trim();
  } catch (e) {
    console.warn("PDF 텍스트 추출 실패(검색 본문 없이 저장합니다):", e);
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
