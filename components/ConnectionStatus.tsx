"use client";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket-client";

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-md border border-gray-100 text-xs font-medium z-50">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : "bg-red-500 animate-pulse"
        }`}
      />
      <span className={connected ? "text-green-700" : "text-red-600"}>
        {connected ? "Онлайн" : "Нет соединения"}
      </span>
    </div>
  );
}
