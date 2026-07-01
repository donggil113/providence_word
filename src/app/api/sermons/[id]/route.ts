import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

// 인라인 부분 수정 (JSON). 관리 화면에서 제목/날짜/성경본문/설교자/분류를 빠르게 고칠 때.
// 수정하면 needsReview(검토필요) 표시를 해제한다.
const patchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  preachedAt: z.string().refine((v) => !isNaN(new Date(v).getTime()), "올바른 날짜가 아닙니다.").optional(),
  scripture: z.string().trim().max(300).optional().nullable(),
  preacher: z.string().trim().max(200).optional().nullable(),
  department: z.string().trim().max(200).optional().nullable(),
  eventName: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().min(1).optional(), // 분류 코드
  needsReview: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const p = parsed.data;
    const data: Record<string, unknown> = {};

    if (p.title !== undefined) data.title = p.title;
    if (p.scripture !== undefined) data.scripture = p.scripture || null;
    if (p.preacher !== undefined) data.preacher = p.preacher || null;
    if (p.department !== undefined) data.department = p.department || null;
    if (p.eventName !== undefined) data.eventName = p.eventName || null;
    if (p.preachedAt !== undefined) {
      const d = new Date(p.preachedAt);
      data.preachedAt = d;
      data.year = d.getFullYear();
    }
    if (p.category !== undefined) {
      const cat = await prisma.category.findUnique({ where: { code: p.category } });
      if (!cat) {
        return NextResponse.json({ error: `존재하지 않는 분류입니다: ${p.category}` }, { status: 400 });
      }
      data.categoryId = cat.id;
    }
    // 명시적으로 needsReview 를 지정하지 않았고 실질적 수정이 있으면 검토필요 해제
    if (p.needsReview !== undefined) data.needsReview = p.needsReview;
    else if (Object.keys(data).length > 0) data.needsReview = false;

    const sermon = await prisma.sermon.update({
      where: { id: params.id },
      data,
      include: { category: { select: { code: true, label: true, color: true } } },
    });
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
