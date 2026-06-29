import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { updateSermon, deleteSermon } from "@/lib/sermon-write";
import { handleError } from "../route";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sermon = await prisma.sermon.findUnique({
    where: { id: params.id },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  if (!sermon) {
    return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(sermon);
}

// 수정 (로그인 필요). 멀티파트 폼으로 메타데이터 + 파일 추가/삭제.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const form = await req.formData();
    const sermon = await updateSermon(params.id, form);
    return NextResponse.json({ ok: true, sermon });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    await deleteSermon(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
