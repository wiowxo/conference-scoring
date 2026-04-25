"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // No URL — connects to the same host that served the page.
    // Works on localhost, LAN IP, VPS domain, or any other host.
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
