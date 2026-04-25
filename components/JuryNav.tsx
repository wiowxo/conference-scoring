"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function JuryNav({ name }: { name: string }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const nameRef = useRef<HTMLSpanElement>(null);

  // Measure after mount only (client-side) to avoid SSR hydration mismatch
  useEffect(() => {
    const el = nameRef.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14 gap-3">
        <span className="font-bold text-blue-600 text-lg flex-shrink-0">Конференции РГСУ</span>
        <div className="flex items-center gap-1 min-w-0">
          <span
            ref={nameRef}
            className={`text-sm text-gray-600 ${
              isExpanded ? "break-all" : "truncate max-w-[160px]"
            }`}
          >
            {name}
          </span>
          {isTruncated && (
            <button
              onClick={() => setIsExpanded((v) => !v)}
              aria-label={isExpanded ? "Свернуть" : "Показать полностью"}
              className="flex-shrink-0 flex items-center justify-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              {isExpanded ? "▲" : "▼"}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-800 underline ml-1"
          >
            Выйти
          </button>
        </div>
      </div>
    </nav>
  );
}
