import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PALETTE_NAMES } from "@/lib/categories";
import { handleError } from "../../sermons/route";

export const runtime = "nodejs";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  color: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
});

// 분류 수정 (관리자) — 라벨/색/순서. 코드는 변경하지 않는다(데이터 일관성).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) data.label = parsed.data.label;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
    if (parsed.data.color !== undefined) {
      data.color = PALETTE_NAMES.includes(parsed.data.color) ? parsed.data.color : "slate";
    }
    const category = await prisma.category.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    return handleError(e);
  }
}

// 분류 삭제 (관리자) — 기본 분류 불가, 사용 중(말씀 보유) 불가
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const cat = await prisma.category.findUnique({
      where: { id: params.id },
      include: { _count: { select: { sermons: true } } },
    });
    if (!cat) return NextResponse.json({ ok: true });
    if (cat.isBuiltin) {
      return NextResponse.json({ error: "기본 분류는 삭제할 수 없습니다." }, { status: 400 });
    }
    if (cat._count.sermons > 0) {
      return NextResponse.json(
        { error: `이 분류를 사용하는 말씀이 ${cat._count.sermons}편 있어 삭제할 수 없습니다. 먼저 다른 분류로 옮기세요.` },
        { status: 400 }
      );
    }
    await prisma.category.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
