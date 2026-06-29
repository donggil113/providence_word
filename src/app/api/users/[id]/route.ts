import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { handleError } from "../../sermons/route";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
});

// 계정 수정 (관리자) — 이름/비밀번호/권한/활성여부
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.password) {
      data.passwordHash = await hashPassword(parsed.data.password);
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return handleError(e);
  }
}

// 계정 삭제 (관리자) — 마지막 관리자는 삭제 불가
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const me = await requireAdmin();
    if (me.id === params.id) {
      return NextResponse.json(
        { error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) {
      return NextResponse.json({ ok: true });
    }
    if (target.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "마지막 관리자 계정은 삭제할 수 없습니다." },
          { status: 400 }
        );
      }
    }
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
