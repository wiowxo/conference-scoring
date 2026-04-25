"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket-client";
import ResultsTable from "./ResultsTable";

type Conference = { id: number; name: string; date: Date | string; status: string };

interface CriterionScore {
  criterionId: number;
  criterionName: string;
  average: number | null;
  count: number;
}

interface PresenterResult {
  presenterId: number;
  name: string;
  topic: string;
  position?: string | null;
  supervisor?: string | null;
  order: number;
  criteriaScores: CriterionScore[];
  totalAverage: number | null;
}

interface SectionResult {
  sectionId: number;
  sectionName: string;
  hall: string;
  presenters: PresenterResult[];
}

interface ResultsData {
  conference: Conference;
  criteria: { id: number; name: string; minScore: number; maxScore: number }[];
  results: SectionResult[];
}

type ErrorKind = "not_published" | "not_found" | "error" | null;

export default function PublicResultsClient({
  conferences,
  selectedConferenceId,
}: {
  conferences: Conference[];
  selectedConferenceId?: number;
}) {
  const router = useRouter();
  const [conferenceId, setConferenceId] = useState(selectedConferenceId);
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  async function fetchResults(id: number) {
    setLoading(true);
    setErrorKind(null);
    setData(null);
    try {
      const res = await fetch(`/api/results?conferenceId=${id}`);
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 403) {
        setErrorKind("not_published");
      } else if (res.status === 404) {
        setErrorKind("not_found");
      } else {
        setErrorKind("error");
      }
    } catch {
      setErrorKind("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (conferenceId) fetchResults(conferenceId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join-results");
    if (conferenceId) socket.emit("join-conference", conferenceId);

    const onResultsPublished = ({ conferenceId: id }: { conferenceId: number }) => {
      if (id === conferenceId) fetchResults(id);
    };
    const onScoreUpdate = () => {
      if (conferenceId) fetchResults(conferenceId);
    };
    const onStructuralChange = ({ conferenceId: id }: { conferenceId: number }) => {
      if (id === conferenceId) fetchResults(id);
    };
    const onReconnect = () => {
      if (conferenceId) {
        socket.emit("join-conference", conferenceId);
        fetchResults(conferenceId);
      }
    };

    socket.on("results-published", onResultsPublished);
    socket.on("score-update", onScoreUpdate);
    socket.on("presenter:created", onStructuralChange);
    socket.on("presenter:updated", onStructuralChange);
    socket.on("presenter:deleted", onStructuralChange);
    socket.on("section:updated", onStructuralChange);
    socket.on("section:deleted", onStructuralChange);
    socket.on("criterion:created", onStructuralChange);
    socket.on("criterion:updated", onStructuralChange);
    socket.on("criterion:deleted", onStructuralChange);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("results-published", onResultsPublished);
      socket.off("score-update", onScoreUpdate);
      socket.off("presenter:created", onStructuralChange);
      socket.off("presenter:updated", onStructuralChange);
      socket.off("presenter:deleted", onStructuralChange);
      socket.off("section:updated", onStructuralChange);
      socket.off("section:deleted", onStructuralChange);
      socket.off("criterion:created", onStructuralChange);
      socket.off("criterion:updated", onStructuralChange);
      socket.off("criterion:deleted", onStructuralChange);
      socket.off("connect", onReconnect);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  function handleConferenceChange(id: number) {
    setConferenceId(id);
    router.push(`/public-results?conferenceId=${id}`);
  }

  return (
    <div>
      {conferences.length > 1 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {conferences.map((c) => (
            <button
              key={c.id}
              onClick={() => handleConferenceChange(c.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors [overflow-wrap:anywhere] text-left ${
                conferenceId === c.id
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
              title={c.name}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-gray-400">Загрузка результатов…</div>
      )}

      {!loading && errorKind === "not_published" && (
        <div className="text-center py-16 text-gray-400">
          Результаты ещё не опубликованы
        </div>
      )}

      {!loading && errorKind === "not_found" && (
        <div className="text-center py-16 text-gray-400">
          Конференция не найдена
        </div>
      )}

      {!loading && errorKind === "error" && (
        <div className="text-center py-16 text-red-400">
          Ошибка загрузки результатов. Попробуйте обновить страницу.
        </div>
      )}

      {!loading && !errorKind && !data && conferenceId && (
        <div className="text-center py-16 text-gray-300">Нет данных</div>
      )}

      {!loading && !errorKind && data && <ResultsTable data={data} />}
    </div>
  );
}
