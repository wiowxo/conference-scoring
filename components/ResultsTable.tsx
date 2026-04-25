"use client";
import { useState } from "react";
import * as XLSX from "xlsx";

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
  supervisor?: string | null;
  position?: string | null;
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

interface Criterion {
  id: number;
  name: string;
  minScore: number;
  maxScore: number;
}

interface ResultsData {
  conference: { name: string; date: string | Date };
  criteria: Criterion[];
  results: SectionResult[];
}

function pluralVotes(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} оценка`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} оценки`;
  return `${n} оценок`;
}

function medalIcon(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

// Dense ranking: tied scores share the same rank (1, 1, 3 — not 1, 1, 2).
function assignRanks(presenters: PresenterResult[]): Map<number, number> {
  const sorted = [...presenters]
    .filter((p) => p.totalAverage !== null)
    .sort((a, b) => (b.totalAverage ?? 0) - (a.totalAverage ?? 0));
  const map = new Map<number, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].totalAverage !== sorted[i - 1].totalAverage) {
      rank = i + 1;
    }
    map.set(sorted[i].presenterId, rank);
  }
  return map;
}

interface PresenterCardProps {
  presenter: PresenterResult & { sectionName?: string; hall?: string };
  rank: number | null;
  criteria: Criterion[];
  showSection?: boolean;
}

function PresenterCard({ presenter, rank, criteria, showSection }: PresenterCardProps) {
  const [expanded, setExpanded] = useState(false);

  const highlight =
    rank === 1 ? "bg-yellow-50 border-yellow-200" :
    rank === 2 ? "bg-gray-50 border-gray-200" :
    "bg-white border-gray-100";

  const hasDetails = !!presenter.position || !!presenter.supervisor || criteria.length > 0;

  return (
    <div className={`rounded-lg border p-4 ${highlight}`}>
      {/* Top row: rank + name + score */}
      <div className="flex gap-3 items-start">
        {/* Rank */}
        <div className="flex-shrink-0 w-8 text-center pt-0.5">
          {rank ? (
            <span className="text-xl leading-none text-black">{medalIcon(rank)}</span>
          ) : (
            <span className="text-gray-300 text-lg">—</span>
          )}
        </div>
        {/* Name + topic + section */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{presenter.name}</p>
          <p className="text-sm text-gray-600 mt-0.5 [overflow-wrap:anywhere]">{presenter.topic}</p>
          {showSection && presenter.sectionName && (
            <p className="text-xs text-blue-600 mt-1 [overflow-wrap:anywhere]">
              {presenter.sectionName}
              {presenter.hall && presenter.hall !== "—" && ` · ${presenter.hall}`}
            </p>
          )}
        </div>
        {/* Total score */}
        <div className="flex-shrink-0 text-right pl-2">
          {presenter.totalAverage != null ? (
            <>
              <span className="text-xl font-bold text-gray-800 leading-none">
                {presenter.totalAverage.toFixed(2)}
              </span>
              <p className="text-xs text-gray-400 mt-0.5">итог</p>
            </>
          ) : (
            <span className="text-lg text-gray-300">—</span>
          )}
        </div>
      </div>

      {/* Toggle */}
      {hasDetails && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
        >
          {expanded ? "Скрыть ▲" : "Подробнее ▼"}
        </button>
      )}

      {/* Collapsible details */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          expanded ? "max-h-[800px] mt-3 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {(presenter.position || presenter.supervisor) && (
          <div className="mb-3 space-y-0.5">
            {presenter.position && (
              <p className="text-sm text-gray-500 [overflow-wrap:anywhere]">{presenter.position}</p>
            )}
            {presenter.supervisor && (
              <p className="text-sm text-gray-500 [overflow-wrap:anywhere]">
                Науч. рук.: {presenter.supervisor}
              </p>
            )}
          </div>
        )}
        {criteria.length > 0 && (
          <div className="space-y-1.5 border-t border-gray-100 pt-2">
            {criteria.map((c, i) => {
              const cs = presenter.criteriaScores.find((x) => x.criterionId === c.id);
              return (
                <div key={c.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">
                    <span className="text-gray-400 mr-1">{i + 1}.</span>
                    {c.name}
                  </span>
                  <span className="flex-shrink-0 text-sm font-medium text-gray-700 text-right">
                    {cs?.average != null ? (
                      <>
                        {cs.average.toFixed(2)}
                        {cs.count > 0 && (
                          <span className="text-gray-400 font-normal ml-1 text-xs">
                            ({pluralVotes(cs.count)})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]:]/g, "").substring(0, 31) || "Лист";
}

export default function ResultsTable({ data }: { data: ResultsData }) {
  const { conference, criteria, results } = data;
  const [activeTab, setActiveTab] = useState<"sections" | "overall">("sections");
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);

  // Build overall ranking across all sections
  const allPresenters = results.flatMap((sec) =>
    sec.presenters.map((p) => ({
      ...p,
      sectionName: sec.sectionName,
      hall: sec.hall,
    }))
  );
  const sortedOverall = [...allPresenters]
    .filter((p) => p.totalAverage !== null)
    .sort((a, b) => (b.totalAverage ?? 0) - (a.totalAverage ?? 0));
  const unscoredOverall = allPresenters.filter((p) => p.totalAverage === null);
  const overallList = [...sortedOverall, ...unscoredOverall];

  // Dense rank map for overall list (tied scores share the same rank)
  const overallRankMap = (() => {
    const map = new Map<number, number>();
    let rank = 1;
    for (let i = 0; i < sortedOverall.length; i++) {
      if (i > 0 && sortedOverall[i].totalAverage !== sortedOverall[i - 1].totalAverage) {
        rank = i + 1;
      }
      map.set(sortedOverall[i].presenterId, rank);
    }
    return map;
  })();

  // Clamp activeSectionIdx in case results change
  const safeActiveSectionIdx = Math.min(activeSectionIdx, Math.max(0, results.length - 1));

  function exportToExcel() {
    const wb = XLSX.utils.book_new();
    const confDate = new Date(conference.date).toISOString().slice(0, 10);

    // Per-section sheets
    for (const section of results) {
      const rankings = assignRanks(section.presenters);
      const sorted = [...section.presenters].sort(
        (a, b) => (b.totalAverage ?? -1) - (a.totalAverage ?? -1)
      );
      const rows = sorted.map((p) => {
        const rank = rankings.get(p.presenterId);
        const row: Record<string, string | number> = {
          "Место": rank ?? "—",
          "ФИО": p.name,
          "Должность": p.position ?? "",
          "Науч. рук.": p.supervisor ?? "",
          "Тема доклада": p.topic,
        };
        for (const c of criteria) {
          const cs = p.criteriaScores.find((x) => x.criterionId === c.id);
          row[c.name] = cs?.average != null ? parseFloat(cs.average.toFixed(2)) : "";
        }
        row["Среднее"] = p.totalAverage != null ? parseFloat(p.totalAverage.toFixed(2)) : "";
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(section.sectionName));
    }

    // Overall sheet — includes all criteria columns
    const overallRows = overallList.map((p) => {
      const rank = overallRankMap.get(p.presenterId);
      const row: Record<string, string | number> = {
        "Место": rank ?? "—",
        "ФИО": p.name,
        "Должность": p.position ?? "",
        "Науч. рук.": p.supervisor ?? "",
        "Тема доклада": p.topic,
        "Секция": p.sectionName ?? "",
        "Аудитория": p.hall && p.hall !== "—" ? p.hall : "",
      };
      for (const c of criteria) {
        const cs = p.criteriaScores.find((x) => x.criterionId === c.id);
        row[c.name] = cs?.average != null ? parseFloat(cs.average.toFixed(2)) : "";
      }
      row["Среднее"] = p.totalAverage != null ? parseFloat(p.totalAverage.toFixed(2)) : "";
      return row;
    });
    const wsOverall = XLSX.utils.json_to_sheet(overallRows);
    XLSX.utils.book_append_sheet(wb, wsOverall, "Общий рейтинг");

    const safeName = conference.name.replace(/[\\\/\?\*\[\]:]/g, "_").substring(0, 60);
    XLSX.writeFile(wb, `results_${safeName}_${confDate}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 [overflow-wrap:anywhere]">{conference.name}</h2>
          <p className="text-sm text-gray-500">
            {new Date(conference.date).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex-shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          ↓ Excel
        </button>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("sections")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "sections"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          По секциям
        </button>
        <button
          onClick={() => setActiveTab("overall")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "overall"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Общий рейтинг
        </button>
      </div>

      {/* ── ПО СЕКЦИЯМ ──────────────────────────────────────────────── */}
      {activeTab === "sections" && (
        <div>
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Нет секций</p>
          ) : (
            <>
              {/* Section sub-tabs — scrollable on mobile */}
              <div className="flex gap-1 border-b border-gray-200 overflow-x-auto mb-5">
                {results.map((section, idx) => (
                  <button
                    key={section.sectionId}
                    onClick={() => setActiveSectionIdx(idx)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${
                      idx === safeActiveSectionIdx
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {section.sectionName}
                  </button>
                ))}
              </div>

              {/* Active section content */}
              {(() => {
                const section = results[safeActiveSectionIdx];
                if (!section) return null;
                const rankings = assignRanks(section.presenters);
                const sorted = [...section.presenters].sort(
                  (a, b) => (b.totalAverage ?? -1) - (a.totalAverage ?? -1)
                );
                return (
                  <div>
                    {section.hall !== "—" && (
                      <p className="text-xs text-gray-400 mb-3 [overflow-wrap:anywhere]">
                        Аудитория: {section.hall}
                      </p>
                    )}
                    <div className="space-y-2">
                      {sorted.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">
                          В этой секции нет докладчиков
                        </p>
                      ) : (
                        sorted.map((presenter) => (
                          <PresenterCard
                            key={presenter.presenterId}
                            presenter={presenter}
                            rank={rankings.get(presenter.presenterId) ?? null}
                            criteria={criteria}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── ОБЩИЙ РЕЙТИНГ ───────────────────────────────────────────── */}
      {activeTab === "overall" && (
        <div className="space-y-2">
          {overallList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Нет докладчиков</p>
          ) : (
            overallList.map((presenter) => {
              const displayRank = overallRankMap.get(presenter.presenterId) ?? null;
              return (
                <PresenterCard
                  key={presenter.presenterId}
                  presenter={presenter}
                  rank={displayRank}
                  criteria={criteria}
                  showSection
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
