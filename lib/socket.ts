import { Server as SocketServer } from "socket.io";

function getIO(): SocketServer | null {
  return (global as { io?: SocketServer }).io ?? null;
}

// ── Generic conference-room emitter ───────────────────────────────────────────
// All entity events go to conference-${conferenceId} so both jury and organizer
// clients subscribed to that room receive them.
export function emitConferenceEvent(
  conferenceId: number,
  event: string,
  payload: Record<string, unknown> = {}
) {
  getIO()
    ?.to(`conference-${conferenceId}`)
    .emit(event, { conferenceId, ...payload });
}

// ── Legacy targeted emitters (kept for backward compat) ─────────────────────

export function emitScoreUpdate(
  hallId: number,
  data: {
    conferenceId: number;
    sectionId: number;
    presenterId: number;
    criterionId: number;
    juryMemberId: number;
    value: number | null;
  }
) {
  // Emit to both hall room (jury scoring page) and conference room (results page)
  getIO()?.to(`hall-${hallId}`).emit("score-update", data);
  getIO()
    ?.to(`conference-${data.conferenceId}`)
    .emit("score:updated", {
      conferenceId: data.conferenceId,
      hallId,
      sectionId: data.sectionId,
      presenterId: data.presenterId,
    });
  getIO()?.to("results").emit("score-update", data);
}

export function emitVotingStatus(
  conferenceId: number,
  hallId: number,
  isOpen: boolean
) {
  getIO()?.to(`hall-${hallId}`).emit("voting-status", { hallId, isOpen });
  getIO()
    ?.to(`conference-${conferenceId}`)
    .emit("voting:changed", { conferenceId, hallId, isOpen });
  getIO()?.to("results").emit("voting-status", { hallId, isOpen });
}

export function emitResultsPublished(conferenceId: number) {
  getIO()?.to("results").emit("results-published", { conferenceId });
  getIO()
    ?.to(`conference-${conferenceId}`)
    .emit("conference:status:changed", {
      conferenceId,
      status: "FINISHED",
      resultsPublished: true,
    });
}
