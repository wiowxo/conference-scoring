"use client";
import { useState } from "react";
import Link from "next/link";

type ConferenceItem = {
  id: number;
  name: string;
  date: Date | string;
  status: string;
  resultsPublished: boolean;
  _count: { halls: number; criteria: number };
};

function statusLabel(status: string) {
  return status === "ACTIVE" ? "Активна" : "Завершена";
}

export default function ConferenceList({
  initialConferences,
}: {
  initialConferences: ConferenceItem[];
}) {
  const [conferences, setConferences] = useState(initialConferences);
  const [errMsg, setErrMsg] = useState("");

  async function deleteConference(id: number) {
    if (!confirm("Удалить эту конференцию вместе со всеми данными?")) return;
    const res = await fetch(`/api/conferences/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConferences((prev) => prev.filter((c) => c.id !== id));
      setErrMsg("");
    } else {
      const d = await res.json().catch(() => ({}));
      setErrMsg(d.error || "Ошибка при удалении конференции");
    }
  }

  if (conferences.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        Конференций пока нет. Создайте первую.
      </div>
    );
  }

  return (
    <>
      {errMsg && (
        <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
          {errMsg}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {conferences.map((conf) => (
          <div
            key={conf.id}
            className="relative bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow overflow-hidden max-w-full"
          >
            <Link href={`/organizer/conferences/${conf.id}`} className="block pr-6">
              <div className="flex items-start justify-between gap-2 overflow-hidden">
                <h2 className="font-semibold text-gray-800 text-lg leading-tight line-clamp-2 [overflow-wrap:anywhere] min-w-0">
                  {conf.name}
                </h2>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                    conf.status === "ACTIVE"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {statusLabel(conf.status)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(conf.date).toLocaleDateString("ru-RU")}
              </p>
              <div className="mt-3 flex gap-4 text-sm text-gray-500">
                <span>{conf._count.halls} залов</span>
                <span>{conf._count.criteria} критериев</span>
              </div>
              {conf.resultsPublished && (
                <span className="mt-2 inline-block text-xs text-blue-600 font-medium">
                  Результаты опубликованы
                </span>
              )}
            </Link>
            <button
              onClick={() => deleteConference(conf.id)}
              title="Удалить конференцию"
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 text-xl font-bold leading-none transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
