import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect(searchParams.next || "/admin");

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold text-slate-900 text-center">관리자 로그인</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        말씀 등록·관리를 위해 로그인하세요.
      </p>
      <div className="mt-6">
        <LoginForm next={searchParams.next} />
      </div>
    </div>
  );
}
