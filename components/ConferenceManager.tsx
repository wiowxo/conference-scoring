"use client";
import { useState, useCallback } from "react";
import type {
  Conference,
  Hall,
  Section,
  Presenter,
  JuryMember,
  Criterion,
  QualityZone,
  VotingStatus,
} from "@prisma/client";
import VotingControl from "./VotingControl";

// ── Types ─────────────────────────────────────────────────────────────────────

type FullSection = Section & { presenters: Presenter[] };
type FullHall = Hall & { votingStatus: VotingStatus | null };
type FullJuryMember = JuryMember & {
  sectionAssignments: { sectionId: number }[];
};
type CriterionWithZones = Criterion & { qualityZones: QualityZone[] };
type FullConference = Conference & {
  halls: FullHall[];
  sections: FullSection[];
  criteria: CriterionWithZones[];
  juryMembers: FullJuryMember[];
};

// A zone row in the criterion editor (before saving — absolute values)
type ZoneRow = {
  id?: number;
  label: string;
  minValue: string;
  maxValue: string;
  color: string;
};

// A zone row in the template editor (percentage-based, 0–100)
type TemplateZoneRow = {
  label: string;
  minPct: string;   // "0" – "100"
  maxPct: string;
  color: string;
};

const DEFAULT_TEMPLATE: TemplateZoneRow[] = [
  { label: "Неудовлетворительно", minPct: "0",  maxPct: "20",  color: "#ef4444" },
  { label: "Удовлетворительно",   minPct: "20", maxPct: "50",  color: "#eab308" },
  { label: "Хорошо",              minPct: "50", maxPct: "80",  color: "#84cc16" },
  { label: "Отлично",             minPct: "80", maxPct: "100", color: "#22c55e" },
];

/** Convert a percentage template into absolute zone rows for a given criterion.
 *  Guarantees no gaps and no overlaps: zones cover [minScore, maxScore] exactly.
 *  Each zone boundary is inclusive on both ends.
 *  Example: min=1, max=10, 4 zones (0–20%, 20–50%, 50–80%, 80–100%)
 *    → [1,2], [3,5], [6,8], [9,10]
 */
function applyTemplate(
  template: TemplateZoneRow[],
  minScore: number,
  maxScore: number
): ZoneRow[] {
  const sorted = [...template].sort(
    (a, b) => parseFloat(a.minPct) - parseFloat(b.minPct)
  );
  const range = maxScore - minScore;
  const result: ZoneRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const zoneMin = i === 0 ? minScore : result[i - 1].maxValue !== undefined
      ? parseFloat(result[i - 1].maxValue) + 1
      : minScore;
    const zoneMax = i === sorted.length - 1
      ? maxScore
      : Math.floor(minScore + range * parseFloat(t.maxPct) / 100);
    result.push({ label: t.label, minValue: String(zoneMin), maxValue: String(zoneMax), color: t.color });
  }

  return result;
}

type EditTarget =
  | { kind: "hall"; id: number; name: string }
  | { kind: "section"; id: number; name: string }
  | { kind: "presenter"; id: number; sectionId: number; name: string; topic: string; supervisor: string; position: string }
  | { kind: "criterion"; id: number; name: string; minScore: string; maxScore: string }
  | { kind: "jury"; id: number; name: string; login: string; newPassword: string }
  | null;

type KnownCreds = { login: string; password: string };

function randomAlphanumeric(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function blockNonInteger(e: React.KeyboardEvent<HTMLInputElement>) {
  if (["+", "-", ".", "e", "E"].includes(e.key)) e.preventDefault();
}

function stripNonInteger(e: React.FormEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  el.value = el.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1");
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ConferenceManager({ conference: initial }: { conference: FullConference }) {
  const [conference, setConference] = useState(initial);
  const [activeTab, setActiveTab] = useState<"sections" | "halls" | "jury" | "criteria" | "settings">("sections");

  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Add hall form
  const [hallName, setHallName] = useState("");

  // Add section form
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  // Add presenter form
  const [addPresenterSectionId, setAddPresenterSectionId] = useState<number | null>(null);
  const [newPresenterName, setNewPresenterName] = useState("");
  const [newPresenterTopic, setNewPresenterTopic] = useState("");
  const [newPresenterSupervisor, setNewPresenterSupervisor] = useState("");
  const [newPresenterPosition, setNewPresenterPosition] = useState("");

  // Jury tab state
  const [newJuryName, setNewJuryName] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; login: string; password: string } | null>(null);
  const [knownCreds, setKnownCreds] = useState<Record<number, KnownCreds>>({});
  const [assigningJuryId, setAssigningJuryId] = useState<number | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  // Criteria form
  const [criterionName, setCriterionName] = useState("");
  const [defaultMin, setDefaultMin] = useState("");
  const [defaultMax, setDefaultMax] = useState("");
  const [criterionMin, setCriterionMin] = useState("");
  const [criterionMax, setCriterionMax] = useState("");
  const [criterionError, setCriterionError] = useState("");
  const [useDefaultRange, setUseDefaultRange] = useState(initial.useDefaultRange);

  // Settings
  const [editName, setEditName] = useState(conference.name);
  const [editDate, setEditDate] = useState(
    new Date(conference.date).toISOString().split("T")[0]
  );

  // Clear scores dialog
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearSaving, setClearSaving] = useState(false);

  // Quality zone editor (per-criterion, absolute values)
  const [zoneEditorId, setZoneEditorId] = useState<number | null>(null);
  const [zoneRows, setZoneRows] = useState<ZoneRow[]>([]);
  const [zoneUseZones, setZoneUseZones] = useState(false);
  const [zoneFromTemplate, setZoneFromTemplate] = useState(false); // hint flag
  const [zoneError, setZoneError] = useState("");
  const [zoneSaving, setZoneSaving] = useState(false);

  // Conference-level quality zones template (percentage-based)
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateRows, setTemplateRows] = useState<TemplateZoneRow[]>(() => {
    const raw = initial.qualityZonesTemplate;
    if (Array.isArray(raw) && raw.length > 0) return raw as TemplateZoneRow[];
    return DEFAULT_TEMPLATE;
  });
  const [templateError, setTemplateError] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  function flash(text: string) {
    setMsg(text);
    setErrMsg("");
    setTimeout(() => setMsg(""), 3000);
  }
  function flashError(text: string) {
    setErrMsg(text);
    setMsg("");
    setTimeout(() => setErrMsg(""), 4000);
  }

  // Sorted helpers
  const sortedSections = [...conference.sections].sort(
    (a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const sortedCriteria = [...conference.criteria].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );

  // ── Halls ─────────────────────────────────────────────────────────────────────

  async function addHall() {
    if (!hallName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/halls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conferenceId: conference.id, name: hallName.trim() }),
    });
    if (res.ok) {
      const newHall: Hall = await res.json();
      setConference((c) => ({
        ...c,
        halls: [...c.halls, { ...newHall, votingStatus: null }],
      }));
      setHallName("");
      flash("Аудитория добавлена");
    } else {
      const d = await res.json().catch(() => ({}));
      flashError(d.error || "Ошибка при добавлении аудитории");
    }
    setSaving(false);
  }

  async function deleteHall(id: number) {
    if (!confirm("Удалить эту аудиторию? Секции, назначенные в неё, будут откреплены.")) return;
    const res = await fetch(`/api/halls/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        halls: c.halls.filter((h) => h.id !== id),
        // Unassign sections from this hall
        sections: c.sections.map((s) => s.hallId === id ? { ...s, hallId: null } : s),
      }));
    } else {
      const d = await res.json().catch(() => ({}));
      flashError(d.error || "Ошибка при удалении аудитории");
    }
  }

  async function saveHallEdit() {
    if (editTarget?.kind !== "hall") return;
    if (!editTarget.name.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/halls/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editTarget.name.trim() }),
    });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        halls: c.halls.map((h) =>
          h.id === editTarget.id ? { ...h, name: editTarget.name.trim() } : h
        ),
      }));
      setEditTarget(null);
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setEditSaving(false);
  }

  // Assign section to hall
  async function assignSectionToHall(sectionId: number, hallId: number | null) {
    const res = await fetch(`/api/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hallId }),
    });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        sections: c.sections.map((s) => s.id === sectionId ? { ...s, hallId } : s),
      }));
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
  }

  // ── Sections ──────────────────────────────────────────────────────────────────

  async function addSection() {
    if (!newSectionName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/conferences/${conference.id}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSectionName.trim() }),
    });
    if (res.ok) {
      const s: FullSection = await res.json();
      setConference((c) => ({
        ...c,
        sections: [...c.sections, s],
      }));
      setNewSectionName("");
      setAddSectionOpen(false);
      flash("Секция добавлена");
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setSaving(false);
  }

  async function deleteSection(id: number) {
    if (!confirm("Удалить эту секцию вместе со всеми докладчиками и оценками?")) return;
    const res = await fetch(`/api/sections/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        sections: c.sections.filter((s) => s.id !== id),
        juryMembers: c.juryMembers.map((j) => ({
          ...j,
          sectionAssignments: j.sectionAssignments.filter((a) => a.sectionId !== id),
        })),
      }));
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
  }

  async function saveSectionEdit() {
    if (editTarget?.kind !== "section") return;
    if (!editTarget.name.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/sections/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editTarget.name.trim() }),
    });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        sections: c.sections.map((s) =>
          s.id === editTarget.id ? { ...s, name: editTarget.name.trim() } : s
        ),
      }));
      setEditTarget(null);
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setEditSaving(false);
  }

  async function reorderSection(sectionId: number, dir: "up" | "down") {
    const sorted = sortedSections;
    const idx = sorted.findIndex((s) => s.id === sectionId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/sections/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: b.order }) }),
      fetch(`/api/sections/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: a.order }) }),
    ]);
    setConference((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === a.id ? { ...s, order: b.order } :
        s.id === b.id ? { ...s, order: a.order } : s
      ),
    }));
  }

  // ── Presenters ────────────────────────────────────────────────────────────────

  async function addPresenter(sectionId: number) {
    if (!newPresenterName.trim() || !newPresenterTopic.trim()) return;
    const section = conference.sections.find((s) => s.id === sectionId)!;
    setSaving(true);
    const res = await fetch("/api/presenters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sectionId,
        name: newPresenterName.trim(),
        topic: newPresenterTopic.trim(),
        supervisor: newPresenterSupervisor.trim() || null,
        position: newPresenterPosition.trim() || null,
        order: section.presenters.length + 1,
      }),
    });
    if (res.ok) {
      const p: Presenter = await res.json();
      setConference((c) => ({
        ...c,
        sections: c.sections.map((s) =>
          s.id === sectionId ? { ...s, presenters: [...s.presenters, p] } : s
        ),
      }));
      setNewPresenterName("");
      setNewPresenterTopic("");
      setNewPresenterSupervisor("");
      setNewPresenterPosition("");
      setAddPresenterSectionId(null);
      flash("Докладчик добавлен");
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setSaving(false);
  }

  async function deletePresenter(id: number, sectionId: number) {
    if (!confirm("Удалить этого докладчика вместе со всеми его оценками?")) return;
    const res = await fetch(`/api/presenters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        sections: c.sections.map((s) =>
          s.id === sectionId ? { ...s, presenters: s.presenters.filter((p) => p.id !== id) } : s
        ),
      }));
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
  }

  async function savePresenterEdit() {
    if (editTarget?.kind !== "presenter") return;
    if (!editTarget.name.trim() || !editTarget.topic.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/presenters/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editTarget.name.trim(),
        topic: editTarget.topic.trim(),
        supervisor: editTarget.supervisor.trim() || null,
        position: editTarget.position.trim() || null,
      }),
    });
    if (res.ok) {
      const supervisor = editTarget.supervisor.trim() || null;
      const position = editTarget.position.trim() || null;
      setConference((c) => ({
        ...c,
        sections: c.sections.map((s) =>
          s.id === editTarget.sectionId
            ? {
                ...s,
                presenters: s.presenters.map((p) =>
                  p.id === editTarget.id
                    ? { ...p, name: editTarget.name.trim(), topic: editTarget.topic.trim(), supervisor, position }
                    : p
                ),
              }
            : s
        ),
      }));
      setEditTarget(null);
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setEditSaving(false);
  }

  async function reorderPresenter(sectionId: number, presenterId: number, dir: "up" | "down") {
    const section = conference.sections.find((s) => s.id === sectionId)!;
    const sorted = [...section.presenters].sort(
      (a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const idx = sorted.findIndex((p) => p.id === presenterId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/presenters/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: b.order }) }),
      fetch(`/api/presenters/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: a.order }) }),
    ]);
    setConference((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              presenters: s.presenters.map((p) =>
                p.id === a.id ? { ...p, order: b.order } :
                p.id === b.id ? { ...p, order: a.order } : p
              ),
            }
          : s
      ),
    }));
  }

  // ── Jury members ──────────────────────────────────────────────────────────────

  async function addJuryMember() {
    if (!newJuryName.trim()) return;
    const password = randomAlphanumeric(8);
    setSaving(true);
    const res = await fetch(`/api/conferences/${conference.id}/jury`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newJuryName.trim(), password }),
    });
    if (res.ok) {
      const member: FullJuryMember = await res.json();
      setConference((c) => ({ ...c, juryMembers: [...c.juryMembers, member] }));
      setKnownCreds((kc) => ({ ...kc, [member.id]: { login: member.login, password } }));
      setCreatedCredentials({ name: newJuryName.trim(), login: member.login, password });
      setNewJuryName("");
    } else {
      const d = await res.json().catch(() => ({}));
      flashError(d.error || "Ошибка при добавлении члена жюри");
    }
    setSaving(false);
  }

  async function deleteJuryMember(id: number) {
    if (!confirm("Удалить этого члена жюри?")) return;
    const res = await fetch(`/api/jury/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConference((c) => ({ ...c, juryMembers: c.juryMembers.filter((j) => j.id !== id) }));
      setKnownCreds((kc) => { const n = { ...kc }; delete n[id]; return n; });
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
  }

  async function saveJuryEdit() {
    if (editTarget?.kind !== "jury") return;
    if (!editTarget.name.trim() || !editTarget.login.trim()) return;
    setEditSaving(true);
    const body: Record<string, string> = {
      name: editTarget.name.trim(),
      login: editTarget.login.trim(),
    };
    if (editTarget.newPassword.trim()) {
      body.password = editTarget.newPassword.trim();
    }
    const res = await fetch(`/api/jury/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setConference((c) => ({
        ...c,
        juryMembers: c.juryMembers.map((j) =>
          j.id === editTarget.id
            ? { ...j, name: updated.name, login: updated.login, plaintextPassword: updated.plaintextPassword ?? j.plaintextPassword }
            : j
        ),
      }));
      if (editTarget.newPassword.trim()) {
        setKnownCreds((kc) => ({
          ...kc,
          [editTarget.id]: { login: updated.login, password: editTarget.newPassword.trim() },
        }));
      } else {
        setKnownCreds((kc) =>
          kc[editTarget.id]
            ? { ...kc, [editTarget.id]: { ...kc[editTarget.id], login: updated.login } }
            : kc
        );
      }
      setEditTarget(null);
    } else {
      const d = await res.json().catch(() => ({}));
      flashError(d.error || "Ошибка при редактировании");
    }
    setEditSaving(false);
  }

  const copyCredentials = useCallback(
    (juryId: number, login: string, plaintextPassword: string | null | undefined) => {
      const password = plaintextPassword || knownCreds[juryId]?.password;
      const text = password
        ? `Логин: ${login}\nПароль: ${password}`
        : `Логин: ${login}`;
      navigator.clipboard.writeText(text).then(() => flash("Скопировано в буфер обмена"));
    },
    [knownCreds]
  );

  async function toggleSectionAssignment(juryId: number, sectionId: number, currently: boolean) {
    const jury = conference.juryMembers.find((j) => j.id === juryId)!;
    const currentIds = jury.sectionAssignments.map((a) => a.sectionId);
    const newIds = currently
      ? currentIds.filter((id) => id !== sectionId)
      : [...currentIds, sectionId];

    setAssignmentSaving(true);
    const res = await fetch(`/api/jury/${juryId}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionIds: newIds }),
    });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        juryMembers: c.juryMembers.map((j) =>
          j.id === juryId
            ? { ...j, sectionAssignments: newIds.map((sid) => ({ sectionId: sid })) }
            : j
        ),
      }));
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setAssignmentSaving(false);
  }

  // ── Criteria ──────────────────────────────────────────────────────────────────

  async function addCriterion() {
    setCriterionError("");
    const name = criterionName.trim();
    const minRaw = criterionMin || defaultMin;
    const maxRaw = criterionMax || defaultMax;
    if (!name || !minRaw || !maxRaw) return;
    const min = parseFloat(minRaw), max = parseFloat(maxRaw);
    if (min < 0) { setCriterionError("Минимальная оценка не может быть отрицательной"); return; }
    if (max <= min) { setCriterionError("Максимальная оценка должна быть больше минимальной"); return; }
    setSaving(true);
    const res = await fetch("/api/criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conferenceId: conference.id, name, minScore: min, maxScore: max }),
    });
    if (res.ok) {
      const c: Criterion = await res.json();
      const cWithZones: CriterionWithZones = { ...c, qualityZones: [] };
      setConference((conf) => ({
        ...conf,
        criteria: [...conf.criteria, cWithZones],
      }));
      setCriterionName("");
      setCriterionMin(useDefaultRange ? defaultMin : "");
      setCriterionMax(useDefaultRange ? defaultMax : "");
      flash("Критерий добавлен");
    } else setCriterionError((await res.json().catch(() => ({}))).error || "Ошибка");
    setSaving(false);
  }

  async function deleteCriterion(id: number) {
    if (!confirm("Удалить этот критерий вместе со всеми связанными оценками?")) return;
    const res = await fetch(`/api/criteria/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConference((c) => ({ ...c, criteria: c.criteria.filter((cr) => cr.id !== id) }));
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
  }

  async function saveCriterionEdit() {
    if (editTarget?.kind !== "criterion") return;
    const name = editTarget.name.trim();
    const min = parseFloat(editTarget.minScore), max = parseFloat(editTarget.maxScore);
    if (!name || isNaN(min) || isNaN(max) || min < 0 || max <= min) return;
    setEditSaving(true);
    const res = await fetch(`/api/criteria/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, minScore: min, maxScore: max }),
    });
    if (res.ok) {
      setConference((c) => ({
        ...c,
        criteria: c.criteria.map((cr) =>
          cr.id === editTarget.id ? { ...cr, name, minScore: min, maxScore: max } : cr
        ),
      }));
      setEditTarget(null);
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка");
    setEditSaving(false);
  }

  async function reorderCriterion(criterionId: number, dir: "up" | "down") {
    const sorted = sortedCriteria;
    const idx = sorted.findIndex((c) => c.id === criterionId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    // Build new ordered list by physically moving the item
    const newOrder = [...sorted];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(swapIdx, 0, moved);
    const criteriaIds = newOrder.map((c) => c.id);

    // Optimistic update: assign clean sequential orders locally
    const newOrderMap: Record<number, number> = {};
    newOrder.forEach((c, i) => { newOrderMap[c.id] = i; });
    setConference((conf) => ({
      ...conf,
      criteria: conf.criteria.map((cr) => ({ ...cr, order: newOrderMap[cr.id] ?? cr.order })),
    }));

    const res = await fetch(`/api/conferences/${conference.id}/criteria/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criteriaIds }),
    });
    if (!res.ok) {
      // Revert on failure
      setConference((conf) => ({
        ...conf,
        criteria: conf.criteria.map((cr) => {
          const original = sorted.find((s) => s.id === cr.id);
          return original ? { ...cr, order: original.order } : cr;
        }),
      }));
      flashError("Ошибка при изменении порядка критериев");
    }
  }

  // ── Quality zones ─────────────────────────────────────────────────────────────

  function openZoneEditor(c: CriterionWithZones) {
    setZoneEditorId(c.id);
    setZoneUseZones(c.useQualityZones);
    setZoneError("");

    if (c.qualityZones.length > 0) {
      // Criterion already has saved zones — show them as-is, no hint
      setZoneFromTemplate(false);
      setZoneRows(
        c.qualityZones.map((z) => ({
          id: z.id,
          label: z.label,
          minValue: String(z.minValue),
          maxValue: String(z.maxValue),
          color: z.color,
        }))
      );
    } else {
      // No saved zones — try to apply the conference template
      const hasTemplate = templateRows.length > 0 &&
        templateRows.some((t) => parseFloat(t.minPct) < parseFloat(t.maxPct) && t.label.trim());
      if (hasTemplate) {
        setZoneFromTemplate(true);
        setZoneRows(applyTemplate(templateRows, c.minScore, c.maxScore));
      } else {
        // Fall back to empty single row
        setZoneFromTemplate(false);
        setZoneRows([{ label: "", minValue: String(c.minScore), maxValue: String(c.maxScore), color: "#6b7280" }]);
      }
    }
  }

  function closeZoneEditor() {
    setZoneEditorId(null);
    setZoneRows([]);
    setZoneError("");
    setZoneFromTemplate(false);
  }

  function addZoneRow() {
    setZoneFromTemplate(false);
    setZoneRows((rows) => [...rows, { label: "", minValue: "", maxValue: "", color: "#6b7280" }]);
  }

  function removeZoneRow(i: number) {
    setZoneFromTemplate(false);
    setZoneRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  function updateZoneRow(i: number, field: keyof ZoneRow, value: string) {
    setZoneFromTemplate(false); // user started editing — clear hint
    setZoneRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function saveZones() {
    if (zoneEditorId === null) return;
    setZoneError("");
    const parsed = zoneRows.map((r) => ({
      id: r.id,
      label: r.label.trim(),
      minValue: parseFloat(r.minValue),
      maxValue: parseFloat(r.maxValue),
      color: r.color || "#6b7280",
      order: 0,
    }));

    // Basic per-row validation
    for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].label) { setZoneError(`Зона ${i + 1}: введите название`); return; }
      if (isNaN(parsed[i].minValue) || isNaN(parsed[i].maxValue)) { setZoneError(`Зона ${i + 1}: введите числа`); return; }
      if (parsed[i].minValue >= parsed[i].maxValue) { setZoneError(`Зона ${i + 1}: мин должен быть меньше макс`); return; }
    }

    // Strict boundary validation (no gaps, no overlaps, full coverage)
    if (parsed.length > 0) {
      const criterion = conference.criteria.find((c) => c.id === zoneEditorId);
      if (criterion) {
        if (parsed[0].minValue !== criterion.minScore) {
          setZoneError(`Первая зона должна начинаться с ${criterion.minScore}`);
          return;
        }
        if (parsed[parsed.length - 1].maxValue !== criterion.maxScore) {
          setZoneError(`Последняя зона должна заканчиваться на ${criterion.maxScore}`);
          return;
        }
        for (let i = 1; i < parsed.length; i++) {
          const expected = parsed[i - 1].maxValue + 1;
          if (parsed[i].minValue !== expected) {
            setZoneError(`Зона ${i + 1}: должна начинаться с ${expected}`);
            return;
          }
        }
      }
    }

    const withOrder = parsed.map((z, i) => ({ ...z, order: i }));

    setZoneSaving(true);
    const res = await fetch(`/api/criteria/${zoneEditorId}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones: withOrder, useQualityZones: zoneUseZones }),
    });
    if (res.ok) {
      const { criterion: updated, zones: savedZones } = await res.json();
      setConference((conf) => ({
        ...conf,
        criteria: conf.criteria.map((cr) =>
          cr.id === zoneEditorId
            ? { ...cr, useQualityZones: updated.useQualityZones, qualityZones: savedZones }
            : cr
        ),
      }));
      closeZoneEditor();
      flash("Зоны качества сохранены");
    } else {
      const d = await res.json().catch(() => ({}));
      setZoneError(d.error || "Ошибка при сохранении зон");
    }
    setZoneSaving(false);
  }

  // ── Quality zones template ────────────────────────────────────────────────────

  function addTemplateRow() {
    setTemplateRows((rows) => [
      ...rows,
      { label: "", minPct: "", maxPct: "", color: "#6b7280" },
    ]);
  }

  function removeTemplateRow(i: number) {
    setTemplateRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  function updateTemplateRow(i: number, field: keyof TemplateZoneRow, value: string) {
    setTemplateRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function saveTemplate() {
    setTemplateError("");
    for (let i = 0; i < templateRows.length; i++) {
      const r = templateRows[i];
      if (!r.label.trim()) { setTemplateError(`Зона ${i + 1}: введите название`); return; }
      const mn = parseFloat(r.minPct), mx = parseFloat(r.maxPct);
      if (isNaN(mn) || isNaN(mx)) { setTemplateError(`Зона ${i + 1}: введите проценты`); return; }
      if (mn < 0 || mx > 100) { setTemplateError(`Зона ${i + 1}: проценты должны быть от 0 до 100`); return; }
      if (mn >= mx) { setTemplateError(`Зона ${i + 1}: начало должно быть меньше конца`); return; }
    }
    setTemplateSaving(true);
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualityZonesTemplate: templateRows }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, qualityZonesTemplate: templateRows as unknown as typeof c.qualityZonesTemplate }));
      setTemplateOpen(false);
      flash("Шаблон зон сохранён");
    } else {
      setTemplateError("Ошибка при сохранении");
    }
    setTemplateSaving(false);
  }

  // ── Voting ────────────────────────────────────────────────────────────────────

  function handleVotingToggle(hallId: number, isOpen: boolean) {
    setConference((c) => ({
      ...c,
      halls: c.halls.map((h) =>
        h.id === hallId ? { ...h, votingStatus: { ...(h.votingStatus ?? { id: 0, hallId, createdAt: new Date(), updatedAt: new Date() }), isOpen } } : h
      ),
    }));
  }

  async function setAllVoting(isOpen: boolean) {
    const results = await Promise.all(
      conference.halls.map((h) =>
        fetch(`/api/halls/${h.id}/voting`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isOpen }),
        })
      )
    );
    if (results.every((r) => r.ok)) {
      setConference((c) => ({
        ...c,
        halls: c.halls.map((h) => ({
          ...h,
          votingStatus: { ...(h.votingStatus ?? { id: 0, hallId: h.id, createdAt: new Date(), updatedAt: new Date() }), isOpen },
        })),
      }));
    }
  }

  async function revertToActive() {
    if (!confirm("Вы уверены? Это снова откроет конференцию для редактирования.")) return;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, status: "ACTIVE" }));
      flash("Конференция возвращена в активный режим");
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────────

  async function saveConferenceEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || !editDate) return;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), date: editDate }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, name: editName.trim(), date: new Date(editDate) }));
      flash("Изменения сохранены");
    } else flashError((await res.json().catch(() => ({}))).error || "Ошибка при сохранении");
  }

  async function toggleResults() {
    const next = !conference.resultsPublished;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultsPublished: next }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, resultsPublished: next }));
      flash(next ? "Результаты опубликованы" : "Результаты скрыты");
    }
  }

  async function toggleUseDefaultRange() {
    const next = !useDefaultRange;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useDefaultRange: next }),
    });
    if (res.ok) {
      setUseDefaultRange(next);
      // When turning ON, pre-fill the per-criterion fields from the default range
      if (next) {
        setCriterionMin(defaultMin);
        setCriterionMax(defaultMax);
      } else {
        // When turning OFF, clear the per-criterion fields so they start empty
        setCriterionMin("");
        setCriterionMax("");
      }
    }
  }

  async function toggleUseSlider() {
    const next = !conference.useSlider;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useSlider: next }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, useSlider: next }));
    }
  }

  async function clearScores() {
    if (clearConfirmText !== "ОЧИСТИТЬ") return;
    setClearSaving(true);
    const res = await fetch(`/api/conferences/${conference.id}/scores`, { method: "DELETE" });
    if (res.ok) {
      setClearDialogOpen(false);
      setClearConfirmText("");
      flash("Все результаты голосования успешно очищены");
    } else {
      const d = await res.json().catch(() => ({}));
      flashError(d.error || "Ошибка при очистке результатов");
    }
    setClearSaving(false);
  }

  async function finishConference() {
    if (!confirm("Завершить конференцию? Голосование будет закрыто, результаты опубликованы.")) return;
    const res = await fetch(`/api/conferences/${conference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "FINISHED" }),
    });
    if (res.ok) {
      setConference((c) => ({ ...c, status: "FINISHED", resultsPublished: true }));
    }
  }

  // ── Dispatch edit save ────────────────────────────────────────────────────────

  function saveEdit() {
    if (!editTarget) return;
    if (editTarget.kind === "hall") saveHallEdit();
    else if (editTarget.kind === "section") saveSectionEdit();
    else if (editTarget.kind === "presenter") savePresenterEdit();
    else if (editTarget.kind === "criterion") saveCriterionEdit();
    else if (editTarget.kind === "jury") saveJuryEdit();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const tabs = [
    { key: "sections", label: `Секции (${conference.sections.length})` },
    { key: "halls", label: `Аудитории (${conference.halls.length})` },
    { key: "jury", label: `Члены жюри (${conference.juryMembers.length})` },
    { key: "criteria", label: `Критерии (${conference.criteria.length})` },
    { key: "settings", label: "Настройки" },
  ] as const;

  return (
    <div>
      {/* Credentials modal */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="font-bold text-lg text-gray-800 mb-1">Учётные данные созданы</h2>
            <p className="text-sm text-gray-500 mb-4">
              Сохраните — пароль можно скопировать позже через кнопку копирования.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 font-mono text-sm">
              {[
                { label: "Имя", value: createdCredentials.name },
                { label: "Логин", value: createdCredentials.login },
                { label: "Пароль", value: createdCredentials.password },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-gray-400 text-xs block">{label}</span>
                    <span className="text-gray-800 font-medium">{value}</span>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(value)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex-shrink-0"
                  >
                    Копировать
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      {/* Zone editor modal */}
      {zoneEditorId !== null && (() => {
        const criterion = conference.criteria.find((c) => c.id === zoneEditorId);
        if (!criterion) return null;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto">
            <div className="bg-white rounded-xl p-5 w-full max-w-lg shadow-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-lg text-gray-800">Зоны качества</h2>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{criterion.name} ({criterion.minScore}–{criterion.maxScore})</p>
                </div>
                <button onClick={closeZoneEditor} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
              </div>

              {/* Enable toggle */}
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setZoneUseZones((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${zoneUseZones ? "bg-blue-600" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${zoneUseZones ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">Показывать зоны жюри</span>
              </label>

              {/* Zone rows */}
              <div className="space-y-2 mb-3">
                {zoneRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={row.color}
                      onChange={(e) => updateZoneRow(i, "color", e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5 flex-shrink-0"
                      title="Цвет зоны"
                    />
                    <input
                      value={row.label}
                      onChange={(e) => updateZoneRow(i, "label", e.target.value)}
                      placeholder="Название"
                      maxLength={100}
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
                    />
                    <input
                      type="number"
                      value={row.minValue}
                      onChange={(e) => updateZoneRow(i, "minValue", e.target.value.replace(/[^0-9.-]/g, ""))}
                      onKeyDown={blockNonInteger}
                      placeholder="Мин"
                      className="w-16 flex-shrink-0 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-gray-400 flex-shrink-0">–</span>
                    <input
                      type="number"
                      value={row.maxValue}
                      onChange={(e) => updateZoneRow(i, "maxValue", e.target.value.replace(/[^0-9.-]/g, ""))}
                      onKeyDown={blockNonInteger}
                      placeholder="Макс"
                      className="w-16 flex-shrink-0 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeZoneRow(i)}
                      className="text-red-400 hover:text-red-600 flex-shrink-0 text-lg leading-none"
                      title="Удалить зону"
                    >×</button>
                  </div>
                ))}
              </div>

              <button onClick={addZoneRow} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Добавить зону
              </button>

              {zoneFromTemplate && (
                <p className="text-xs text-blue-500 mt-2 mb-2">Зоны заполнены из шаблона — можно изменить для этого критерия</p>
              )}

              {zoneError && <p className="text-xs text-red-500 mb-3 mt-2">{zoneError}</p>}
              {!zoneError && !zoneFromTemplate && <div className="mb-4" />}

              <div className="flex gap-2">
                <button
                  onClick={saveZones}
                  disabled={zoneSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {zoneSaving ? "Сохранение…" : "Сохранить"}
                </button>
                <button onClick={closeZoneEditor} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {msg && (
        <div className="mb-4 text-sm bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg">
          {msg}
        </div>
      )}
      {errMsg && (
        <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
          {errMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── СЕКЦИИ ─────────────────────────────────────────────────── */}
      {activeTab === "sections" && (
        <div className="space-y-4">
          {/* Add section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            {addSectionOpen ? (
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    autoFocus
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAddSectionOpen(false); setNewSectionName(""); } }}
                    placeholder="Название секции"
                    maxLength={256}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {newSectionName.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - newSectionName.length} символов</p>}
                </div>
                <button onClick={addSection} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                <button onClick={() => { setAddSectionOpen(false); setNewSectionName(""); }} className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">Отмена</button>
              </div>
            ) : (
              <button
                onClick={() => setAddSectionOpen(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Добавить секцию
              </button>
            )}
          </div>

          {sortedSections.length === 0 && (
            <p className="text-sm text-gray-400 px-1">Секций ещё нет.</p>
          )}

          {sortedSections.map((section, secIdx) => {
            const sortedPresenters = [...section.presenters].sort(
              (a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            const hallName = conference.halls.find((h) => h.id === section.hallId)?.name ?? null;
            return (
              <div key={section.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-full">
                {/* Section header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 gap-2 overflow-hidden">
                  {editTarget?.kind === "section" && editTarget.id === section.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <input autoFocus value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditTarget(null); }} maxLength={256} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {editTarget.name.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - editTarget.name.length} символов</p>}
                      </div>
                      <button onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                      <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">Отмена</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <span className="font-semibold text-gray-800 line-clamp-1 [overflow-wrap:anywhere]">{section.name}</span>
                      {hallName && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">{hallName}</span>
                      )}
                      <button onClick={() => setEditTarget({ kind: "section", id: section.id, name: section.name })} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">Изменить</button>
                    </div>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => reorderSection(section.id, "up")} disabled={secIdx === 0} className="px-1.5 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                    <button onClick={() => reorderSection(section.id, "down")} disabled={secIdx === sortedSections.length - 1} className="px-1.5 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                    <button onClick={() => deleteSection(section.id)} className="text-red-400 hover:text-red-600 text-xs ml-1">Удалить</button>
                  </div>
                </div>

                {/* Presenters */}
                <div className="px-3 py-2 space-y-1">
                  {sortedPresenters.length === 0 && (
                    <p className="text-xs text-gray-400 py-1">Докладчиков нет.</p>
                  )}
                  {sortedPresenters.map((p, pIdx) => (
                    <div key={p.id}>
                      {editTarget?.kind === "presenter" && editTarget.id === p.id ? (
                        <div className="flex gap-2 items-start py-1">
                          <div className="w-[28%]">
                            <input autoFocus value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} placeholder="Имя" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div className="flex-1 space-y-1">
                            <input value={editTarget.topic} onChange={(e) => setEditTarget({ ...editTarget, topic: e.target.value })} placeholder="Тема" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <input value={editTarget.position} onChange={(e) => setEditTarget({ ...editTarget, position: e.target.value })} placeholder="Должность / место учёбы (необязательно)" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <input value={editTarget.supervisor} onChange={(e) => setEditTarget({ ...editTarget, supervisor: e.target.value })} placeholder="Научный руководитель (необязательно)" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <button onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                          <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">×</button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-sm py-1 rounded hover:bg-gray-50">
                          <span className="text-gray-400 w-5 flex-shrink-0 pt-0.5">{p.order}.</span>
                          <div className="w-[28%]">
                            <div className="font-medium text-gray-700 break-words line-clamp-2">{p.name}</div>
                            {(p as Presenter & { position?: string | null }).position && (
                              <div className="text-xs text-gray-400 line-clamp-2 [overflow-wrap:anywhere]">{(p as Presenter & { position?: string | null }).position}</div>
                            )}
                            {p.supervisor && (
                              <div className="text-xs text-gray-400 line-clamp-2 [overflow-wrap:anywhere]">Науч. рук.: {p.supervisor}</div>
                            )}
                          </div>
                          <span className="flex-1 text-gray-500 break-words line-clamp-3">{p.topic}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setEditTarget({ kind: "presenter", id: p.id, sectionId: section.id, name: p.name, topic: p.topic, supervisor: p.supervisor ?? "", position: (p as Presenter & { position?: string | null }).position ?? "" })} className="text-gray-400 hover:text-gray-600 text-xs">Изм.</button>
                            <button onClick={() => reorderPresenter(section.id, p.id, "up")} disabled={pIdx === 0} className="px-1 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                            <button onClick={() => reorderPresenter(section.id, p.id, "down")} disabled={pIdx === sortedPresenters.length - 1} className="px-1 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                            <button onClick={() => deletePresenter(p.id, section.id)} className="text-red-400 hover:text-red-600">×</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {addPresenterSectionId === section.id ? (
                    <div className="flex gap-2 items-start mt-2">
                      <div className="w-[28%]">
                        <input autoFocus value={newPresenterName} onChange={(e) => setNewPresenterName(e.target.value)} placeholder="Имя докладчика" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <input value={newPresenterTopic} onChange={(e) => setNewPresenterTopic(e.target.value)} placeholder="Тема доклада" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input value={newPresenterPosition} onChange={(e) => setNewPresenterPosition(e.target.value)} placeholder="Должность / место учёбы (необязательно)" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input value={newPresenterSupervisor} onChange={(e) => setNewPresenterSupervisor(e.target.value)} placeholder="Научный руководитель (необязательно)" className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <button onClick={() => addPresenter(section.id)} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                      <button onClick={() => { setAddPresenterSectionId(null); setNewPresenterName(""); setNewPresenterTopic(""); setNewPresenterSupervisor(""); setNewPresenterPosition(""); }} className="text-gray-400 hover:text-gray-600 px-1 flex-shrink-0">×</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddPresenterSectionId(section.id)} className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">+ Добавить докладчика</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── АУДИТОРИИ ──────────────────────────────────────────────── */}
      {activeTab === "halls" && (
        <div className="space-y-6">
          {/* Global voting controls */}
          {conference.status === "ACTIVE" && conference.halls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAllVoting(true)}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Открыть голосование везде
              </button>
              <button
                onClick={() => setAllVoting(false)}
                className="px-4 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Закрыть голосование везде
              </button>
            </div>
          )}

          {/* Add hall */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-gray-700 mb-3">Добавить аудиторию</h3>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col">
                <input
                  value={hallName}
                  onChange={(e) => setHallName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHall()}
                  placeholder="Название аудитории"
                  maxLength={256}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {hallName.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - hallName.length} символов</p>}
              </div>
              <button
                onClick={addHall}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          </div>

          {conference.halls.length === 0 && (
            <p className="text-sm text-gray-400 px-1">Аудиторий ещё нет.</p>
          )}

          {conference.halls.map((hall) => {
            const assignedSections = conference.sections.filter((s) => s.hallId === hall.id);
            const unassignedSections = conference.sections.filter((s) => s.hallId === null);
            return (
              <div key={hall.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-full">
                {/* Hall header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 gap-2 overflow-hidden">
                  {editTarget?.kind === "hall" && editTarget.id === hall.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <input autoFocus value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditTarget(null); }} maxLength={256} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {editTarget.name.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - editTarget.name.length} символов</p>}
                      </div>
                      <button onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                      <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">Отмена</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <h3 className="font-semibold text-gray-800 truncate">{hall.name}</h3>
                      <button onClick={() => setEditTarget({ kind: "hall", id: hall.id, name: hall.name })} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">Изменить</button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {conference.status === "ACTIVE" && (
                      <VotingControl
                        hallId={hall.id}
                        isOpen={hall.votingStatus?.isOpen ?? false}
                        onToggle={handleVotingToggle}
                      />
                    )}
                    <button onClick={() => deleteHall(hall.id)} className="text-red-400 hover:text-red-600 text-sm">Удалить</button>
                  </div>
                </div>

                {/* Assigned sections */}
                <div className="p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Назначенные секции</p>
                  {assignedSections.length === 0 && (
                    <p className="text-xs text-gray-400 mb-3">Нет назначенных секций</p>
                  )}
                  <div className="space-y-1 mb-3">
                    {assignedSections.map((sec) => (
                      <div key={sec.id} className="flex items-center justify-between text-sm py-1 px-2 bg-blue-50 rounded-lg">
                        <span className="text-gray-700 truncate [overflow-wrap:anywhere]">{sec.name}</span>
                        <button
                          onClick={() => assignSectionToHall(sec.id, null)}
                          className="text-xs text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
                        >
                          Открепить
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Assign unassigned section */}
                  {unassignedSections.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val) assignSectionToHall(val, hall.id);
                          e.target.value = "";
                        }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Назначить секцию…</option>
                        {unassignedSections.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ЧЛЕНЫ ЖЮРИ ─────────────────────────────────────────────── */}
      {activeTab === "jury" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-gray-700 mb-3">Добавить члена жюри</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  value={newJuryName}
                  onChange={(e) => setNewJuryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addJuryMember()}
                  placeholder="Имя члена жюри"
                  maxLength={256}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {newJuryName.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - newJuryName.length} символов</p>}
              </div>
              <button
                onClick={addJuryMember}
                disabled={saving || !newJuryName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
              >
                Добавить
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Логин (5 симв.) и пароль (8 симв.) генерируются автоматически
            </p>
          </div>

          {conference.juryMembers.length === 0 ? (
            <p className="text-sm text-gray-400 px-1">Членов жюри ещё нет.</p>
          ) : (
            conference.juryMembers.map((j) => {
              const assignedIds = j.sectionAssignments.map((a) => a.sectionId);
              const assignedSections = conference.sections.filter((s) => assignedIds.includes(s.id));
              return (
                <div key={j.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-full">
                  <div className="px-4 py-3 overflow-hidden">
                    {editTarget?.kind === "jury" && editTarget.id === j.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input autoFocus value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} placeholder="Имя" maxLength={256} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            {editTarget.name.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - editTarget.name.length} символов</p>}
                          </div>
                          <input value={editTarget.login} onChange={(e) => setEditTarget({ ...editTarget, login: e.target.value })} placeholder="Логин" maxLength={50} className="w-32 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div className="flex gap-2 items-center">
                          <input value={editTarget.newPassword} onChange={(e) => setEditTarget({ ...editTarget, newPassword: e.target.value })} placeholder="Новый пароль (оставьте пустым чтобы не менять)" type="text" className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <button onClick={() => setEditTarget({ ...editTarget, newPassword: randomAlphanumeric(8) })} className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">Сгенерировать</button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50">Сохранить</button>
                          <button onClick={() => setEditTarget(null)} className="text-gray-500 hover:text-gray-700 text-sm">Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap overflow-hidden">
                            <span className="font-medium text-gray-800 truncate line-clamp-1 max-w-[12rem] [overflow-wrap:anywhere]">{j.name}</span>
                            <span className="text-gray-400 text-xs font-mono truncate max-w-[8rem]">@{j.login}</span>
                          </div>
                          {assignedSections.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {assignedSections.map((s) => (
                                <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.name}</span>
                              ))}
                            </div>
                          )}
                          {assignedSections.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">Секции не назначены</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          <button onClick={() => copyCredentials(j.id, j.login, j.plaintextPassword)} title="Скопировать логин и пароль" className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">Скопировать данные для входа</button>
                          <button onClick={() => setEditTarget({ kind: "jury", id: j.id, name: j.name, login: j.login, newPassword: "" })} className="text-gray-400 hover:text-gray-600 text-sm">Изменить</button>
                          <button onClick={() => deleteJuryMember(j.id)} className="text-red-400 hover:text-red-600 text-sm">Удалить</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {conference.sections.length > 0 && (
                    <div className="border-t border-gray-100">
                      <button
                        onClick={() => setAssigningJuryId(assigningJuryId === j.id ? null : j.id)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>Назначить секции</span>
                        <span>{assigningJuryId === j.id ? "▲" : "▼"}</span>
                      </button>
                      {assigningJuryId === j.id && (
                        <div className="px-4 pb-3 space-y-1">
                          {sortedSections.map((sec) => {
                            const assigned = assignedIds.includes(sec.id);
                            const hallName = conference.halls.find((h) => h.id === sec.hallId)?.name;
                            return (
                              <label key={sec.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={assigned} disabled={assignmentSaving} onChange={() => toggleSectionAssignment(j.id, sec.id, assigned)} className="rounded text-blue-600" />
                                <span className="text-sm text-gray-700">{sec.name}</span>
                                {hallName && <span className="text-xs text-gray-400">({hallName})</span>}
                                <span className="text-xs text-gray-400">— {sec.presenters.length} докл.</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── КРИТЕРИИ ───────────────────────────────────────────────── */}
      {activeTab === "criteria" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-gray-700 mb-3">Диапазон по умолчанию</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">от</span>
              <input type="number" value={defaultMin} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1"); setDefaultMin(v); if (useDefaultRange) setCriterionMin(v); }} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="0" min="0" step="1" className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-sm text-gray-500">до</span>
              <input type="number" value={defaultMax} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1"); setDefaultMax(v); if (useDefaultRange) setCriterionMax(v); }} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="10" min="1" step="1" className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none w-fit">
              <button
                type="button"
                onClick={toggleUseDefaultRange}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${useDefaultRange ? "bg-blue-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useDefaultRange ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-gray-600">Применять диапазон по умолчанию к новым критериям</span>
            </label>
          </div>

          {/* ── Шаблон степеней качества ──────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setTemplateOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div>
                <span className="font-medium text-gray-700">Шаблон степеней качества</span>
                {!templateOpen && (
                  <span className="ml-2 text-xs text-gray-400">
                    {templateRows.filter((r) => r.label.trim()).length > 0
                      ? `${templateRows.filter((r) => r.label.trim()).length} зон`
                      : "не задан"}
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm">{templateOpen ? "▲" : "▼"}</span>
            </button>

            {templateOpen && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mt-3 mb-3">
                  Задайте зоны в процентах (0–100%). При открытии редактора зон для критерия без сохранённых зон они будут рассчитаны автоматически на основе диапазона критерия.
                </p>

                <div className="space-y-2 mb-3">
                  {templateRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={row.color}
                        onChange={(e) => updateTemplateRow(i, "color", e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5 flex-shrink-0"
                        title="Цвет зоны"
                      />
                      <input
                        value={row.label}
                        onChange={(e) => updateTemplateRow(i, "label", e.target.value)}
                        placeholder="Название"
                        maxLength={100}
                        className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
                      />
                      <input
                        type="number"
                        value={row.minPct}
                        onChange={(e) => updateTemplateRow(i, "minPct", e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="0"
                        min="0"
                        max="100"
                        className="w-14 flex-shrink-0 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-xs flex-shrink-0">%–</span>
                      <input
                        type="number"
                        value={row.maxPct}
                        onChange={(e) => updateTemplateRow(i, "maxPct", e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="100"
                        min="0"
                        max="100"
                        className="w-14 flex-shrink-0 border border-gray-300 rounded px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-xs flex-shrink-0">%</span>
                      <button
                        onClick={() => removeTemplateRow(i)}
                        className="text-red-400 hover:text-red-600 flex-shrink-0 text-lg leading-none"
                        title="Удалить зону"
                      >×</button>
                    </div>
                  ))}
                </div>

                <button onClick={addTemplateRow} className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-3">
                  + Добавить зону
                </button>

                {templateError && <p className="text-xs text-red-500 mb-2">{templateError}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={saveTemplate}
                    disabled={templateSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    {templateSaving ? "Сохранение…" : "Сохранить шаблон"}
                  </button>
                  <button
                    onClick={() => { setTemplateOpen(false); setTemplateError(""); }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2"
                  >
                    Свернуть
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-gray-700 mb-3">Добавить критерий</h3>
            <div className="flex gap-2 items-start flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <input value={criterionName} onChange={(e) => setCriterionName(e.target.value)} placeholder="Название критерия" maxLength={256} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {criterionName.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - criterionName.length} символов</p>}
              </div>
              <div className="flex flex-col gap-0.5">
                <input type="number" value={criterionMin} onChange={(e) => setCriterionMin(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1"))} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="Мин" min="0" step="1" className={`w-20 border rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500 ${useDefaultRange && criterionMin !== "" ? "border-blue-300 bg-blue-50" : "border-gray-300"}`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <input type="number" value={criterionMax} onChange={(e) => setCriterionMax(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1"))} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="Макс" min="1" step="1" className={`w-20 border rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500 ${useDefaultRange && criterionMax !== "" ? "border-blue-300 bg-blue-50" : "border-gray-300"}`} />
              </div>
              <button onClick={addCriterion} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 self-start">Добавить</button>
            </div>
            {useDefaultRange && (criterionMin !== "" || criterionMax !== "") && (
              <p className="text-xs text-blue-500 mt-2">Заполнено из диапазона по умолчанию — можно изменить</p>
            )}
            {criterionError && <p className="text-xs text-red-500 mt-2">{criterionError}</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {conference.criteria.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">Критерии ещё не добавлены.</p>
            ) : (
              sortedCriteria.map((c, cIdx) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-2 overflow-hidden max-w-full">
                  {editTarget?.kind === "criterion" && editTarget.id === c.id ? (
                    <div className="flex items-start gap-2 flex-1 mr-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <input autoFocus value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} placeholder="Название" maxLength={256} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {editTarget.name.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - editTarget.name.length} символов</p>}
                      </div>
                      <input type="number" value={editTarget.minScore} onChange={(e) => setEditTarget({ ...editTarget, minScore: e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1") })} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="Мин" className="w-16 flex-shrink-0 border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="number" value={editTarget.maxScore} onChange={(e) => setEditTarget({ ...editTarget, maxScore: e.target.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1") })} onKeyDown={blockNonInteger} onInput={stripNonInteger} placeholder="Макс" className="w-16 flex-shrink-0 border border-gray-300 rounded px-2 py-1 text-sm text-black focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={saveEdit} disabled={editSaving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex-shrink-0">Сохранить</button>
                      <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">Отмена</button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 min-w-0 flex-1 overflow-hidden">
                      <span className="text-gray-400 text-sm font-mono flex-shrink-0 w-5 pt-0.5">{cIdx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-700 break-words [overflow-wrap:anywhere]">{c.name}</span>
                          <span className="text-sm text-gray-400 flex-shrink-0">({c.minScore}–{c.maxScore})</span>
                          {c.useQualityZones && c.qualityZones.length > 0 && (
                            <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
                              {c.qualityZones.map((z) => (
                                <span key={z.id} className="w-2 h-2 rounded-full inline-block" style={{ background: z.color }} title={z.label} />
                              ))}
                              <span className="ml-0.5">зоны</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openZoneEditor(c)} className="text-purple-500 hover:text-purple-700 text-xs whitespace-nowrap">Зоны</button>
                        <button onClick={() => setEditTarget({ kind: "criterion", id: c.id, name: c.name, minScore: String(c.minScore), maxScore: String(c.maxScore) })} className="text-gray-400 hover:text-gray-600 text-xs">Изменить</button>
                      </div>
                    </div>
                  )}
                  {!(editTarget?.kind === "criterion" && editTarget.id === c.id) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => reorderCriterion(c.id, "up")} disabled={cIdx === 0} className="px-1.5 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                      <button onClick={() => reorderCriterion(c.id, "down")} disabled={cIdx === sortedCriteria.length - 1} className="px-1.5 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                      <button onClick={() => deleteCriterion(c.id)} className="text-red-400 hover:text-red-600 text-sm ml-1">Удалить</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── НАСТРОЙКИ ──────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-4 max-w-md">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-gray-700 mb-3">Редактировать конференцию</h3>
            <form onSubmit={saveConferenceEdit} className="space-y-3">
              <div>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Название конференции" maxLength={256} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                {editName.length > 200 && <p className="text-xs text-gray-400 mt-0.5">остаток: {256 - editName.length} символов</p>}
              </div>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">Сохранить изменения</button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-gray-700">Ползунок при оценивании</p>
                <p className="text-sm text-gray-400">Показывать ползунок в интерфейсе жюри</p>
              </div>
              <button
                type="button"
                onClick={toggleUseSlider}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${conference.useSlider ? "bg-blue-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conference.useSlider ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </label>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">Опубликовать результаты</p>
                <p className="text-sm text-gray-400">Сделать видимыми на публичной странице</p>
              </div>
              <button onClick={toggleResults} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${conference.resultsPublished ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                {conference.resultsPublished ? "Скрыть результаты" : "Опубликовать результаты"}
              </button>
            </div>
          </div>

          {conference.status === "ACTIVE" && (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-red-700 flex items-center gap-1.5">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    Очистить результаты голосования
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">Удалить все выставленные оценки всех членов жюри</p>
                </div>
                <button
                  onClick={() => setClearDialogOpen(true)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0 ml-3"
                >
                  Очистить
                </button>
              </div>
              {clearDialogOpen && (
                <div className="mt-4 pt-4 border-t border-red-100">
                  <p className="text-sm text-red-700 font-medium mb-2">
                    Вы уверены? Это удалит ВСЕ выставленные оценки всех членов жюри. Это действие необратимо.
                  </p>
                  <p className="text-sm text-gray-500 mb-2">Введите «ОЧИСТИТЬ» для подтверждения:</p>
                  <input
                    type="text"
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="ОЧИСТИТЬ"
                    className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm text-black mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setClearDialogOpen(false); setClearConfirmText(""); }}
                      className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={clearScores}
                      disabled={clearConfirmText !== "ОЧИСТИТЬ" || clearSaving}
                      className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {clearSaving ? "Очистка…" : "Очистить все оценки"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {conference.status === "ACTIVE" && (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-700">Завершить конференцию</p>
                  <p className="text-sm text-gray-400">Закрывает голосование, публикует результаты</p>
                </div>
                <button onClick={finishConference} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">Завершить</button>
              </div>
            </div>
          )}

          {conference.status === "FINISHED" && (
            <div className="bg-white rounded-xl shadow-sm border border-yellow-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-700">Конференция завершена</p>
                  <p className="text-sm text-gray-400">Вернуть в активный режим для редактирования</p>
                </div>
                <button onClick={revertToActive} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100">
                  Вернуть в активный режим
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
