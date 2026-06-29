import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    email = String(body.email || "");
    password = String(body.password || "");
  } else {
    const form = await req.formData();
    email = String(form.get("email") || "");
    password = String(form.get("password") || "");
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력하세요." },
      { status: 400 }
    );
  }

  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  await createSession(user);
  return NextResponse.json({ ok: true, user });
}
