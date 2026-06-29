import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { searchSermons, SermonQuery } from "@/lib/sermons";
import { createSermon, ValidationError } from "@/lib/sermon-write";

export const runtime = "nodejs";

// 말씀 검색/목록 (공개)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query: SermonQuery = {
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    department: sp.get("department") ?? undefined,
    year: sp.get("year") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    page: sp.get("page") ?? undefined,
    perPage: sp.get("perPage") ?? undefined,
    sort: sp.get("sort") ?? undefined,
  };
  const result = await searchSermons(query);
  return NextResponse.json(result);
}

// 말씀 등록 (로그인 필요)
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const sermon = await createSermon(form, user.id);
    return NextResponse.json({ ok: true, sermon }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

export function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json(
    { error: "처리 중 오류가 발생했습니다." },
    { status: 500 }
  );
}
