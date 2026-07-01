import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildWhere, SermonQuery } from "@/lib/sermons";
import { handleError } from "../route";

export const runtime = "nodejs";

const schema = z.object({
  categoryCode: z.string().trim().min(1, "이동할 분류를 선택하세요."),
  // 둘 중 하나: 선택한 id 목록, 또는 현재 필터(전체 이동)
  ids: z.array(z.string()).optional(),
  filter: z
    .object({
      q: z.string().optional(),
      category: z.string().optional(),
      department: z.string().optional(),
      year: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      needsReview: z.string().optional(),
    })
    .optional(),
  // 검토필요 표시 처리: 기본은 해제(false)
  clearReview: z.boolean().optional(),
});

// 여러 말씀의 분류를 한꺼번에 변경 (일괄 재분류)
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { categoryCode, ids, filter } = parsed.data;

    const cat = await prisma.category.findUnique({ where: { code: categoryCode } });
    if (!cat) {
      return NextResponse.json({ error: `존재하지 않는 분류입니다: ${categoryCode}` }, { status: 400 });
    }

    let where;
    if (ids && ids.length > 0) {
      where = { id: { in: ids } };
    } else if (filter) {
      where = buildWhere(filter as SermonQuery);
    } else {
      return NextResponse.json({ error: "대상이 없습니다(선택 또는 필터 필요)." }, { status: 400 });
    }

    const clearReview = parsed.data.clearReview !== false; // 기본 true
    const result = await prisma.sermon.updateMany({
      where,
      data: clearReview ? { categoryId: cat.id, needsReview: false } : { categoryId: cat.id },
    });

    return NextResponse.json({ ok: true, count: result.count, category: { code: cat.code, label: cat.label } });
  } catch (e) {
    return handleError(e);
  }
}
