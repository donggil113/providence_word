import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { normalizeCode, PALETTE_NAMES } from "@/lib/categories";
import { handleError } from "../sermons/route";

export const runtime = "nodejs";

// 분류 목록 (공개 — 필터/폼에서 사용)
export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true, code: true, label: true, color: true, sortOrder: true, isBuiltin: true,
      _count: { select: { sermons: true } },
    },
  });
  return NextResponse.json(
    categories.map((c) => ({
      id: c.id, code: c.code, label: c.label, color: c.color,
      sortOrder: c.sortOrder, isBuiltin: c.isBuiltin, count: c._count.sermons,
    }))
  );
}

const createSchema = z.object({
  label: z.string().trim().min(1, "분류명을 입력하세요.").max(50),
  code: z.string().trim().max(40).optional(),
  color: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
});

// 분류 생성 (관리자)
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { label } = parsed.data;
    let code = normalizeCode(parsed.data.code || label);
    if (!code) code = "CAT_" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const color = PALETTE_NAMES.includes(parsed.data.color || "") ? parsed.data.color! : "slate";

    const exists = await prisma.category.findUnique({ where: { code } });
    if (exists) {
      return NextResponse.json({ error: `이미 사용 중인 코드입니다: ${code}` }, { status: 409 });
    }

    // 정렬 순서: 지정 없으면 맨 뒤
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
      sortOrder = (max._max.sortOrder ?? 0) + 10;
    }

    const category = await prisma.category.create({
      data: { code, label, color, sortOrder, isBuiltin: false },
    });
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
