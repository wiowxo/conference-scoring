"use client";
import { useState } from "react";

export default function VotingControl({
  hallId,
  isOpen,
  onToggle,
}: {
  hallId: number;
  isOpen: boolean;
  onToggle: (hallId: number, isOpen: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/halls/${hallId}/voting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isOpen: !isOpen }),
    });
    if (res.ok) {
      onToggle(hallId, !isOpen);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs font-medium px-3 py-1 rounded-full transition-colors disabled:opacity-50 ${
        isOpen
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {loading ? "…" : isOpen ? "Голосование ОТКРЫТО" : "Голосование ЗАКРЫТО"}
    </button>
  );
}
