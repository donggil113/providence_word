import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { handleError } from "../sermons/route";

export const runtime = "nodejs";

const createSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요."),
  name: z.string().trim().min(1, "이름을 입력하세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  role: z.nativeEnum(Role).optional(),
});

// 계정 목록 (관리자)
export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
    return NextResponse.json(users);
  } catch (e) {
    return handleError(e);
  }
}

// 계정 생성 (관리자)
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }
    const { email, name, password, role } = parsed.data;

    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: await hashPassword(password),
        role: role ?? Role.EDITOR,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
