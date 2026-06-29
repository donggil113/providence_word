import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "섭리 말씀 아카이브";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.providence.word.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "1978년부터 선포된 모든 말씀을 연도별·부서별·행사별로 정리하고, 날짜·기간·키워드로 검색할 수 있는 말씀 아카이브.",
  openGraph: {
    title: SITE_NAME,
    description: "1978년부터의 모든 말씀을 시간 순서로 정리한 아카이브",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c3389",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="ko">
      <body className="min-h-screen flex flex-col">
        <Header user={user} siteName={SITE_NAME} />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} {SITE_NAME}</span>
            <span>1978년부터 오늘까지, 선포된 말씀의 기록</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
