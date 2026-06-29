"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteSermonButton({
  id,
  redirectTo = "/admin",
  className,
}: {
  id: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("이 말씀을 삭제하시겠습니까? 첨부 파일도 함께 삭제됩니다.")) return;
    setBusy(true);
    const res = await fetch(`/api/sermons/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "삭제에 실패했습니다.");
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className={
        className ||
        "rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
      }
    >
      {busy ? "삭제 중…" : "삭제"}
    </button>
  );
}
