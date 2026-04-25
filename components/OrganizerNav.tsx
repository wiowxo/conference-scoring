"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OrganizerNav({ name }: { name: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-blue-600 text-lg">Конференции РГСУ</span>
          <Link
            href="/organizer/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Конференции
          </Link>
          <Link
            href="/public-results"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Публичные результаты
          </Link>
          <Link
            href="/organizer/settings"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Настройки
          </Link>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm text-gray-500 truncate max-w-[160px]">{name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800 underline"
          >
            Выйти
          </button>
        </div>
      </div>
    </nav>
  );
}
