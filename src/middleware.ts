import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// /admin 이하 페이지는 로그인된 사용자만 접근 가능.
// (세부 권한 검사는 각 API/페이지에서 추가로 수행)
const COOKIE_NAME = "pw_session";

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!(await isAuthenticated(req))) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
