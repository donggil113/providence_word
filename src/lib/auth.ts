import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "pw_session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다. (.env 확인)"
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// 이메일/비밀번호로 사용자를 인증한다. 성공하면 SessionUser 반환, 실패하면 null.
export async function authenticate(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// 세션 JWT 를 만들어 HTTP-only 쿠키에 저장한다.
export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function destroySession(): void {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

// 현재 요청의 세션 사용자(없으면 null)
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

// API 라우트 보호용: 로그인 필요. 없으면 throw.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("로그인이 필요합니다.", 401);
  }
  return user;
}

// 관리자 전용
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AuthError("관리자 권한이 필요합니다.", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
