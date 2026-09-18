import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import SermonForm, { SermonInitial } from "@/components/SermonForm";
import { listCategories } from "@/lib/category-store";
import { toInputDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "말씀 수정" };

export default async function EditSermonPage({
  params,
}: {
  params: { id: string };
}) {
  const [sermon, categories] = await Promise.all([
    prisma.sermon.findUnique({
      where: { id: params.id },
      include: {
        files: { orderBy: { createdAt: "asc" } },
        category: { select: { code: true } },
      },
    }),
    listCategories(),
  ]);
  if (!sermon) notFound();

  // 아주 긴 본문은 브라우저 편집기에 싣지 않는다(느려짐 방지). 이 경우 저장해도 본문은 유지된다.
  const EDITABLE_BODY_LIMIT = 50_000;
  const body = sermon.contentText || "";
  const contentTooLong = body.length > EDITABLE_BODY_LIMIT;

  const initial: SermonInitial = {
    contentText: contentTooLong ? "" : body,
    contentTooLong,
    id: sermon.id,
    title: sermon.title,
    category: sermon.category?.code,
    department: sermon.department,
    eventName: sermon.eventName,
    preacher: sermon.preacher,
    scripture: sermon.scripture,
    summary: sermon.summary,
    preachedAt: toInputDate(sermon.preachedAt),
    files: sermon.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      kind: f.kind,
      size: f.size,
    })),
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-4">말씀 수정</h1>
      <SermonForm initial={initial} categories={categories} />
    </div>
  );
}
