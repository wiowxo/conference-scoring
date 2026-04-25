"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForceChangePasswordForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (newPassword.length < 6) {
      setErrorMsg("Новый пароль должен содержать минимум 6 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Пароли не совпадают");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/organizer/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push("/organizer/dashboard");
      } else {
        setErrorMsg(data.error || "Ошибка при смене пароля");
      }
    } catch {
      setErrorMsg("Ошибка сети. Попробуйте снова.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {errorMsg && (
        <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Новый пароль
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Минимум 6 символов</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Подтвердить новый пароль
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 mt-2"
        >
          {saving ? "Сохранение…" : "Установить пароль"}
        </button>
      </form>
    </div>
  );
}
