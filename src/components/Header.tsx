"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function Header({
  user,
  siteName,
}: {
  user: HeaderUser | null;
  siteName: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-brand-800 text-white shadow">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span aria-hidden className="text-xl">📖</span>
            <span className="hidden sm:inline">{siteName}</span>
            <span className="sm:hidden">말씀 아카이브</span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-3 text-sm">
            <Link
              href="/sermons"
              className="px-2 py-1.5 rounded hover:bg-white/10 transition"
            >
              말씀 검색
            </Link>
            {user ? (
              <>
                <Link
                  href="/admin"
                  className="px-2 py-1.5 rounded hover:bg-white/10 transition"
                >
                  관리
                </Link>
                <span className="hidden sm:inline text-white/70 px-1">
                  {user.name}님
                </span>
                <button
                  onClick={logout}
                  className="px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 transition"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition"
              >
                로그인
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
