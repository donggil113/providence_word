"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push(next || "/admin");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "로그인에 실패했습니다.");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
    >
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      <div>
        <label className="text-sm text-slate-600">이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          className={`mt-1 ${inputCls}`}
        />
      </div>
      <div>
        <label className="text-sm text-slate-600">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={`mt-1 ${inputCls}`}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
      >
        {busy ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
