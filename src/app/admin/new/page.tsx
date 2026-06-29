import type { Metadata } from "next";
import SermonForm from "@/components/SermonForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "새 말씀 등록" };

export default function NewSermonPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-4">새 말씀 등록</h1>
      <SermonForm />
    </div>
  );
}
