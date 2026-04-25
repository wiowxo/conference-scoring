"use client";
import { useState } from "react";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"organizer" | "jury">("jury");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      window.location.href =
        data.role === "organizer" ? "/organizer/dashboard" : "/jury/dashboard";
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          Оценка докладов
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setRole("jury")}
              className={`flex-1 font-medium transition-colors touch-manipulation select-none ${
                role === "jury"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 bg-white hover:bg-gray-50 active:bg-gray-100"
              }`}
              style={{ minHeight: 44 }}
            >
              Член жюри
            </button>
            <button
              type="button"
              onClick={() => setRole("organizer")}
              className={`flex-1 font-medium transition-colors touch-manipulation select-none border-l border-gray-300 ${
                role === "organizer"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 bg-white hover:bg-gray-50 active:bg-gray-100"
              }`}
              style={{ minHeight: 44 }}
            >
              Организатор
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg py-2 transition-colors"
          >
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
