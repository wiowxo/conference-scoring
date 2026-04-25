"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type {
  Presenter,
  Section,
  Hall,
  Conference,
  Criterion,
  QualityZone,
  VotingStatus,
  JuryMember,
  Score,
} from "@prisma/client";
import { getSocket } from "@/lib/socket-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type HallWithVoting = Hall & { votingStatus: VotingStatus | null };
type AssignedSection = Section & {
  presenters: Presenter[];
  hall: HallWithVoting | null;
};
type AssignmentWithSection = {
  section: AssignedSection;
};
type CriterionWithZones = Criterion & { qualityZones: QualityZone[] };
type FullJuryMember = JuryMember & {
  conference: Conference & { criteria: CriterionWithZones[] };
  sectionAssignments: AssignmentWithSection[];
};

type ScoreMap = Record<string, number | null>; // key: `${presenterId}-${criterionId}`
type PresenterScoringStatus = "full" | "partial" | "empty";

function scoreKey(presenterId: number, criterionId: number) {
  return `${presenterId}-${criterionId}`;
}

// Returns every integer between min and max for the <datalist>
function getTickValues(min: number, max: number): number[] {
  const range = max - min;
  return Array.from({ length: range + 1 }, (_, i) => min + i);
}

// Adaptive interval: at most ~10 labels, always show min + max
function getTickInterval(min: number, max: number): number {
  const range = max - min;
  if (range <= 10) return 1;
  if (range <= 20) return 2;
  if (range <= 50) return 5;
  if (range <= 100) return 10;
  if (range <= 500) return 50;
  return 100;
}

// Returns which values get visible text labels
function getTickLabels(min: number, max: number): number[] {
  const interval = getTickInterval(min, max);
  const labels = new Set<number>();
  labels.add(min);
  labels.add(max);
  for (let v = Math.ceil(min / interval) * interval; v <= max; v += interval) {
    labels.add(v);
  }
  return [...labels].sort((a, b) => a - b);
}

// Convert a hex color to rgba with given alpha (0–1).
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Build a CSS linear-gradient for the zone track background div.
// Slider spans [critMin-1 (neutral), critMax]. The neutral step is always gray.
// Zone colors are always visible: full opacity before the thumb, dim (0.35) after.
// When no value is set, all zone colors are dim.
function buildZoneGradient(
  zones: QualityZone[],
  critMin: number,
  critMax: number,
  hasValue: boolean,
  currentValue: number | null | undefined
): string {
  if (zones.length === 0) return "#e5e7eb";
  const sliderMin = critMin - 1; // neutral position
  const sliderRange = critMax - sliderMin; // total range including neutral step
  if (sliderRange <= 0) return "#e5e7eb";

  const neutralEndPct = (1 / sliderRange) * 100;
  // Position of the current value on the slider (as % of full slider width)
  const valuePct = hasValue && currentValue !== null && currentValue !== undefined
    ? ((currentValue - sliderMin) / sliderRange) * 100
    : 0; // no value → nothing is "bright"

  const DIM = 0.35;
  const sorted = [...zones].sort((a, b) => a.minValue - b.minValue);

  // Start with gray for the neutral zone (0% → neutralEndPct)
  const stops: string[] = [
    `#e5e7eb 0%`,
    `#e5e7eb ${neutralEndPct.toFixed(2)}%`,
  ];

  for (let i = 0; i < sorted.length; i++) {
    const z = sorted[i];
    const zStartPct = ((z.minValue - sliderMin) / sliderRange) * 100;
    // Extend each zone to the next zone's start to prevent visual gaps
    const zEndPct = i < sorted.length - 1
      ? ((sorted[i + 1].minValue - sliderMin) / sliderRange) * 100
      : 100;
    const full = z.color;
    const dim = hexToRgba(z.color, DIM);

    if (!hasValue || valuePct <= zStartPct) {
      // Entire zone is at or after the thumb → dim
      stops.push(`${dim} ${zStartPct.toFixed(2)}%`);
      stops.push(`${dim} ${zEndPct.toFixed(2)}%`);
    } else if (valuePct >= zEndPct) {
      // Entire zone is before the thumb → full opacity
      stops.push(`${full} ${zStartPct.toFixed(2)}%`);
      stops.push(`${full} ${zEndPct.toFixed(2)}%`);
    } else {
      // Thumb is inside this zone → split at valuePct
      stops.push(`${full} ${zStartPct.toFixed(2)}%`);
      stops.push(`${full} ${valuePct.toFixed(2)}%`);
      stops.push(`${dim} ${valuePct.toFixed(2)}%`);
      stops.push(`${dim} ${zEndPct.toFixed(2)}%`);
    }
  }

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoringPanel({
  juryMemberId,
  juryMember: initialJuryMember,
  existingScores,
}: {
  juryMemberId: number;
  juryMember: FullJuryMember;
  existingScores: Score[];
}) {
  const [juryMember, setJuryMember] = useState(initialJuryMember);
  const [conferenceStatus, setConferenceStatus] = useState(initialJuryMember.conference.status);
  const [useSlider, setUseSlider] = useState(initialJuryMember.conference.useSlider);
  const [toast, setToast] = useState<string | null>(null);
  const [confNameExpanded, setConfNameExpanded] = useState(false);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  }

  const sections = juryMember.sectionAssignments.map((a) => a.section);

  // ── localStorage helpers ──────────────────────────────────────────────────

  function lsGet(key: string): string | null {
    try { return typeof window !== "undefined" ? localStorage.getItem(key) : null; } catch { return null; }
  }
  function lsSet(key: string, value: string) {
    try { if (typeof window !== "undefined") localStorage.setItem(key, value); } catch {}
  }

  // ── Navigation state — always start at 0 (SSR-safe), restore from localStorage after mount ──

  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0);
  const [presenterIndex, setPresenterIndex] = useState(0);

  // Restore saved position once on the client after hydration
  useEffect(() => {
    const savedSec = lsGet(`jury_section_${juryMemberId}`);
    const secIdx = (() => {
      const idx = savedSec !== null ? parseInt(savedSec, 10) : 0;
      return isNaN(idx) ? 0 : Math.min(idx, Math.max(0, sections.length - 1));
    })();
    const sectionId = sections[secIdx]?.id;
    const savedP = sectionId ? lsGet(`jury_presenter_${juryMemberId}_${sectionId}`) : null;
    const pIdx = (() => {
      const idx = savedP !== null ? parseInt(savedP, 10) : 0;
      const maxIdx = (sections[secIdx]?.presenters.length ?? 1) - 1;
      return isNaN(idx) ? 0 : Math.min(idx, Math.max(0, maxIdx));
    })();
    if (secIdx !== 0) setSelectedSectionIdx(secIdx);
    if (pIdx !== 0) setPresenterIndex(pIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conference = juryMember.conference;
  const criteria = conference.criteria;
  const conferenceId = conference.id;

  const uniqueHallIds = [
    ...new Set(
      sections.map((s) => s.hall?.id).filter((id): id is number => id !== undefined && id !== null)
    ),
  ];

  const currentSection = sections[selectedSectionIdx] ?? null;
  const presenters = currentSection?.presenters ?? [];
  const currentHallId = currentSection?.hall?.id ?? null;

  // Per-hall voting status
  const [votingByHall, setVotingByHall] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const a of initialJuryMember.sectionAssignments) {
      const hall = a.section.hall;
      if (hall) map[hall.id] = hall.votingStatus?.isOpen ?? false;
    }
    return map;
  });

  const currentVotingOpen = currentHallId ? (votingByHall[currentHallId] ?? false) : false;

  // Clamp presenterIndex when presenters list changes
  useEffect(() => {
    if (presenterIndex > 0 && presenterIndex >= presenters.length) {
      setPresenterIndex(Math.max(0, presenters.length - 1));
    }
  }, [presenters.length, presenterIndex]);

  // ── Scores ────────────────────────────────────────────────────────────────

  const [scores, setScores] = useState<ScoreMap>(() => {
    const map: ScoreMap = {};
    for (const s of existingScores) {
      map[scoreKey(s.presenterId, s.criterionId)] = s.value;
    }
    return map;
  });
  const scoresRef = useRef(scores);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  // localValues — displayed during drag (updates on every input, before server save)
  // scores     — server-confirmed saved values (updated only on successful API call)
  const [localValues, setLocalValues] = useState<ScoreMap>(() => {
    const map: ScoreMap = {};
    for (const s of existingScores) {
      map[scoreKey(s.presenterId, s.criterionId)] = s.value;
    }
    return map;
  });
  const localValuesRef = useRef(localValues);
  useEffect(() => { localValuesRef.current = localValues; }, [localValues]);

  // Per-criterion quality zones (can be updated via socket)
  const [criteriaZones, setCriteriaZones] = useState<Record<number, QualityZone[]>>(() => {
    const map: Record<number, QualityZone[]> = {};
    for (const c of initialJuryMember.conference.criteria) {
      map[c.id] = c.qualityZones ?? [];
    }
    return map;
  });
  const [criteriaUseZones, setCriteriaUseZones] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const c of initialJuryMember.conference.criteria) {
      map[c.id] = c.useQualityZones ?? false;
    }
    return map;
  });

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  // ── Score locking ─────────────────────────────────────────────────────────
  // Keys that are currently unlocked for editing (10-second window)
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<Record<string, number>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const unlockTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const countdownIntervalRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  function lockCriterion(key: string) {
    setUnlocked((u) => ({ ...u, [key]: false }));
    setCountdown((c) => ({ ...c, [key]: 0 }));
    if (countdownIntervalRef.current[key]) {
      clearInterval(countdownIntervalRef.current[key]);
      delete countdownIntervalRef.current[key];
    }
    if (unlockTimerRef.current[key]) {
      clearTimeout(unlockTimerRef.current[key]);
      delete unlockTimerRef.current[key];
    }
  }

  function unlockCriterion(key: string) {
    lockCriterion(key); // clear any existing timers first
    setUnlocked((u) => ({ ...u, [key]: true }));
    setCountdown((c) => ({ ...c, [key]: 10 }));

    const intervalId = setInterval(() => {
      setCountdown((c) => {
        const remaining = (c[key] ?? 1) - 1;
        if (remaining <= 0) {
          clearInterval(intervalId);
          delete countdownIntervalRef.current[key];
          return { ...c, [key]: 0 };
        }
        return { ...c, [key]: remaining };
      });
    }, 1000);
    countdownIntervalRef.current[key] = intervalId;

    const timerId = setTimeout(() => {
      lockCriterion(key);
      delete unlockTimerRef.current[key];
    }, 10000);
    unlockTimerRef.current[key] = timerId;
  }

  // Clear all unlock timers on unmount
  useEffect(() => {
    return () => {
      Object.values(unlockTimerRef.current).forEach(clearTimeout);
      Object.values(countdownIntervalRef.current).forEach(clearInterval);
    };
  }, []);

  // ── Collapsed sections (summary table) ────────────────────────────────────
  // Always start empty (SSR-safe), restore from localStorage after hydration

  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore collapsed state once after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`collapsed_sections_${juryMemberId}`);
      if (raw) setCollapsedSections(JSON.parse(raw) as Record<number, boolean>);
    } catch {}
    setIsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever it changes, but only after hydration to avoid overwriting with {}
  useEffect(() => {
    if (isHydrated) {
      try { localStorage.setItem(`collapsed_sections_${juryMemberId}`, JSON.stringify(collapsedSections)); } catch {}
    }
  }, [collapsedSections, isHydrated, juryMemberId]);

  function toggleSectionCollapse(sectionId: number) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function selectSection(idx: number) {
    setSelectedSectionIdx(idx);
    setPresenterIndex(0);
    lsSet(`jury_section_${juryMemberId}`, String(idx));
    const sectionId = sections[idx]?.id;
    if (sectionId) lsSet(`jury_presenter_${juryMemberId}_${sectionId}`, "0");
  }

  function navigatePresenter(idx: number) {
    const clamped = Math.max(0, Math.min(presenters.length - 1, idx));
    setPresenterIndex(clamped);
    const sectionId = currentSection?.id;
    if (sectionId) lsSet(`jury_presenter_${juryMemberId}_${sectionId}`, String(clamped));
  }

  function selectPresenterInSection(secIdx: number, pIdx: number) {
    setSelectedSectionIdx(secIdx);
    setPresenterIndex(pIdx);
    lsSet(`jury_section_${juryMemberId}`, String(secIdx));
    const sectionId = sections[secIdx]?.id;
    if (sectionId) lsSet(`jury_presenter_${juryMemberId}_${sectionId}`, String(pIdx));
  }

  // ── Refetch ───────────────────────────────────────────────────────────────

  const refetchJuryData = useCallback(async () => {
    try {
      const res = await fetch("/api/jury/me");
      if (!res.ok) return;
      const { juryMember: jm, scores: s } = await res.json();
      setJuryMember(jm);
      setConferenceStatus(jm.conference.status);
      setUseSlider(jm.conference.useSlider);
      const scoreMap: ScoreMap = {};
      for (const score of s as Score[]) {
        scoreMap[scoreKey(score.presenterId, score.criterionId)] = score.value;
      }
      setScores(() => ({ ...scoreMap }));
      setLocalValues(() => ({ ...scoreMap }));
      setVotingByHall(() => {
        const map: Record<number, boolean> = {};
        for (const a of jm.sectionAssignments) {
          if (a.section.hall) map[a.section.hall.id] = a.section.hall.votingStatus?.isOpen ?? false;
        }
        return map;
      });
      setCriteriaZones(() => {
        const map: Record<number, QualityZone[]> = {};
        for (const c of jm.conference.criteria) {
          map[c.id] = c.qualityZones ?? [];
        }
        return map;
      });
      setCriteriaUseZones(() => {
        const map: Record<number, boolean> = {};
        for (const c of jm.conference.criteria) {
          map[c.id] = c.useQualityZones ?? false;
        }
        return map;
      });
    } catch {
      // silently ignore
    }
  }, []);

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();
    for (const hid of uniqueHallIds) socket.emit("join-hall", hid);
    socket.emit("join-conference", conferenceId);

    const onVotingStatus = ({ hallId, isOpen }: { hallId: number; isOpen: boolean }) => setVotingByHall((v) => ({ ...v, [hallId]: isOpen }));
    const onVotingChanged = ({ hallId, isOpen }: { hallId: number; isOpen: boolean }) => setVotingByHall((v) => ({ ...v, [hallId]: isOpen }));
    const onConferenceStatusChanged = ({ status }: { status: string }) => setConferenceStatus(status as "ACTIVE" | "FINISHED");
    const onConferenceUpdated = ({ useSlider: us }: { useSlider?: boolean }) => { if (typeof us === "boolean") setUseSlider(us); };
    const onStructuralChange = () => refetchJuryData();
    const onCriterionReordered = () => { refetchJuryData(); showToast("Порядок критериев был изменён организатором"); };
    const onZonesUpdated = ({ criterionId, useQualityZones: uqz, zones }: { criterionId: number; useQualityZones: boolean; zones: QualityZone[] }) => {
      setCriteriaZones((prev) => ({ ...prev, [criterionId]: zones }));
      setCriteriaUseZones((prev) => ({ ...prev, [criterionId]: uqz }));
    };
    const onJurySectionsUpdated = ({ juryMemberId: jid }: { juryMemberId: number }) => { if (jid === juryMemberId) refetchJuryData(); };
    const onScoresCleared = ({ conferenceId: cid }: { conferenceId: number }) => {
      if (cid === conferenceId) {
        setScores({});
        setLocalValues({});
        showToast("Результаты голосования были очищены организатором");
      }
    };
    const onReconnect = () => {
      socket.emit("join-conference", conferenceId);
      for (const hid of uniqueHallIds) socket.emit("join-hall", hid);
      refetchJuryData();
    };

    socket.on("voting-status", onVotingStatus);
    socket.on("voting:changed", onVotingChanged);
    socket.on("conference:status:changed", onConferenceStatusChanged);
    socket.on("conference:updated", onConferenceUpdated);
    socket.on("section:created", onStructuralChange);
    socket.on("section:updated", onStructuralChange);
    socket.on("section:deleted", onStructuralChange);
    socket.on("presenter:created", onStructuralChange);
    socket.on("presenter:updated", onStructuralChange);
    socket.on("presenter:deleted", onStructuralChange);
    socket.on("criterion:created", onStructuralChange);
    socket.on("criterion:updated", onStructuralChange);
    socket.on("criterion:deleted", onStructuralChange);
    socket.on("criterion:reordered", onCriterionReordered);
    socket.on("criterion:zones:updated", onZonesUpdated);
    socket.on("jury:sections:updated", onJurySectionsUpdated);
    socket.on("scores:cleared", onScoresCleared);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("voting-status", onVotingStatus);
      socket.off("voting:changed", onVotingChanged);
      socket.off("conference:status:changed", onConferenceStatusChanged);
      socket.off("conference:updated", onConferenceUpdated);
      socket.off("section:created", onStructuralChange);
      socket.off("section:updated", onStructuralChange);
      socket.off("section:deleted", onStructuralChange);
      socket.off("presenter:created", onStructuralChange);
      socket.off("presenter:updated", onStructuralChange);
      socket.off("presenter:deleted", onStructuralChange);
      socket.off("criterion:created", onStructuralChange);
      socket.off("criterion:updated", onStructuralChange);
      socket.off("criterion:deleted", onStructuralChange);
      socket.off("criterion:reordered", onCriterionReordered);
      socket.off("criterion:zones:updated", onZonesUpdated);
      socket.off("jury:sections:updated", onJurySectionsUpdated);
      socket.off("scores:cleared", onScoresCleared);
      socket.off("connect", onReconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId, juryMemberId, refetchJuryData]);

  // ── Score submission ──────────────────────────────────────────────────────

  const submitScore = useCallback(
    async (presenterId: number, criterionId: number, value: number | null): Promise<boolean> => {
      const key = scoreKey(presenterId, criterionId);
      setSaving((s) => ({ ...s, [key]: true }));
      try {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presenterId, criterionId, value }),
        });
        if (res.ok) {
          setScores((s) => ({ ...s, [key]: value }));
          setSaved((s) => ({ ...s, [key]: true }));
          setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2000);
          return true;
        } else {
          setLocalValues((lv) => ({ ...lv, [key]: scoresRef.current[key] ?? null }));
          return false;
        }
      } catch {
        setLocalValues((lv) => ({ ...lv, [key]: scoresRef.current[key] ?? null }));
        return false;
      } finally {
        setSaving((s) => ({ ...s, [key]: false }));
      }
    },
    []
  );

  // ── Input handlers ────────────────────────────────────────────────────────

  function clampScore(value: number, criterion: Criterion): number {
    if (value > criterion.maxScore) return criterion.maxScore;
    if (value < criterion.minScore) return criterion.minScore;
    return value;
  }

  function handleScoreKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (["+", "-", ".", "e", "E"].includes(e.key)) e.preventDefault();
  }

  // Updates localValues on every drag — does NOT save to server or lock
  function handleSliderChange(presenterId: number, criterionId: number, rawValue: number, criterion: Criterion) {
    const key = scoreKey(presenterId, criterionId);
    const neutral = criterion.minScore - 1;
    setLocalValues((lv) => ({ ...lv, [key]: rawValue === neutral ? null : clampScore(rawValue, criterion) }));
  }

  // Saves to server and locks — fires on mouse/touch release only
  function handleSliderRelease(presenterId: number, criterionId: number, criterion: Criterion) {
    const key = scoreKey(presenterId, criterionId);
    const isUnlocked = !!unlocked[key];
    const value = localValuesRef.current[key] ?? null;
    submitScore(presenterId, criterionId, value).then((ok) => {
      if (ok && isUnlocked) lockCriterion(key);
    });
  }

  // Number input onChange — updates localValues only, no server call
  function handleInput(presenterId: number, criterionId: number, raw: string, criterion: Criterion) {
    const cleaned = raw.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1");
    const key = scoreKey(presenterId, criterionId);
    if (cleaned === "") {
      setLocalValues((lv) => ({ ...lv, [key]: null }));
      return;
    }
    const parsed = parseInt(cleaned, 10);
    if (parsed === criterion.minScore - 1) {
      setLocalValues((lv) => ({ ...lv, [key]: null }));
      return;
    }
    setLocalValues((lv) => ({ ...lv, [key]: clampScore(parsed, criterion) }));
  }

  // Number input onBlur — saves localValue to server and locks after successful save
  function handleBlur(presenterId: number, criterionId: number, criterion: Criterion) {
    const key = scoreKey(presenterId, criterionId);
    const isUnlocked = !!unlocked[key];
    let value = localValuesRef.current[key] ?? null;
    if (value !== null) {
      value = clampScore(value, criterion);
      setLocalValues((lv) => ({ ...lv, [key]: value }));
    }
    submitScore(presenterId, criterionId, value).then((ok) => {
      if (ok && isUnlocked) lockCriterion(key);
    });
  }

  // ── Status helpers ────────────────────────────────────────────────────────

  function presenterStatus(presenterId: number): PresenterScoringStatus {
    const vals = criteria.map((c) => scores[scoreKey(presenterId, c.id)]);
    const filled = vals.filter((v) => v !== null && v !== undefined);
    if (filled.length === 0) return "empty";
    if (filled.length === criteria.length) return "full";
    return "partial";
  }

  function rowClass(status: PresenterScoringStatus, isActive: boolean): string {
    if (isActive) return "bg-blue-50 shadow-[0_0_8px_2px_rgba(59,130,246,0.3)] ring-1 ring-inset ring-blue-200";
    if (status === "full") return "bg-green-50 shadow-[0_0_8px_2px_rgba(34,197,94,0.3)]";
    if (status === "partial") return "bg-yellow-50 shadow-[0_0_8px_2px_rgba(234,179,8,0.3)]";
    return "";
  }

  // ── Conference finished ───────────────────────────────────────────────────

  if (conferenceStatus === "FINISHED") {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800 break-words [overflow-wrap:anywhere]">{conference.name}</h1>
          <span className="px-3 py-1 bg-gray-100 text-gray-500 text-sm font-medium rounded-full flex-shrink-0 ml-3">
            Конференция завершена
          </span>
        </div>
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-600">Конференция завершена</h2>
          <p className="text-gray-400 mt-1">Голосование закрыто. Оценки больше не принимаются.</p>
          <Link href="/public-results" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Перейти к результатам →
          </Link>
        </div>
      </div>
    );
  }

  // ── No sections assigned ──────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-gray-600">Нет назначенных секций</h2>
        <p className="text-gray-400 mt-1">Ожидайте назначения секций от организатора</p>
      </div>
    );
  }

  const currentPresenter = presenters[presenterIndex] ?? null;
  const presenterType = currentPresenter as (Presenter & { position?: string | null }) | null;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Unlock confirmation dialog */}
      {confirmKey !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full">
            <p className="text-gray-800 font-medium mb-5">
              Вы уверены, что хотите изменить оценку?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmKey(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  unlockCriterion(confirmKey);
                  setConfirmKey(null);
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Изменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setConfNameExpanded((v) => !v)}
            className="text-left w-full group"
          >
            <h1
              className={`text-xl sm:text-2xl font-bold text-gray-800 [overflow-wrap:anywhere] transition-all ${
                confNameExpanded ? "" : "line-clamp-2"
              }`}
            >
              {conference.name}
            </h1>
            <span className="text-xs text-blue-500 group-hover:text-blue-700 transition-colors">
              {confNameExpanded ? "свернуть ▲" : "показать полностью ▼"}
            </span>
          </button>
        </div>
        <Link
          href="/public-results"
          className="flex-shrink-0 px-3 py-1 bg-blue-50 text-blue-600 text-sm font-medium rounded-full hover:bg-blue-100 transition-colors"
        >
          Результаты →
        </Link>
      </div>

      {/* Section tabs */}
      <div className="mb-5">
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {sections.map((sec, idx) => {
            const hallId = sec.hall?.id ?? null;
            const isOpen = hallId ? (votingByHall[hallId] ?? false) : false;
            return (
              <button
                key={sec.id}
                onClick={() => selectSection(idx)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-start gap-1.5 text-left ${
                  idx === selectedSectionIdx
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className="[overflow-wrap:anywhere] break-words">{sec.name}</span>
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${isOpen ? "bg-green-400" : "bg-gray-300"}`}
                  title={isOpen ? "Голосование открыто" : "Голосование закрыто"}
                />
              </button>
            );
          })}
        </div>
      </div>

      {currentSection && (
        <>
          {/* Hall + voting status */}
          <div className="flex items-start gap-2 mb-4 flex-wrap">
            {currentSection.hall && (
              <span className="text-xs text-gray-400 [overflow-wrap:anywhere] break-words">Аудитория: {currentSection.hall.name}</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${currentVotingOpen ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {currentVotingOpen ? "Голосование открыто" : "Голосование закрыто"}
            </span>
          </div>

          {presenters.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">В этой секции нет докладчиков.</div>
          ) : (
            <>
              {/* Presenter navigation */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-5">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => navigatePresenter(presenterIndex - 1)}
                    disabled={presenterIndex === 0}
                    className="px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    ←
                  </button>
                  <div className="flex-1 text-center min-w-0 overflow-hidden">
                    <p className="font-semibold text-gray-800 text-sm sm:text-base [overflow-wrap:anywhere] line-clamp-2">
                      {currentPresenter?.name}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2 [overflow-wrap:anywhere] mt-0.5">
                      {currentPresenter?.topic}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {presenterIndex + 1} / {presenters.length}
                    </p>
                  </div>
                  <button
                    onClick={() => navigatePresenter(presenterIndex + 1)}
                    disabled={presenterIndex === presenters.length - 1}
                    className="px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Scoring card */}
              {currentPresenter && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-6">
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-800 text-base sm:text-lg [overflow-wrap:anywhere]">
                      {currentPresenter.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-0.5 [overflow-wrap:anywhere]">{currentPresenter.topic}</p>
                    {presenterType?.position && (
                      <p className="text-xs text-gray-400 mt-0.5 [overflow-wrap:anywhere]">{presenterType.position}</p>
                    )}
                    {currentPresenter.supervisor && (
                      <p className="text-xs text-gray-400 mt-0.5 [overflow-wrap:anywhere]">Науч. рук.: {currentPresenter.supervisor}</p>
                    )}
                  </div>

                  {!currentVotingOpen ? (
                    <div className="py-4 text-center text-gray-400 text-sm">
                      Голосование в этой аудитории закрыто — оценки не принимаются
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {criteria.map((criterion, cIdx) => {
                        const key = scoreKey(currentPresenter.id, criterion.id);
                        const savedVal = scores[key] ?? null;   // server-confirmed value
                        const localVal = localValues[key] ?? null; // currently displayed
                        const isSaving = saving[key];
                        const isSaved = saved[key];
                        const tickValues = getTickValues(criterion.minScore, criterion.maxScore);
                        const tickLabels = getTickLabels(criterion.minScore, criterion.maxScore);
                        const datalistId = `ticks-${criterion.id}-${currentPresenter.id}`;

                        const zones = criteriaZones[criterion.id] ?? [];
                        const useZones = criteriaUseZones[criterion.id] ?? false;
                        const activeZones = useZones ? zones : [];
                        // slider neutral position is one step below critMin
                        const neutralPos = criterion.minScore - 1;
                        const sliderHasValue = localVal !== null;
                        const sliderValue: number = sliderHasValue ? (localVal as number) : neutralPos;
                        const activeZone = activeZones.length > 0 && sliderHasValue && localVal !== null
                          ? activeZones.find((z) => (localVal as number) >= z.minValue && (localVal as number) <= z.maxValue) ?? null
                          : null;
                        // Tick label positions account for the extended slider range (critMin-1 to critMax)
                        const sliderTotalRange = criterion.maxScore - neutralPos; // range + 1
                        // Neutral zone width as % of total slider width
                        const neutralEndPct = sliderTotalRange > 0 ? (1 / sliderTotalRange) * 100 : 0;

                        // Lock and unlock based on savedVal (server-confirmed), not localVal
                        const isScoreLocked = savedVal !== null && !unlocked[key];
                        const canUnlock = savedVal !== null && currentVotingOpen;
                        const isUnlocked = !!unlocked[key];
                        const countdownSecs = countdown[key] ?? 0;

                        return (
                          <div key={criterion.id}>
                            <div className="flex items-center justify-between mb-1.5" style={{ minHeight: 24 }}>
                              <label className="text-sm font-medium text-gray-600 flex-1 min-w-0">
                                <span className="text-gray-400 mr-1">{cIdx + 1}.</span>
                                <span className="[overflow-wrap:anywhere]">{criterion.name}</span>
                                <span className="ml-1 text-gray-400 font-normal whitespace-nowrap">
                                  ({criterion.minScore}–{criterion.maxScore})
                                </span>
                              </label>
                              {/* Fixed-size right slot — always in DOM, visibility toggled to prevent layout shift */}
                              <div className="ml-2 flex-shrink-0 relative" style={{ width: 64, height: 20 }}>
                                <button
                                  type="button"
                                  onClick={() => setConfirmKey(key)}
                                  className="absolute right-0 top-0 text-xs text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap"
                                  style={{ visibility: (canUnlock && !isUnlocked) ? "visible" : "hidden" }}
                                >
                                  Изменить
                                </button>
                                <span
                                  className="absolute right-0 top-0 text-xs text-orange-500 whitespace-nowrap"
                                  style={{ visibility: isUnlocked ? "visible" : "hidden" }}
                                >
                                  {countdownSecs} сек
                                </span>
                              </div>
                            </div>
                            {useSlider ? (
                              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3" style={{ minHeight: 56 }}>
                                {/* Slider + tick labels + zone label — full width */}
                                <div className="flex-1 min-w-0">
                                  {/* Track wrapper: positions background divs behind the transparent input */}
                                  <div style={{ position: "relative", touchAction: "none" }}>
                                    {/* Zone gradient track background — always visible */}
                                    <div
                                      className="slider-track-bg"
                                      style={{
                                        position: "absolute",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        left: 0,
                                        right: 0,
                                        background: activeZones.length > 0
                                          ? buildZoneGradient(activeZones, criterion.minScore, criterion.maxScore, sliderHasValue, localVal)
                                          : "#e5e7eb",
                                        zIndex: 0,
                                        pointerEvents: "none",
                                      }}
                                    />
                                    {/* Neutral gray overlay — covers the pre-minScore sliver */}
                                    <div
                                      className="slider-neutral-bg"
                                      style={{
                                        position: "absolute",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        left: 0,
                                        width: `${neutralEndPct.toFixed(2)}%`,
                                        borderRadius: "3px 0 0 3px",
                                        background: "#d1d5db",
                                        zIndex: 1,
                                        pointerEvents: "none",
                                      }}
                                    />
                                    <input
                                      type="range"
                                      list={datalistId}
                                      min={neutralPos}
                                      max={criterion.maxScore}
                                      step="1"
                                      value={sliderValue}
                                      onChange={(e) =>
                                        handleSliderChange(
                                          currentPresenter.id,
                                          criterion.id,
                                          parseInt((e.target as HTMLInputElement).value),
                                          criterion
                                        )
                                      }
                                      onMouseUp={() => handleSliderRelease(currentPresenter.id, criterion.id, criterion)}
                                      onTouchEnd={() => handleSliderRelease(currentPresenter.id, criterion.id, criterion)}
                                      onTouchStart={(e) => e.stopPropagation()}
                                      disabled={isScoreLocked || isSaving}
                                      className={`score-slider${sliderHasValue ? "" : " no-value"}${isScoreLocked ? " opacity-60" : ""}`}
                                      style={{ position: "relative", zIndex: 2, background: "transparent" }}
                                    />
                                  </div>
                                  <datalist id={datalistId}>
                                    {tickValues.map((v) => (
                                      <option key={v} value={v} />
                                    ))}
                                  </datalist>
                                  {/* Position-based tick labels — offset for neutral position */}
                                  <div className="relative mt-1" style={{ height: 16 }}>
                                    {tickLabels.map((v) => {
                                      const pct = sliderTotalRange > 0
                                        ? ((v - neutralPos) / sliderTotalRange) * 100
                                        : 0;
                                      return (
                                        <span
                                          key={v}
                                          className="absolute text-xs text-gray-400 -translate-x-1/2 select-none"
                                          style={{ left: `${pct}%` }}
                                        >
                                          {v}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {/* Active zone label — centered on mobile */}
                                  {activeZone && (
                                    <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1.5">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ background: activeZone.color }}
                                      />
                                      <span className="text-xs font-medium" style={{ color: activeZone.color }}>
                                        {activeZone.label}
                                      </span>
                                    </div>
                                  )}
                                  {/* No-value hint */}
                                  {!sliderHasValue && (
                                    <p className="text-xs text-gray-400 mt-1 italic text-center sm:text-left">
                                      Переместите ползунок для оценки
                                    </p>
                                  )}
                                </div>
                                {/* Number input — below on mobile, right on desktop */}
                                <div className="flex justify-center sm:justify-start sm:flex-shrink-0">
                                  <input
                                    type="number"
                                    value={sliderHasValue ? (localVal ?? "") : ""}
                                    onChange={(e) =>
                                      handleInput(currentPresenter.id, criterion.id, e.target.value, criterion)
                                    }
                                    onKeyDown={handleScoreKeyDown}
                                    onBlur={() => handleBlur(currentPresenter.id, criterion.id, criterion)}
                                    min={criterion.minScore}
                                    max={criterion.maxScore}
                                    step="1"
                                    disabled={isScoreLocked || isSaving}
                                    className="w-20 sm:w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-lg sm:text-sm text-center text-black focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                                    placeholder="—"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  value={localVal ?? ""}
                                  onChange={(e) =>
                                    handleInput(currentPresenter.id, criterion.id, e.target.value, criterion)
                                  }
                                  onKeyDown={handleScoreKeyDown}
                                  onBlur={() => handleBlur(currentPresenter.id, criterion.id, criterion)}
                                  min={criterion.minScore}
                                  max={criterion.maxScore}
                                  step="1"
                                  disabled={isScoreLocked || isSaving}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                                  placeholder={`${criterion.minScore}–${criterion.maxScore}`}
                                />
                                {isSaved && !isSaving && (
                                  <span className="absolute right-2 text-xs text-green-500 pointer-events-none">✓</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Summary table */}
      {sections.length > 0 && criteria.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700 text-sm">Сводная таблица оценок</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-gray-500 font-medium min-w-[160px]">Докладчик</th>
                  {criteria.map((c, cIdx) => (
                    <th key={c.id} className="text-center px-3 py-2 text-gray-500 font-medium whitespace-nowrap">
                      {cIdx + 1}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec, secIdx) => {
                  const isCollapsed = !!collapsedSections[sec.id];
                  return (
                    <React.Fragment key={sec.id}>
                      {/* Section header row (always shown when >1 section) */}
                      {sections.length > 1 && (
                        <tr
                          className="bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                          onClick={() => toggleSectionCollapse(sec.id)}
                        >
                          <td
                            colSpan={criteria.length + 2}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                          >
                            <span className="flex items-start gap-2">
                              <span className="[overflow-wrap:anywhere] break-words">{sec.hall ? `${sec.hall.name} / ` : ""}{sec.name}</span>
                              <span className="text-gray-400 flex-shrink-0">{isCollapsed ? "▲" : "▼"}</span>
                            </span>
                          </td>
                        </tr>
                      )}
                      {/* Presenter rows — hidden when section collapsed */}
                      {!isCollapsed && sec.presenters.map((p, pIdx) => {
                        const status = presenterStatus(p.id);
                        const isActive = selectedSectionIdx === secIdx && presenterIndex === pIdx;
                        return (
                          <tr
                            key={p.id}
                            onClick={() => selectPresenterInSection(secIdx, pIdx)}
                            className={`border-b border-gray-50 cursor-pointer transition-all ${rowClass(status, isActive)}`}
                          >
                            <td className="px-4 py-2" style={{ minWidth: 160 }}>
                              <div
                                className="font-medium text-gray-800 text-xs sm:text-sm"
                                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                              >
                                {p.name}
                              </div>
                              <div
                                className="text-xs text-gray-400 mt-0.5"
                                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                              >
                                {p.topic}
                              </div>
                            </td>
                            {criteria.map((c) => {
                              const val = scores[scoreKey(p.id, c.id)];
                              return (
                                <td key={c.id} className="text-center px-3 py-2 text-gray-700">
                                  {val !== null && val !== undefined ? val : <span className="text-gray-300">—</span>}
                                </td>
                              );
                            })}
                            <td className="text-center px-3 py-2 whitespace-nowrap">
                              {isActive && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Текущий</span>}
                              {!isActive && status === "full" && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Оценено</span>}
                              {!isActive && status === "partial" && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Частично</span>}
                              {!isActive && status === "empty" && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Не оценено</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Criteria legend */}
          {criteria.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 font-medium mb-1">Обозначения критериев:</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {criteria.map((c, cIdx) => (
                  <span key={c.id} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-600">{cIdx + 1}.</span> {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
