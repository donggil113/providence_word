"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR";
  active: boolean;
}

export default function UserManager({
  initialUsers,
  myId,
}: {
  initialUsers: ManagedUser[];
  myId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EDITOR">("EDITOR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((u) => [...u, data.user]);
      setEmail(""); setName(""); setPassword(""); setRole("EDITOR");
    } else {
      setError(data.error || "계정 생성에 실패했습니다.");
    }
  }

  async function removeUser(id: string) {
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((u) => u.filter((x) => x.id !== id));
    } else {
      alert(data.error || "삭제에 실패했습니다.");
    }
  }

  async function resetPassword(id: string) {
    const pw = prompt("새 비밀번호를 입력하세요 (8자 이상)");
    if (!pw) return;
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) alert("비밀번호가 변경되었습니다.");
    else alert(data.error || "변경에 실패했습니다.");
  }

  async function toggleActive(u: ManagedUser) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((list) => list.map((x) => (x.id === u.id ? data.user : x)));
    } else {
      alert(data.error || "변경에 실패했습니다.");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

  return (
    <div className="space-y-6">
      {/* 계정 목록 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">
                {u.name}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    u.role === "ADMIN"
                      ? "bg-brand-100 text-brand-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {u.role === "ADMIN" ? "관리자" : "편집자"}
                </span>
                {!u.active && (
                  <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    비활성
                  </span>
                )}
              </p>
              <p className="text-sm text-slate-500 truncate">{u.email}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => resetPassword(u.id)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                비번변경
              </button>
              {u.id !== myId && (
                <>
                  <button
                    onClick={() => toggleActive(u)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {u.active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    onClick={() => removeUser(u.id)}
                    className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 새 계정 만들기 */}
      <form
        onSubmit={createUser}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 className="font-semibold text-slate-800">새 계정 만들기</h2>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            required
            className={inputCls}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            required
            className={inputCls}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (8자 이상)"
            required
            minLength={8}
            className={inputCls}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "ADMIN" | "EDITOR")}
            className={inputCls}
          >
            <option value="EDITOR">편집자 (말씀 등록/수정)</option>
            <option value="ADMIN">관리자 (계정 관리 포함)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
        >
          {busy ? "생성 중…" : "계정 생성"}
        </button>
      </form>
    </div>
  );
}
