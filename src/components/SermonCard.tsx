import Link from "next/link";
import { FileKind } from "@prisma/client";
import CategoryBadge from "./CategoryBadge";
import { FILE_KIND_LABELS } from "@/lib/categories";
import { formatDate } from "@/lib/format";

export interface SermonCardData {
  id: string;
  title: string;
  category: { code: string; label: string; color: string } | null;
  department: string | null;
  eventName: string | null;
  preacher: string | null;
  scripture: string | null;
  summary: string | null;
  preachedAt: Date | string;
  files: { id: string; kind: FileKind }[];
}

export default function SermonCard({ sermon }: { sermon: SermonCardData }) {
  const kinds = Array.from(new Set(sermon.files.map((f) => f.kind)));
  return (
    <Link
      href={`/sermons/${sermon.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-400 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        {sermon.category && <CategoryBadge category={sermon.category} />}
        {sermon.department && (
          <span className="text-xs text-slate-500">· {sermon.department}</span>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {formatDate(sermon.preachedAt)}
        </span>
      </div>

      <h3 className="font-semibold text-slate-900 leading-snug">
        {sermon.title}
      </h3>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-500">
        {sermon.scripture && <span>📜 {sermon.scripture}</span>}
        {sermon.preacher && <span>🎙 {sermon.preacher}</span>}
        {sermon.eventName && <span>🏷 {sermon.eventName}</span>}
      </div>

      {sermon.summary && (
        <p className="mt-2 text-sm text-slate-600 line-clamp-2">{sermon.summary}</p>
      )}

      {kinds.length > 0 && (
        <div className="mt-2.5 flex gap-1.5">
          {kinds.map((k) => (
            <span
              key={k}
              className="text-[11px] font-medium rounded border border-slate-200 px-1.5 py-0.5 text-slate-500"
            >
              {FILE_KIND_LABELS[k]}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
