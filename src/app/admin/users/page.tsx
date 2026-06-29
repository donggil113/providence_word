import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import UserManager, { ManagedUser } from "@/components/UserManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "계정 관리" };

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin/users");
  if (me.role !== "ADMIN") redirect("/admin");

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

  const initial: ManagedUser[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-1">계정 관리</h1>
      <p className="text-sm text-slate-500 mb-4">
        말씀을 등록·관리할 수 있는 계정을 만들고 관리합니다. (관리자 전용)
      </p>
      <UserManager initialUsers={initial} myId={me.id} />
    </div>
  );
}
