import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const file = await prisma.sermonFile.findUnique({ where: { id: params.id } });
  if (!file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await readStoredFile(file.storedName);
  } catch {
    return NextResponse.json(
      { error: "파일을 읽을 수 없습니다." },
      { status: 404 }
    );
  }

  // 'download' 쿼리가 있으면 다운로드, 없으면 브라우저에서 보기(가능한 경우)
  const download = req.nextUrl.searchParams.has("download");
  const disposition = download ? "attachment" : "inline";

  // 한글 파일명 대응(RFC 5987)
  const encodedName = encodeURIComponent(file.originalName);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
