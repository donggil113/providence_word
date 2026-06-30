import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import CategoryBadge from "@/components/CategoryBadge";
import DeleteSermonButton from "@/components/DeleteSermonButton";
import SermonTabs from "@/components/SermonTabs";
import { FILE_KIND_LABELS } from "@/lib/categories";
import { formatDate, formatBytes } from "@/lib/format";

export const dynamic = "force-dynamic";

async function getSermon(id: string) {
  try {
    return await prisma.sermon.findUnique({
      where: { id },
      include: {
        files: { orderBy: { createdAt: "asc" } },
        creator: { select: { name: true } },
        category: { select: { code: true, label: true, color: true } },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const sermon = await getSermon(params.id);
  return { title: sermon?.title || "말씀" };
}

export default async function SermonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const sermon = await getSermon(params.id);
  if (!sermon) notFound();

  const user = await getCurrentUser();

  const meta: { label: string; value: string | null }[] = [
    { label: "선포일", value: formatDate(sermon.preachedAt) },
    { label: "성경 본문", value: sermon.scripture },
    { label: "설교자", value: sermon.preacher },
    { label: "부서", value: sermon.department },
    { label: "행사", value: sermon.eventName },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/sermons" className="text-sm text-brand-600 hover:underline">
        ← 목록으로
      </Link>

      <article className="mt-3 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex items-center gap-2 flex-wrap">
          {sermon.category && <CategoryBadge category={sermon.category} />}
          <span className="text-sm text-slate-400 ml-auto">
            {formatDate(sermon.preachedAt)}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-slate-900 leading-snug">
          {sermon.title}
        </h1>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {meta
            .filter((m) => m.value)
            .map((m) => (
              <div key={m.label} className="flex gap-2">
                <dt className="text-slate-400 shrink-0 w-16">{m.label}</dt>
                <dd className="text-slate-800 font-medium">{m.value}</dd>
              </div>
            ))}
        </dl>

        {sermon.summary && (
          <div className="mt-5 rounded-lg bg-slate-50 p-4 text-slate-700 text-sm prose-keep">
            {sermon.summary}
          </div>
        )}

        {/* 첨부 파일 */}
        {sermon.files.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">첨부 파일</h2>
            <ul className="space-y-2">
              {sermon.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {FILE_KIND_LABELS[f.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{f.originalName}</p>
                    <p className="text-xs text-slate-400">{formatBytes(f.size)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-brand-600 hover:underline"
                    >
                      보기
                    </a>
                    <a
                      href={`/api/files/${f.id}?download=1`}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      다운로드
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 말씀 내용 보기 / PDF 원문 보기 탭 */}
        <SermonTabs
          contentText={sermon.contentText}
          pdfs={sermon.files
            .filter((f) => f.kind === "PDF")
            .map((f) => ({ id: f.id, originalName: f.originalName }))}
        />

        {/* 관리자/편집자 액션 */}
        {user && (
          <div className="mt-7 flex gap-2 border-t border-slate-100 pt-4">
            <Link
              href={`/admin/sermons/${sermon.id}/edit`}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              수정
            </Link>
            <DeleteSermonButton id={sermon.id} redirectTo="/sermons" />
          </div>
        )}
      </article>
    </div>
  );
}
